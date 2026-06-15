#!/usr/bin/env python3
"""
Appetito Box → FritOS bridge | Étape 1 : capture brute.

Écoute sur le port 9100 (standard ESC/POS imprimante réseau) et sauvegarde
chaque "impression" reçue dans deux fichiers : un binaire brut (.bin) et un
view ASCII lisible (.txt) avec les commandes ESC/POS échappées en hex.

Usage sur Raspberry Pi 4 :
    sudo python3 capture.py

Ensuite, dans l'app Appetito Box → Paramètres → Imprimante :
    Type     : réseau / Wi-Fi / TCP
    IP       : <IP fixe du Pi sur le réseau friterie>
    Port     : 9100

Faire 1-2 commandes test, puis copier le contenu de /home/pi/captures/
et l'envoyer à Claude pour construire le parser.
"""

import socketserver
import sys
from datetime import datetime
from pathlib import Path

# Stockage des captures — chaque ticket = 1 .bin + 1 .txt horodatés
CAPTURE_DIR = Path.home() / "captures"
CAPTURE_DIR.mkdir(exist_ok=True)

PORT = 9100  # standard ESC/POS sur TCP
# CP437 (ou cp858 selon imprimante) est l'encoding par défaut des imprimantes
# thermiques. Permet de garder les chars accentués pour parsing ultérieur.
PRINTER_ENCODING = "cp437"


def render_text_view(data: bytes) -> str:
    """Texte lisible : commandes ESC/POS en hex entre crochets, reste en cp437."""
    out: list[str] = []
    i = 0
    n = len(data)
    while i < n:
        b = data[i]
        # ESC = 0x1B → commande de 2-3+ octets (on prend juste les 2 suivants par défaut)
        if b == 0x1B:
            chunk = data[i:i + 3]
            out.append(f"[ESC {' '.join(f'{c:02X}' for c in chunk[1:])}]")
            i += 3
        # GS = 0x1D → groupe séparateur (commande étendue)
        elif b == 0x1D:
            chunk = data[i:i + 3]
            out.append(f"[GS {' '.join(f'{c:02X}' for c in chunk[1:])}]")
            i += 3
        # LF / CR → on garde tels quels
        elif b in (0x0A, 0x0D):
            out.append(chr(b))
            i += 1
        # Autres bytes de contrôle < 0x20 (sauf tab 0x09) → hex
        elif b < 0x20 and b != 0x09:
            out.append(f"[{b:02X}]")
            i += 1
        # Texte normal
        else:
            try:
                out.append(bytes([b]).decode(PRINTER_ENCODING))
            except Exception:
                out.append(f"[{b:02X}]")
            i += 1
    return "".join(out)


class ESCPOSHandler(socketserver.BaseRequestHandler):
    def handle(self):
        # On lit jusqu'à fermeture de la connexion (Appetito enverra le ticket
        # complet puis fermera) ou jusqu'à un délai d'inactivité de 2 sec.
        self.request.settimeout(30.0)  # large : Appetito print peut prendre 20+s à transmettre via BT
        data = b""
        while True:
            try:
                chunk = self.request.recv(4096)
            except TimeoutError:
                break
            if not chunk:
                break
            data += chunk
            if len(data) > 200_000:  # safety cap : 200 KB max par ticket
                break

        if not data:
            return

        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        ip = self.client_address[0]
        bin_path = CAPTURE_DIR / f"{ts}__from_{ip}.bin"
        txt_path = CAPTURE_DIR / f"{ts}__from_{ip}.txt"

        bin_path.write_bytes(data)
        txt_path.write_text(render_text_view(data), encoding="utf-8")

        print(f"[{ts}] {len(data):>5} bytes from {ip} → {bin_path.name}")
        sys.stdout.flush()

        # Auto-trigger process_ticket.py en background pour les tickets > 50KB
        # (les petits ne sont pas des tickets Appetito complets). Logs envoyés
        # dans /tmp/process_ticket.log pour debug post-mortem.
        if len(data) > 50_000:
            try:
                import subprocess
                log_path = "/tmp/process_ticket.log"
                with open(log_path, "ab") as logf:
                    logf.write(f"\n===== {ts} {bin_path.name} =====\n".encode())
                    subprocess.Popen(
                        ["python3", "/home/pi/fritos-bridge/process_ticket.py", str(bin_path)],
                        stdout=logf,
                        stderr=subprocess.STDOUT,
                        start_new_session=True,
                    )
                print(f"[{ts}] → process_ticket spawned for {bin_path.name} (logs: {log_path})")
                sys.stdout.flush()
            except Exception as e:
                print(f"[{ts}] ✕ failed to spawn process_ticket: {e}")
                sys.stdout.flush()


def main():
    print(f"Capture dir : {CAPTURE_DIR}")
    print(f"Listening on 0.0.0.0:{PORT} (ESC/POS Raw)")
    print("Configure l'app Appetito Box vers cette IP:port, puis fais une commande test.")
    print("Ctrl-C pour arrêter.\n")
    sys.stdout.flush()

    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), ESCPOSHandler) as server:
        server.allow_reuse_address = True
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nArrêt propre.")


if __name__ == "__main__":
    main()
