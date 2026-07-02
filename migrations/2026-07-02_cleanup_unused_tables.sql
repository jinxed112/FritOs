-- ============================================================================
-- Nettoyage pré-SaaS : suppression des tables legacy jamais activées
-- Date : 2026-07-02
-- Vérifications faites le 2026-07-02 (brainserver) :
--   * 0 rows dans chacune des 9 tables (comptage REST live)
--   * 0 référence dans le code : fritos/src, OrderMdj/src, FritosFlexi/src,
--     scripts brain (~/brain/.claude/scripts)
--
-- GARDÉES volontairement (contrairement aux candidates de l'audit 07/06) :
--   * time_slots_config (2 rows), time_slot_overrides, order_slot_counts
--     → utilisées par /api/timeslots, appelée par la caisse (counter),
--       la page order ET OrderMdj — système VIVANT
--   * promotions → UI admin active (/admin/promotions dans la nav)
--   * slot_config (1 row) + reserved_slots → référencées par /api/slots/*
--     et SlotSelector.tsx (code mort, aucun appelant) — à dropper en
--     phase 2 EN MÊME TEMPS que la suppression du code mort
--
-- Exécution : Supabase SQL editor (fritos_prod krjqrdqawkjjvvtoydxb)
-- ou : psql "$DATABASE_URL" -f migrations/2026-07-02_cleanup_unused_tables.sql
-- ============================================================================

BEGIN;

-- Garde-fou : abort si une table a reçu des rows depuis la vérification
DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'reservations', 'time_slots',
    'supplier_orders', 'supplier_order_items',
    'purchase_orders', 'purchase_order_items',
    'recipes', 'payments', 'daily_reports'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Table % contient % row(s) — ABORT, ne pas dropper', t, n;
    END IF;
  END LOOP;
END $$;

-- Pas de CASCADE : si une vue ou FK inconnue dépend d'une de ces tables,
-- la migration échoue au lieu de supprimer silencieusement autre chose.
-- (Enfants avant parents pour les FK internes au groupe.)
DROP TABLE IF EXISTS public.supplier_order_items;
DROP TABLE IF EXISTS public.supplier_orders;
DROP TABLE IF EXISTS public.purchase_order_items;
DROP TABLE IF EXISTS public.purchase_orders;
DROP TABLE IF EXISTS public.reservations;
DROP TABLE IF EXISTS public.time_slots;
DROP TABLE IF EXISTS public.recipes;
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.daily_reports;

-- Fonctions orphelines du workflow fournisseur jamais activé
-- (les triggers portés par les tables sont tombés avec elles)
DROP FUNCTION IF EXISTS public.calculate_supplier_order_totals(uuid);
DROP FUNCTION IF EXISTS public.generate_supplier_order_number();
DROP FUNCTION IF EXISTS public.record_supplier_price_history();
DROP FUNCTION IF EXISTS public.update_stock_on_supplier_delivery();

COMMIT;
