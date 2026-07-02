-- ============================================================================
-- Backfill orders.total = 0 sur les commandes online (bug OrderMdj bug_034)
-- Date : 2026-07-02
-- Cause : l'insert OrderMdj écrivait total_amount mais jamais total (défaut 0).
--         Le module factures B2B FritOS lit `total` → facturait 0 € sur l'online.
-- Le fix code est déployé côté OrderMdj ; ce backfill répare l'historique.
-- Vérifié : toutes les commandes online ont total=0 et total_amount correct.
-- ============================================================================

BEGIN;

-- Aperçu avant (à lancer seul si tu veux vérifier d'abord) :
-- SELECT count(*), min(created_at), max(created_at)
-- FROM orders WHERE total = 0 AND total_amount > 0;

UPDATE public.orders
SET total = total_amount
WHERE total = 0
  AND total_amount > 0;

-- Même dualité pour la TVA : vat_amount = 0 partout, tax_amount est la vraie
UPDATE public.orders
SET vat_amount = tax_amount
WHERE (vat_amount = 0 OR vat_amount IS NULL)
  AND tax_amount > 0;

COMMIT;
