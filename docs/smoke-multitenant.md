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
| PR D | `/api/orders` public — bind serveur-side via slug + recalcul prix + Zod + atomic order_number trigger |
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

## Smoke PR D — `/api/orders` durci + trigger atomique

### Pré-requis avant test

- Migration `migrations/2026-05-09_atomic_order_number.sql` appliquée sur Supabase prod.
- Confirmer via SQL editor :
  ```sql
  SELECT pg_get_functiondef('public.generate_order_number()'::regprocedure)
         LIKE '%Europe/Brussels%'
    AS trigger_has_tz_fix,
       pg_get_functiondef('public.generate_order_number(uuid)'::regprocedure)
         LIKE '%Europe/Brussels%'
    AS rpc_has_tz_fix;
  -- both should return true
  ```

### Flow nominal click & collect

| Étape | Attendu |
|---|---|
| Aller sur `/order/boussu`, ajouter 1 produit, valider la commande | Commande créée avec `establishment_id` Boussu |
| Idem `/order/jurbise` une fois Jurbise activé | Commande créée avec `establishment_id` Jurbise |
| Le `subtotal` côté DB correspond aux prix produits Boussu | Pas de manipulation client possible |
| `order_number` au format `A01`, `A02`, … | Trigger atomique fonctionne |

### Tests sécurité (curl / DevTools)

| Test | Attendu |
|---|---|
| `POST /api/orders` avec `body.establishmentId = '<jurbise_uuid>'` depuis `/order/boussu` | 400, "establishmentId not accepted in body" |
| `POST` avec body sans `slug` ni cookie admin | 400, "Aucun établissement résolu" |
| `POST` avec un `productId` Boussu mais `slug=jurbise` | 400, "Produit non disponible pour cet établissement" |
| `POST` avec `loyaltyPointsUsed: 99999` et un customer ayant 50 points | Order créé avec `loyalty_points_used = 50` (capé) |
| `POST` avec `loyaltyPointsUsed: 50` mais aucun `customerId` | Order créé avec `loyalty_points_used = 0` |
| `POST` avec `customerId` Boussu mais `slug=jurbise` | 403, "Client non rattaché à cet établissement" |
| `POST` avec `deliveryFee: 9999` | 400 (Zod cap à 50) |
| `POST` avec `items: []` | 400 (Zod min 1) |
| `POST` avec body non-JSON | 400 "JSON invalide" |

### Test race order_number (manuel, 2 onglets)

1. Ouvrir 2 onglets `/order/boussu` simultanément.
2. Préparer une commande dans chaque, cliquer "Valider" quasi-simultanément.
3. Vérifier 2 `order_number` distincts (`A05` + `A06`, jamais `A05` + `A05`).

Sans migration : risque de doublon. Avec migration : l'INSERT...ON CONFLICT DO UPDATE pose un row lock sur `order_number_sequences (establishment_id, sequence_date)`, le 2ème insert attend le commit du 1er.

### Test TZ (à exécuter entre 00:00 et 02:00 Brussels)

```sql
SELECT (NOW() AT TIME ZONE 'Europe/Brussels')::date AS brussels_today,
       CURRENT_DATE                                 AS server_today;
```

En heure d'hiver (CET), entre 00:00 et 01:00 Brussels les deux dates diffèrent. La séquence doit utiliser `brussels_today`.
