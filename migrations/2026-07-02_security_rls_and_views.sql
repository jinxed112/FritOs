-- ============================================================================
-- Sécurité : activer RLS sur 3 tables exposées + vues en security_invoker
-- Date : 2026-07-02
-- ============================================================================
-- Vérifs faites le 02/07 :
--  * anon (clé publique dans le bundle OrderMdj) avait SELECT/INSERT/UPDATE/
--    DELETE sur sms_outreach (numéros clients — RGPD), ambassador_rewards,
--    sessions, SANS RLS => lecture/écriture par n'importe quel visiteur.
--  * Aucune app ne lit ces tables ni les vues via PostgREST (grep = 0).
--  * Scripts SMS = rôle postgres (rolbypassrls=true) => RLS ne les gêne pas.
--  * Tables sous-jacentes des vues : RLS déjà activée + grants OK.
-- ============================================================================

BEGIN;

-- 1) RLS ON sans policy = deny par défaut pour anon/authenticated.
--    service_role et postgres (scripts SMS) bypassent => aucun impact fonctionnel.
ALTER TABLE public.sms_outreach       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions           ENABLE ROW LEVEL SECURITY;  -- table morte (0 row, col id) — candidate DROP

-- 2) Vues : security_invoker => elles appliquent la RLS de l'appelant au lieu
--    de bypasser avec les droits du créateur. Tables sous-jacentes ont la RLS.
ALTER VIEW public.establishments_public       SET (security_invoker = on);
ALTER VIEW public.v_active_drivers_positions  SET (security_invoker = on);
ALTER VIEW public.delivery_survey_stats       SET (security_invoker = on);

COMMIT;
