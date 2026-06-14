#!/bin/bash
#
# Configure le Raspberry Pi comme imprimante Bluetooth SPP
# pour qu'Appetito Box (ou n'importe quelle app POS) puisse imprimer dessus
# comme si c'était une vraie imprimante thermique (UP-321B etc).
#
# Étapes :
#   1. Install deps (bluez, bluez-tools — sdptool en mode compat)
#   2. Force Class of Device = 0x680000 (Imaging > Printer) + Compat SDP
#   3. Alias "FritOS-Printer" + discoverable/pairable persistents
#   4. Agent "NoInputNoOutput" (appairage Just Works, sans PIN)
#   5. Register SP profile sur RFCOMM channel 1
#   6. Install + start le service systemd bt-printer-bridge (Python relay)
#
# Usage :
#   sudo bash setup-bt-printer.sh
#
# Pré-requis : capture.py et appetito-bridge.service déjà installés
#              (sinon le flux relayé ne sera nulle part stocké).

set -e

if [ "$EUID" -ne 0 ]; then
  echo "❌ Lance avec sudo."
  exit 1
fi

BRIDGE_DIR="/home/pi/fritos-bridge"

echo "[1/6] Install dépendances…"
apt-get update -qq
apt-get install -y -qq bluez bluez-tools

echo ""
echo "[2/6] Configuration /etc/bluetooth/main.conf…"
CONF=/etc/bluetooth/main.conf
# Class 0x680000 = Imaging device with Printer service
sed -i 's|^#\?Class\s*=.*|Class = 0x680000|' "$CONF"
grep -q '^Class\s*=' "$CONF" || echo "Class = 0x680000" >> "$CONF"
# Compat = true → réactive l'ancien API SDP (nécessaire pour sdptool add SP)
sed -i 's|^#\?Compat\s*=.*|Compat = true|' "$CONF" || true
grep -q '^Compat\s*=' "$CONF" || echo "Compat = true" >> "$CONF"
# Pas de timeout : reste discoverable + pairable indéfiniment
sed -i 's|^#\?DiscoverableTimeout\s*=.*|DiscoverableTimeout = 0|' "$CONF" || true
grep -q '^DiscoverableTimeout\s*=' "$CONF" || echo "DiscoverableTimeout = 0" >> "$CONF"
sed -i 's|^#\?PairableTimeout\s*=.*|PairableTimeout = 0|' "$CONF" || true
grep -q '^PairableTimeout\s*=' "$CONF" || echo "PairableTimeout = 0" >> "$CONF"

# Aussi : forcer le compat sur le service bluetoothd
SVC=/lib/systemd/system/bluetooth.service
if ! grep -q -- '--compat' "$SVC"; then
  sed -i 's|^ExecStart=/usr/libexec/bluetooth/bluetoothd.*|ExecStart=/usr/libexec/bluetooth/bluetoothd --compat|' "$SVC"
fi

echo ""
echo "[3/6] Restart bluetoothd…"
systemctl daemon-reload
systemctl restart bluetooth
sleep 3

echo ""
echo "[4/6] bluetoothctl : alias, discoverable, pairable, agent Just Works…"
bluetoothctl <<'BTEOF'
power on
system-alias "FritOS-Printer"
agent NoInputNoOutput
default-agent
discoverable on
pairable on
BTEOF

echo ""
echo "[5/6] Register Serial Port profile sur RFCOMM channel 1…"
sdptool add --channel=1 SP || echo "  (sdptool SP add a renvoyé non-zero, normalement OK quand même)"

echo ""
echo "[6/6] Install service systemd bt-printer-bridge…"
if [ ! -f "$BRIDGE_DIR/bt_printer_bridge.py" ]; then
  echo "❌ $BRIDGE_DIR/bt_printer_bridge.py absent. git pull du repo FritOS d'abord."
  exit 1
fi
cp "$BRIDGE_DIR/bt-printer-bridge.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable bt-printer-bridge
systemctl restart bt-printer-bridge
sleep 1
systemctl status bt-printer-bridge --no-pager | head -15

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Pi configuré en imprimante Bluetooth SPP."
echo ""
echo "MAC Pi : $(hciconfig hci0 | grep 'BD Address' | awk '{print $3}')"
echo "Alias  : FritOS-Printer"
echo "Class  : 0x680000 (Imaging Printer)"
echo "Canal  : RFCOMM 1 (SP profile)"
echo ""
echo "Côté tablette Android :"
echo "  1. Réglages → Bluetooth → Rechercher"
echo "  2. Tape 'FritOS-Printer' quand il apparaît → pair (sans PIN)"
echo "  3. Ouvre Appetito Box → Paramètres → Actualiser les appareils"
echo "  4. Sélectionne FritOS-Printer"
echo "  5. Test print → arrive sur le Pi via Bluetooth"
echo ""
echo "Monitor en live :"
echo "  sudo journalctl -u bt-printer-bridge -u appetito-bridge -f"
echo "════════════════════════════════════════════════════════════════"
