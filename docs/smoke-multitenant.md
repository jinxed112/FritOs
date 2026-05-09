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

## Couverture par PR

| PR | Surfaces couvertes |
|---|---|
| PR A (mergée) | `/admin/orders` pilote + helpers + endpoints + sidebar UI + suppression Zhistory dead-file |
| PR B (cette PR) | 15 autres pages admin + `/counter/backoffice` (via cookie device) + `/api/reports/z-report` + cleanup `NEXT_PUBLIC_DEFAULT_ESTABLISHMENT` |
| PR C (à venir) | Driver page + landing publique slug |
| PR D (escaladée P0 J3) | `/api/orders` public — bind serveur-side via slug |
| PR `fix/device-cookie-hmac` | Cookie `selected_device` (kiosk/KDS/counter), audit P0 #4 |

## Smoke PR B — checklist par page admin

Pour chaque page ci-dessous, vérifier :
1. Switch sidebar → Boussu : la liste affiche les mêmes données qu'avant la PR.
2. Switch sidebar → Jurbise : la liste se vide ou montre uniquement les données Jurbise.
3. Switch retour Boussu : retour identique au snapshot.

| Page | Vérifié Boussu | Vérifié Jurbise | Vérifié switch retour |
|---|---|---|---|
| `/admin` (dashboard / promo codes) | ☐ | ☐ | ☐ |
| `/admin/categories` | ☐ | ☐ | ☐ |
| `/admin/customers` | ☐ | ☐ | ☐ |
| `/admin/deliveries` | ☐ | ☐ | ☐ |
| `/admin/drivers` | ☐ | ☐ | ☐ |
| `/admin/ingredients` | ☐ | ☐ | ☐ |
| `/admin/products` | ☐ | ☐ | ☐ |
| `/admin/promotions` | ☐ | ☐ | ☐ |
| `/admin/propositions` (option_groups) | ☐ | ☐ | ☐ |
| `/admin/reports` (dashboard tab) | ☐ | ☐ | ☐ |
| `/admin/reports` (export Excel) | ☐ | n/a | ☐ |
| `/admin/reports/z-history` | ☐ | ☐ | ☐ |
| `/admin/settings` (general + zones) | ☐ | ☐ | ☐ |
| `/admin/stock-planning` | ☐ | ☐ | ☐ |
| `/admin/suppliers` | ☐ | ☐ | ☐ |
| `/admin/suppliers/products` | ☐ | ☐ | ☐ |

## Smoke PR B — counter/backoffice

| Étape | Attendu |
|---|---|
| Login counter device Boussu, naviguer `/counter/backoffice` | Liste ingrédients Boussu identique au pré-merge |
| Aucune liste ne s'affiche si cookie `selected_device` absent | OK (page reste vide, pas de leak) |
| Création d'un ingrédient → `establishment_id` = celui du device, pas hardcoded | OK |
