-- 2026-07-10
-- Backfill orders.total = 0 sur les commandes kiosk (même bug que bug_034 online).
--
-- Cause : l'insert kiosk écrivait total_amount mais jamais total (défaut 0).
--         Le backfill du 2026-07-02 avait réparé l'historique, mais le code
--         kiosk n'avait pas été corrigé → toutes les commandes bornes depuis
--         le 02/07 sont reparties avec total=0.
-- Le fix code est dans src/app/kiosk/[deviceCode]/page.tsx (ajout de `total`).
-- Le rapport Z lit total_amount et n'a jamais été impacté ; ce backfill remet
-- total = total_amount pour que tout lecteur de `total` (factures B2B, requêtes
-- ad hoc) soit raccord avec le Z.

-- Contrôle avant :
-- SELECT source, COUNT(*) FROM orders
-- WHERE (total = 0 OR total IS NULL) AND total_amount > 0 GROUP BY source;

UPDATE orders
SET total = total_amount
WHERE (total = 0 OR total IS NULL)
  AND total_amount > 0;
