# Smoke test — sélecteur multi-tenant admin

Pas de framework de test dans le repo. Cette checklist est la vérification de
non-régression à exécuter manuellement avant chaque merge des PRs A / B / C
de la série `fix/multi-tenant-*`.

## Pré-requis

- `ESTABLISHMENT_COOKIE_SECRET` défini dans `.env.local` (sinon les routes
  `/api/admin/select-establishment` et `/api/admin/current-establishment`
  retournent 500).
- Migration `migrations/2026-05-09_add_profile_establishment.sql` appliquée
  sur la base ciblée.
- Profil `super_admin` configuré pour Michele (`establishment_id = NULL`).

## Non-régression Boussu (à exécuter avant ET après)

Note les valeurs *avant* le déploiement de la PR. Compare *après*.

| Étape | Avant | Après |
|---|---|---|
| Connexion `/admin/login` réussie | ✅ | ☐ |
| `/admin/orders` aujourd'hui — nb commandes | ___ | ___ |
| `/admin/orders` aujourd'hui — n° dernière | ___ | ___ |
| `/admin/orders` aujourd'hui — CA total affiché | ___ € | ___ € |
| Realtime : créer commande via `/order/boussu` → apparaît sans recharge | ✅ | ☐ |
| Modal commande s'ouvre + bouton PDF fonctionne | ✅ | ☐ |
| Logout → cookie `fritos_admin_establishment` supprimé | n/a | ☐ |

## Activation Jurbise (post-PR A + B + C)

| Étape | Résultat attendu |
|---|---|
| Switcher sidebar → Jurbise | URL inchangée, `router.refresh()` recharge la page |
| `/admin/orders` après switch Jurbise | Liste vide (aucune commande Jurbise pour l'instant) |
| `/admin/orders` après switch retour Boussu | Liste Boussu identique au snapshot avant |
| Commande créée sur Jurbise via `/order/jurbise` | N'apparaît PAS dans `/admin/orders` Boussu |
| Inversement, commande Boussu n'apparaît pas dans `/admin/orders` Jurbise | ✅ |

L'étape "commande Jurbise n'apparaît pas chez Boussu" est le test cross-tenant
critique. Si elle échoue, ne pas merger : signe que le filtre
`eq('establishment_id', ...)` a été oublié quelque part ou que le cookie HMAC
fuit l'establishment_id du mauvais utilisateur.

## Tests cookie HMAC (à valider une fois)

| Test | Attendu |
|---|---|
| Modifier 1 caractère du cookie côté navigateur (DevTools) | `/api/admin/current-establishment` renvoie `current: null` |
| Supprimer le cookie | Modal de sélection apparaît sur `/admin/*` |
| Rotater `ESTABLISHMENT_COOKIE_SECRET` puis recharger | Tous les cookies existants invalidés, modal réapparaît |
| Logout puis login d'un autre admin | Le cookie du précédent admin est rejeté (`user_id` mismatch) |

## Routes à NE PAS toucher dans cette PR A

- `/api/orders` POST — accepte encore `establishmentId` du body. Fix planifié
  dans PR D (`fix/orders-api-tenant-binding`).
- Cookie `selected_device` (kiosk/KDS/counter) — toujours non signé. Fix
  planifié dans PR séparée `fix/device-cookie-hmac`.
- 20 pages admin restantes hardcodant l'UUID Boussu — PR B.
- Driver + landing publique + `.env.example` cleanup — PR C.
