-- ============================================================================
-- Sécurité : supprimer les references user_metadata dans les policies RLS
-- Date : 2026-07-02
-- Faille : 30 policies décidaient "manager ?" via auth.jwt()->'user_metadata'->>'role',
--          champ MODIFIABLE par l'utilisateur (auth.updateUser côté client) =>
--          escalade de privilege trivial (un flexi/client se déclare manager).
-- Fix : is_manager() lit desormais profiles.role (source fiable, comme
--       is_super_admin()), et chaque policy remplace l'expression inline par
--       is_manager(). admin@mdjambo.be est super_admin dans profiles => garde
--       tous ses acces (aucun lockout possible).
-- ============================================================================

BEGIN;

-- 1) is_manager() lit profiles au lieu du JWT. Inclut super_admin/admin pour
--    preserver exactement les acces actuels (admin@mdjambo.be = super_admin).
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('manager', 'super_admin', 'admin')
  );
$function$;

ALTER POLICY "manager_write" ON public.allergens USING (is_manager());
ALTER POLICY "manager_write" ON public.categories USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_only" ON public.customer_notifications USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_only" ON public.customer_sessions USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_write" ON public.delivery_config USING ((is_super_admin() OR is_manager())) WITH CHECK ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_only" ON public.delivery_drivers USING (is_manager());
ALTER POLICY "manager_write" ON public.delivery_zones USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_only" ON public.dimona_declarations USING (is_manager());
ALTER POLICY "manager_delete" ON public.flexi_workers USING (is_manager());
ALTER POLICY "manager_insert" ON public.flexi_workers WITH CHECK (is_manager());
ALTER POLICY "manager_select_all" ON public.flexi_workers USING (is_manager());
ALTER POLICY "manager_update_all" ON public.flexi_workers USING (is_manager());
ALTER POLICY "manager_write" ON public.loyalty_config USING ((is_super_admin() OR is_manager())) WITH CHECK ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_write" ON public.option_groups USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_only" ON public.order_items USING (((EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = order_items.order_id) AND ((orders.establishment_id = get_user_establishment_id()) OR is_super_admin())))) OR is_manager()));
ALTER POLICY "manager_only" ON public.orders USING (is_manager());
ALTER POLICY "managers_all_uploads" ON public.payslip_uploads USING (is_manager());
ALTER POLICY "managers_all_payslips" ON public.payslips USING (is_manager());
ALTER POLICY "manager_delete" ON public.product_ingredients USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_update" ON public.product_ingredients USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_write" ON public.product_ingredients WITH CHECK ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_write" ON public.products USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_delete" ON public.promo_codes USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_update" ON public.promo_codes USING (is_manager());
ALTER POLICY "manager_write" ON public.promo_codes WITH CHECK (is_manager());
ALTER POLICY "manager_only" ON public.promo_outreach USING (is_manager());
ALTER POLICY "manager_only" ON public.shifts USING (is_manager());
ALTER POLICY "manager_write" ON public.slot_config USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_only" ON public.supplier_products USING ((is_super_admin() OR is_manager()));
ALTER POLICY "manager_all" ON public.time_entries USING (is_manager());

COMMIT;
