#!/bin/bash
#
# Flash + préconfigure une carte SD pour Raspberry Pi 4
# avec FritOS Appetito Bridge.
#
# Hostname        : fritos-bridge
# User / password : pi / fritos2026
# Réseau          : Ethernet (DHCP par défaut)
# Service         : appetito-bridge (auto-démarré au 1er boot)
#
# Usage :
#   sudo bash flash-pi-fritos-bridge.sh /dev/sdc
#
# ⚠️ DANGER : le script écrase tout le contenu de la carte. Vérifie bien
# que tu donnes le bon device. Lance `lsblk` avant pour confirmer.

set -e

SD=${1:-/dev/sdc}
HOSTNAME="fritos-bridge"
USERNAME="pi"
PASSWORD="fritos2026"
BRIDGE_SRC="/home/jinxed/work/fritos/tools/appetito-bridge"
IMG_URL="https://downloads.raspberrypi.com/raspios_lite_arm64_latest"
IMG_FILE="/tmp/rpios.img.xz"
BOOT_MNT="/mnt/sd-boot"
ROOT_MNT="/mnt/sd-root"

# ─── Sanity checks ──────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo "❌ Lance avec sudo."
  exit 1
fi
if [ ! -b "$SD" ]; then
  echo "❌ Device $SD n'existe pas."
  exit 1
fi
if [ ! -d "$BRIDGE_SRC" ]; then
  echo "❌ $BRIDGE_SRC introuvable (clone du repo FritOS attendu)."
  exit 1
fi

echo "════════════════════════════════════════════════════════════════"
echo " Flash Raspberry Pi 4 → fritos-bridge"
echo "────────────────────────────────────────────────────────────────"
echo " Cible        : $SD"
lsblk -d -o NAME,SIZE,MODEL "$SD" || true
echo " Hostname     : $HOSTNAME"
echo " User         : $USERNAME / $PASSWORD"
echo "════════════════════════════════════════════════════════════════"
read -p "Confirme l'écrasement complet de $SD (tape OUI) : " CONFIRM
if [ "$CONFIRM" != "OUI" ]; then
  echo "Annulé."
  exit 1
fi

# ─── 1. Démonter toute partition existante ──────────────────────────────────
echo ""
echo "[1/5] Démontage partitions existantes…"
umount "${SD}"* 2>/dev/null || true

# ─── 2. Télécharger l'image si pas déjà là ──────────────────────────────────
echo ""
echo "[2/5] Téléchargement image (skip si déjà en cache)…"
if [ ! -f "$IMG_FILE" ] || [ ! -s "$IMG_FILE" ]; then
  apt-get install -y -qq xz-utils wget openssl >/dev/null
  wget --show-progress -O "$IMG_FILE" "$IMG_URL"
else
  echo "  ✓ $IMG_FILE déjà présent ($(du -h $IMG_FILE | cut -f1))"
fi

# ─── 3. Flasher ─────────────────────────────────────────────────────────────
echo ""
echo "[3/5] Flash de $SD (5-10 min, sois patient)…"
xzcat "$IMG_FILE" | dd of="$SD" bs=4M status=progress conv=fsync
sync
partprobe "$SD"
sleep 3

# ─── 4. Préconfigurer ───────────────────────────────────────────────────────
echo ""
echo "[4/5] Préconfiguration (SSH, user, hostname, bridge)…"
mkdir -p "$BOOT_MNT" "$ROOT_MNT"
mount "${SD}1" "$BOOT_MNT"
mount "${SD}2" "$ROOT_MNT"

# SSH
touch "$BOOT_MNT/ssh"

# User + password
HASHED=$(openssl passwd -6 "$PASSWORD")
echo "${USERNAME}:${HASHED}" > "$BOOT_MNT/userconf.txt"

# Hostname
echo "$HOSTNAME" > "$ROOT_MNT/etc/hostname"
sed -i "s/raspberrypi/${HOSTNAME}/g" "$ROOT_MNT/etc/hosts"

# Bridge files
mkdir -p "$ROOT_MNT/home/pi/fritos-bridge"
cp "$BRIDGE_SRC/capture.py"               "$ROOT_MNT/home/pi/fritos-bridge/"
cp "$BRIDGE_SRC/appetito-bridge.service"  "$ROOT_MNT/home/pi/fritos-bridge/"
cp "$BRIDGE_SRC/README.md"                "$ROOT_MNT/home/pi/fritos-bridge/"
sed -i 's|/home/pi/fritos/tools/appetito-bridge|/home/pi/fritos-bridge|g' \
  "$ROOT_MNT/home/pi/fritos-bridge/appetito-bridge.service"
chown -R 1000:1000 "$ROOT_MNT/home/pi/fritos-bridge"

# firstrun.sh — installe le service systemd au 1er boot du Pi
cat > "$BOOT_MNT/firstrun.sh" << 'FIRSTRUN_EOF'
#!/bin/bash
set +e
exec > /var/log/firstrun.log 2>&1
echo "=== firstrun $(date) ==="
cp /home/pi/fritos-bridge/appetito-bridge.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable appetito-bridge
systemctl start appetito-bridge
systemctl status appetito-bridge --no-pager || true
echo "=== firstrun done ==="
exit 0
FIRSTRUN_EOF
chmod +x "$BOOT_MNT/firstrun.sh"

# Activer firstrun via cmdline.txt
if ! grep -q "firstrun.sh" "$BOOT_MNT/cmdline.txt"; then
  sed -i 's| init=| systemd.run=/boot/firmware/firstrun.sh systemd.run_success_action=reboot systemd.unit=kernel-command-line.target init=|' "$BOOT_MNT/cmdline.txt"
fi

# ─── 5. Éjection ────────────────────────────────────────────────────────────
echo ""
echo "[5/5] Éjection propre…"
sync
umount "$BOOT_MNT" "$ROOT_MNT"
eject "$SD"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Carte prête. Suite :"
echo "  1. Insère dans le Pi 4"
echo "  2. Branche Ethernet"
echo "  3. Branche alimentation"
echo "  4. Attends ~3-4 min (premier boot lent)"
echo "  5. SSH :    ssh pi@${HOSTNAME}.local   (password: ${PASSWORD})"
echo "     Sinon trouve l'IP du Pi dans ton routeur."
echo "  6. Vérif :  sudo systemctl status appetito-bridge"
echo "════════════════════════════════════════════════════════════════"
