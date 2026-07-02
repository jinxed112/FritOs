-- ============================================================================
-- Durcissement sécurité (WARN Security Advisor) — 2026-07-02
-- 1) search_path=public figé sur 42 fonctions (idempotent).
-- 2) REVOKE EXECUTE FROM PUBLIC sur 10 fonctions SECURITY DEFINER de trigger /
--    internes (0 réf code, service-role/postgres restent OK, propriétaire =
--    postgres exécute toujours). Testé le 02/07 : les triggers fireント sans
--    EXECUTE (table jetable en rollback) => création de commandes intacte.
--    PRÉSERVÉES avec EXECUTE anon/authenticated (NÉCESSAIRE) :
--      - allowlist RPC : driver_*, generate_order_number, get_report_stats,
--        get_stock_daily_averages, increment_attempts, next_invoice_number
--      - helpers RLS : is_manager, is_super_admin, get_user_establishment_id,
--        get_current_worker_id, user_has_access_to_establishment
--        (testé : révoquer casse l'évaluation des policies => permission denied)
-- ============================================================================

BEGIN;

-- 1) search_path

ALTER FUNCTION public.accept_suggested_round(p_suggested_round_id uuid) SET search_path = public;
ALTER FUNCTION public.activate_scheduled_orders() SET search_path = public;
ALTER FUNCTION public.auto_create_dimona() SET search_path = public;
ALTER FUNCTION public.auto_estimate_shift_cost() SET search_path = public;
ALTER FUNCTION public.calculate_actual_hours() SET search_path = public;
ALTER FUNCTION public.calculate_product_cost(p_product_id uuid) SET search_path = public;
ALTER FUNCTION public.calculate_round_distance_km(p_round_id uuid) SET search_path = public;
ALTER FUNCTION public.calculate_shift_cost(p_start_time time without time zone, p_end_time time without time zone, p_hourly_rate numeric, p_date date) SET search_path = public;
ALTER FUNCTION public.check_eat_in_monthly_limit() SET search_path = public;
ALTER FUNCTION public.cleanup_temp_orders() SET search_path = public;
ALTER FUNCTION public.credit_loyalty_points(p_customer_id uuid, p_order_id uuid, p_order_total numeric) SET search_path = public;
ALTER FUNCTION public.debit_loyalty_points(p_customer_id uuid, p_points integer, p_order_id uuid) SET search_path = public;
ALTER FUNCTION public.driver_get_session(p_driver_id uuid) SET search_path = public;
ALTER FUNCTION public.driver_login(p_pin text, p_establishment_id uuid) SET search_path = public;
ALTER FUNCTION public.driver_logout(p_driver_id uuid, p_session_km numeric) SET search_path = public;
ALTER FUNCTION public.driver_set_status(p_driver_id uuid, p_status text, p_session_km numeric) SET search_path = public;
ALTER FUNCTION public.driver_update_position(p_driver_id uuid, p_lat numeric, p_lng numeric, p_accuracy numeric, p_speed numeric, p_heading numeric, p_round_id uuid) SET search_path = public;
ALTER FUNCTION public.ensure_accepted_never_expires() SET search_path = public;
ALTER FUNCTION public.expire_old_suggestions() SET search_path = public;
ALTER FUNCTION public.generate_all_z_reports(p_date date) SET search_path = public;
ALTER FUNCTION public.generate_cost_line() SET search_path = public;
ALTER FUNCTION public.generate_z_report(p_establishment_id uuid, p_date date) SET search_path = public;
ALTER FUNCTION public.get_current_prep_time(p_establishment_id uuid) SET search_path = public;
ALTER FUNCTION public.get_current_worker_id() SET search_path = public;
ALTER FUNCTION public.get_next_z_report_number(p_establishment_id uuid) SET search_path = public;
ALTER FUNCTION public.get_product_allergens(p_product_id uuid) SET search_path = public;
ALTER FUNCTION public.get_slot_duration(p_establishment_id uuid) SET search_path = public;
ALTER FUNCTION public.get_user_establishment_id() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.haversine_distance(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) SET search_path = public;
ALTER FUNCTION public.haversine_distance_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) SET search_path = public;
ALTER FUNCTION public.is_sunday_or_belgian_holiday(check_date date) SET search_path = public;
ALTER FUNCTION public.is_super_admin() SET search_path = public;
ALTER FUNCTION public.record_supplier_price_history() SET search_path = public;
ALTER FUNCTION public.regenerate_device_pin(p_device_id uuid) SET search_path = public;
ALTER FUNCTION public.reject_suggested_round(p_suggested_round_id uuid) SET search_path = public;
ALTER FUNCTION public.reset_eat_in_monthly() SET search_path = public;
ALTER FUNCTION public.update_products_availability() SET search_path = public;
ALTER FUNCTION public.update_profile_complete() SET search_path = public;
ALTER FUNCTION public.update_stock_on_order_paid_logic(p_order_id uuid, p_order_number text) SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 2) REVOKE EXECUTE FROM PUBLIC (10 fonctions trigger/internes)
REVOKE EXECUTE ON FUNCTION public.accept_suggested_round(p_suggested_round_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_scheduled_orders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_dimona() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_loyalty_points(p_customer_id uuid, p_order_id uuid, p_order_total numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_loyalty_points(p_customer_id uuid, p_points integer, p_order_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_pickup_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_stock_on_order_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_stock_on_order_paid() FROM PUBLIC, anon, authenticated;

COMMIT;
