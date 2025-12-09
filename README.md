# 🍟 FritOS

Système de caisse complet pour MDjambo (friterie belge).

## 🚀 Stack technique

- **Frontend** : Next.js 14 (App Router)
- **Backend** : Supabase (PostgreSQL + Realtime + Auth)
- **Styling** : Tailwind CSS
- **Déploiement** : Vercel
- **Paiement** : Viva Wallet

## 📁 Structure du projet

```
src/
├── app/                    # Pages Next.js (App Router)
│   ├── admin/              # Back-office
│   ├── kiosk/              # Borne client
│   ├── kitchen/            # KDS Cuisine
│   ├── counter/            # Caisse employé
│   └── order/              # Click & Collect
├── components/             # Composants React
│   ├── ui/                 # Composants UI réutilisables
│   ├── admin/              # Composants back-office
│   ├── kiosk/              # Composants borne
│   └── kitchen/            # Composants KDS
├── lib/                    # Utilitaires
│   └── supabase/           # Client Supabase
├── hooks/                  # React hooks personnalisés
├── stores/                 # Zustand stores
└── types/                  # Types TypeScript
```

## ⚙️ Installation

```bash
# Cloner le repo
git clone https://github.com/TON_USERNAME/fritos.git
cd fritos

# Installer les dépendances
npm install

# Copier les variables d'environnement
cp .env.example .env.local

# Éditer .env.local avec tes clés Supabase
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Lancer en dev
npm run dev
```

## 🔐 Variables d'environnement

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Viva Wallet
VIVA_CLIENT_ID=xxx
VIVA_CLIENT_SECRET=xxx
VIVA_MERCHANT_ID=xxx
```

## 📱 Modules

| Module | Route | Description |
|--------|-------|-------------|
| Back-office | `/admin` | Gestion produits, rapports, paramètres |
| Borne | `/kiosk` | Interface client tactile |
| KDS | `/kitchen` | Affichage commandes cuisine |
| Caisse | `/counter` | Prise de commande employé |
| Click & Collect | `/order/[slug]` | Commandes en ligne |

## 🗄️ Base de données

31 tables PostgreSQL sur Supabase. Voir `fritos_schema.sql` pour le schéma complet.

## 📝 Licence

Propriétaire - MDjambo © 2025
