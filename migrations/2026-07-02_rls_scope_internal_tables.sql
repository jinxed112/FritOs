-- ============================================================================
-- Sécurité : restreindre les tables internes de public -> authenticated
-- Date : 2026-07-02
-- ============================================================================
-- Ces tables avaient des policies USING(true) pour le rôle PUBLIC => n'importe
-- quel visiteur (clé anon publique) pouvait lire/écrire. Vérifié côté code :
--  * temp_orders : seulement KDS (authenticated) + route API (service_role)
--  * stock_items / price_history : import catalogue + admin stock (authenticated)
--    + trigger record_supplier_price_history (SECURITY DEFINER, bypass)
--  * delivery_tracking / driver_location_logs : AUCUN accès direct dans le code,
--    uniquement via RPC driver_* (SECURITY DEFINER, bypass RLS)
-- => passer ces policies à `authenticated` bloque l'anonyme sans rien casser :
--    les devices/staff sont connectés (JWT authenticated), service_role et les
--    RPC SECURITY DEFINER bypassent la RLS.
-- NB : orders.authenticated_full_access_orders (déjà `authenticated`, USING true)
--      n'est PAS touché ici — nécessite un scoping par establishment_id
--      (chantier multi-tenant), pas un trou public.
-- ============================================================================

BEGIN;

ALTER POLICY "temp_orders_all"              ON public.temp_orders          TO authenticated;
ALTER POLICY "Anyone can view temp_orders"  ON public.temp_orders          TO authenticated;
ALTER POLICY "Anyone can insert temp_orders" ON public.temp_orders         TO authenticated;
ALTER POLICY "Anyone can update temp_orders" ON public.temp_orders         TO authenticated;
ALTER POLICY "Anyone can delete temp_orders" ON public.temp_orders         TO authenticated;

ALTER POLICY "stock_items_all"              ON public.stock_items          TO authenticated;
ALTER POLICY "price_history_all"            ON public.price_history        TO authenticated;

ALTER POLICY "Service full access"          ON public.delivery_tracking    TO authenticated;
ALTER POLICY "service_read_all_logs"        ON public.driver_location_logs TO authenticated;
ALTER POLICY "drivers_insert_own_logs"      ON public.driver_location_logs TO authenticated;

COMMIT;
