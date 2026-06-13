# Appetito Box → FritOS bridge

Pont logiciel qui transforme un Raspberry Pi en imprimante thermique virtuelle.
L'app Appetito Box "imprime" ses tickets vers le Pi → le Pi parse + POST vers
l'API FritOS → la commande apparaît automatiquement dans le KDS.

Évite la double saisie pour chaque commande Appetito.

## Architecture

```
[Tablette Appetito Box]  ──Wi-Fi friterie──►  [Raspberry Pi 4]  ──HTTPS──►  [FritOS API]
                                                  port 9100                 /api/orders/from-appetito
                                                  ESC/POS parser
                                                        ↓
                                                  [KDS source=appetito]
```

## Setup du Pi (1 fois)

### Prérequis
- Raspberry Pi 4 sur le réseau Wi-Fi friterie (idéalement Ethernet pour stabilité)
- IP statique attribuée (DHCP reservation sur le routeur OU `dhcpcd.conf` static)
- Python 3.10+ déjà inclus dans Raspbian

### Installation
```bash
# Cloner le repo FritOS (lecture suffit pour ce script)
cd /home/pi
git clone <repo-fritos> fritos
cd fritos/tools/appetito-bridge

# Pas de deps externes pour la phase 1 — stdlib only
python3 --version
```

### Lancement manuel (test)
```bash
sudo python3 capture.py
```
sudo nécessaire pour binder sur le port 9100 (<1024 réservé root).

### Lancement en service (prod)
```bash
sudo cp appetito-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable appetito-bridge
sudo systemctl start appetito-bridge
sudo systemctl status appetito-bridge
```

## Phase actuelle : 1. Capture

`capture.py` écoute sur `0.0.0.0:9100` et sauvegarde chaque ticket dans
`~/captures/` au format `.bin` (raw) et `.txt` (vue ASCII + commandes ESC/POS
en hex entre crochets).

**À faire après installation :**
1. Configurer l'app Appetito Box :
   - Paramètres → Imprimante
   - Type : Réseau / Wi-Fi / TCP
   - IP : `<IP fixe du Pi>`
   - Port : `9100`
2. Faire 1-2 commandes test depuis Appetito.
3. Récupérer le contenu de `~/captures/` (`scp` ou clé USB).
4. Envoyer les fichiers à Claude pour construction du parser.

## Phase 2 (à venir)

Une fois qu'on a des samples réels, on ajoute :
- `parser.py` : extrait les infos commande du flux ESC/POS (regex sur texte cp437)
- `dispatcher.py` : POST vers `/api/orders/from-appetito` de FritOS
- Endpoint FritOS qui accepte le payload parsé et crée une `order` avec `source='appetito'`

## Pourquoi port 9100 et pas Bluetooth ?

- Standard de fait pour imprimantes thermiques réseau (Epson TM-T20, Star TSP100)
- Toutes les apps de gestion resto savent imprimer vers TCP/9100
- Plus stable et facile à diagnostiquer que Bluetooth (pas d'appairage, journaux clairs)
- Encoding standard cp437 (ou cp858 selon imprimante simulée)

## Sécurité

Le service écoute en clair sur le LAN friterie. Pas de risque externe si le
routeur ne forwarde pas le port 9100. Si paranoid : firewall iptables sur le
Pi pour ne whitelister que l'IP de la tablette Appetito Box.

Pour la phase 2 (POST vers FritOS), utilisation d'un token statique dans une
env var (`FRITOS_BRIDGE_TOKEN`), vérifié côté API. Pas de secret en clair dans
le code.
