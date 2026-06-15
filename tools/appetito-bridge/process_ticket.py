#!/usr/bin/env python3
"""
Process Appetito ticket : .bin → PNG → OCR → parse → POST FritOS.

Pipeline :
  1. Lit un fichier .bin de capture STAR raster (depuis /root/captures/)
  2. Décode via decode_star_raster() → PIL Image
  3. Lance Tesseract OCR en français → texte
  4. Parse les sections (restaurant, client, items, paiement) via regex
  5. POST vers FritOS /api/orders/from-appetito

Usage :
  python3 process_ticket.py /root/captures/20260615_092615_936__from_127.0.0.1.bin

Config (env vars) :
  - FRITOS_API_URL              ex. https://frit-os.vercel.app
  - FRITOS_ESTABLISHMENT_ID     UUID établissement Boussu
  - APPETITO_BRIDGE_TOKEN       token partagé avec Vercel
"""

import os
import re
import sys
import json
import urllib.request
from datetime import datetime, timezone, timedelta
from io import BytesIO
from pathlib import Path

# Import decoder local (même dossier)
sys.path.insert(0, str(Path(__file__).parent))
from decode_star import decode_star_raster

# Tesseract via subprocess (pas de dépendance pytesseract pour rester stdlib+PIL+requests)
import subprocess

# ─── Config ─────────────────────────────────────────────────────────────────
FRITOS_API_URL = os.environ.get("FRITOS_API_URL", "https://frit-os.vercel.app")
ESTABLISHMENT_ID = os.environ.get("FRITOS_ESTABLISHMENT_ID", "")
BRIDGE_TOKEN = os.environ.get("APPETITO_BRIDGE_TOKEN", "")
TESSERACT_LANG = "fra"

# ─── OCR ────────────────────────────────────────────────────────────────────

def run_ocr(img) -> str:
    """Tesseract OCR sur une PIL Image, retourne le texte brut."""
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    proc = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", TESSERACT_LANG, "--psm", "6"],
        input=buf.read(),
        capture_output=True,
        check=False,
    )
    return proc.stdout.decode("utf-8", errors="replace")

# ─── Parser ─────────────────────────────────────────────────────────────────

# Heuristique : remplace les 8/6 par 0 dans les patterns numériques où c'est
# très probable. Tesseract confond systématiquement la police Appetito sur 0.
def fix_zeros(s: str) -> str:
    """Corrige les chiffres OCR ambigus dans un fragment numérique."""
    return s.replace("8", "0").replace("6", "0")

ORDER_TYPES = {
    "EMPORTER": "takeaway",
    "EMPORT": "takeaway",
    "LIVRAISON": "delivery",
    "LIVRER": "delivery",
    "SUR PLACE": "eat_in",
}

def parse_ticket(text: str) -> dict:
    """Extrait les infos commande depuis le texte OCR Appetito."""
    lines = [l.rstrip() for l in text.split("\n")]
    out = {
        "appetitoOrderId": None,
        "orderType": "takeaway",
        "scheduledTime": None,
        "customer": {"name": None, "phone": None, "address": None},
        "items": [],
        "subtotal": 0.0,
        "total": 0.0,
        "paymentMethod": "cash",
        "notes": None,
    }

    # ─── N° commande #XXXXXX ─────────────────────────────────────────────────
    for l in lines:
        m = re.search(r"#([A-Z0-9]{4,12})", l)
        if m:
            out["appetitoOrderId"] = m.group(1)
            break

    # ─── Type de commande ────────────────────────────────────────────────────
    full_upper = " ".join(l.upper() for l in lines)
    for key, val in ORDER_TYPES.items():
        if key in full_upper:
            out["orderType"] = val
            break

    # ─── Heure prévue : "JJ/MM/AA HH:MM" après le type "À EMPORTER AUJOURD'HUI"
    for i, l in enumerate(lines):
        m = re.search(r"(\d{2})/(\d{2})/(\d{2})\s+(\d{1,2}):(\d{2})", l)
        if m:
            day, mon, yr, hh, mm = m.groups()
            # Corrections OCR fréquentes
            day_f = fix_zeros(day) if int(day) > 31 else day
            mon_f = fix_zeros(mon) if int(mon) > 12 else mon
            hh_f  = fix_zeros(hh)  if int(hh) > 23  else hh
            try:
                # Année à 2 chiffres → +2000
                dt = datetime(2000 + int(yr), int(mon_f), int(day_f),
                              int(hh_f), int(mm),
                              tzinfo=timezone(timedelta(hours=2)))  # Brussels CEST
                out["scheduledTime"] = dt.isoformat()
                break
            except ValueError:
                continue

    # ─── Client : 2 lignes après le restaurant (nom + tél) ──────────────────
    # Heuristique : tel commence par "+32" ou "04" ou "0" ; nom = ligne juste
    # avant qui ne contient pas que des chiffres.
    for i, l in enumerate(lines):
        m_phone = re.search(r"(\+32\s*[\d\s]{8,}|0\d{2}[\s\d]{7,}|\+\d{2,3}\s*\d[\d\s]+)", l)
        if m_phone:
            # Nom = ligne précédente non vide, non capitales (≠ titres)
            phone_raw = re.sub(r"[^\d+]", "", m_phone.group(1))
            out["customer"]["phone"] = phone_raw
            for j in range(i - 1, max(i - 4, -1), -1):
                cand = lines[j].strip()
                if cand and not re.match(r"^[\d\s\+\-./]+$", cand) and "Mdjambo" not in cand and "appetito" not in cand.lower():
                    if not any(k in cand.upper() for k in ["RUE", "AVENUE", "BOULEVARD", "TÉL"]):
                        out["customer"]["name"] = cand
                        break
            break

    # ─── Items : parser ligne par ligne ─────────────────────────────────────
    # Format observé :
    #   Sauces                       ← catégorie (ligne courte, capitale)
    #   1x Mayonnaise         1,10 € ← item
    #   Frites                       ← catégorie
    #   1x Frites             3,90 € ← item
    #   Smashburgers                 ← catégorie
    #   1x Mdjambo burger    14,40 € ← item
    #     Sauces                     ← sous-catégorie d'options
    #     * Mayonnaise               ← option
    #     Crudités
    #     * Salade
    #     Suppléments
    #     * Provolone
    #     + Frites en supplément
    ITEM_RE = re.compile(r"^(\d+)x\s+(.+?)\s+(\d+[,\.]\d{2})\s*[€:]*\s*$")
    OPTION_RE = re.compile(r"^\s*[*+•·\-]\s+(.+?)\s*$")
    SUBSECTION_RE = re.compile(r"^(Sauces|Crudités|Suppléments|Boissons|Sauce|Crudite|Supplement)s?\s*$", re.IGNORECASE)
    TOTAL_RE = re.compile(r"^(Total|TOTAL|Sous-total|Sous total)\s+(\d+[,\.]\d{2})", re.IGNORECASE)

    current_category = None
    current_item = None
    in_options = False

    for l in lines:
        s = l.strip()
        if not s:
            continue

        # Total / sous-total : on sort de la liste items
        m_tot = TOTAL_RE.match(s)
        if m_tot:
            label = m_tot.group(1).lower()
            val = float(m_tot.group(2).replace(",", "."))
            if "sous" in label:
                out["subtotal"] = val
            else:
                out["total"] = val
            current_item = None
            in_options = False
            continue

        # Option (commence par * + • etc)
        m_opt = OPTION_RE.match(s)
        if m_opt and current_item is not None:
            current_item["options"].append(m_opt.group(1).strip())
            continue

        # Item
        m_item = ITEM_RE.match(s)
        if m_item:
            qty = int(m_item.group(1))
            name = m_item.group(2).strip()
            try:
                price = float(m_item.group(3).replace(",", "."))
            except ValueError:
                price = 0.0
            current_item = {
                "productName": name,
                "quantity": qty,
                "unitPrice": price,
                "category": current_category,
                "options": [],
            }
            out["items"].append(current_item)
            in_options = True
            continue

        # Sous-section "Sauces" / "Crudités" / "Suppléments" → fait partie des options
        if SUBSECTION_RE.match(s) and in_options:
            continue

        # Catégorie (ligne courte, pas une option, pas un total)
        if (not m_opt and not m_item
                and not s.startswith(("Date", "Ceci", "Frais", "Total", "A PAYER", "À PAYER"))
                and "Mdjambo" not in s and "Tél" not in s
                and 2 < len(s) < 40
                and out["appetitoOrderId"] is not None):  # commence après le n° cmd
            current_category = s
            current_item = None
            in_options = False

    # ─── Paiement ───────────────────────────────────────────────────────────
    if "A PAYER" in full_upper or "À PAYER" in full_upper:
        out["paymentMethod"] = "cash"
    elif "PAYE" in full_upper or "PAYÉ" in full_upper:
        out["paymentMethod"] = "paid"

    return out

# ─── HTTP POST FritOS ───────────────────────────────────────────────────────

def post_to_fritos(payload: dict) -> dict:
    if not ESTABLISHMENT_ID or not BRIDGE_TOKEN:
        return {"ok": False, "error": "FRITOS_ESTABLISHMENT_ID ou APPETITO_BRIDGE_TOKEN non set"}

    payload = {**payload, "establishmentId": ESTABLISHMENT_ID}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{FRITOS_API_URL.rstrip('/')}/api/orders/from-appetito",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Bridge-Token": BRIDGE_TOKEN,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"ok": True, "status": resp.status, "body": json.loads(resp.read())}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "body": e.read().decode("utf-8", errors="replace")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ─── Main ───────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: process_ticket.py <ticket.bin> [--dry-run]")
        sys.exit(1)
    src = Path(sys.argv[1])
    dry_run = "--dry-run" in sys.argv

    print(f"[1/4] Lecture {src} ({src.stat().st_size} bytes)…")
    data = src.read_bytes()

    print("[2/4] Décodage STAR raster → image…")
    img = decode_star_raster(data)
    png_path = src.with_suffix(".png")
    img.save(png_path)
    print(f"      {img.size[0]}×{img.size[1]} px → {png_path}")

    print("[3/4] Tesseract OCR (fra)…")
    text = run_ocr(img)
    txt_path = src.with_suffix(".ocr.txt")
    txt_path.write_text(text)
    print(f"      {len(text)} chars → {txt_path}")

    print("[4/4] Parse + POST FritOS…")
    parsed = parse_ticket(text)
    parsed["rawTicketPath"] = str(src)

    print(json.dumps(parsed, ensure_ascii=False, indent=2))

    if dry_run:
        print("\n--dry-run actif : pas de POST FritOS.")
        return

    result = post_to_fritos(parsed)
    print("\n=== POST result ===")
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
