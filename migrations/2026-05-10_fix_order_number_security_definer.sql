-- Migration: fix order_number generation — SECURITY INVOKER → DEFINER
-- Date: 2026-05-10
-- Hotfix for the regression introduced by 2026-05-09_atomic_order_number.sql
--
-- Symptom:
--   Since 2026-05-09 ~22:00 UTC (= 00:00 Brussels), every cash payment on the
--   counter throws "Erreur lors de la commande". Zero counter orders went
--   through between that timestamp and 2026-05-10 morning, vs ~3/h before.
--
-- Root cause:
--   Yesterday's migration rewrote both generate_order_number functions to do
--   INSERT … ON CONFLICT DO UPDATE on order_number_sequences. They were
--   declared without SECURITY DEFINER, so they run as the caller.
--
--   The trigger version is invoked by direct INSERTs into orders from the
--   counter/kiosk client under the 'authenticated' Postgres role. That role
--   does not have INSERT/UPDATE privileges on order_number_sequences (RLS
--   denies write — the table was historically written only by the RPC,
--   which was already SECURITY DEFINER and so bypassed RLS without anyone
--   noticing).
--
--   Before yesterday's migration, the trigger only SELECT'd from `orders`,
--   which is readable by 'authenticated' under RLS, so the missing DEFINER
--   was silently OK.
--
-- Fix:
--   CREATE OR REPLACE both functions identically, but with
--     LANGUAGE plpgsql
--     SECURITY DEFINER
--     SET search_path = public
--   so they run as the function owner (postgres / supabase_admin) and
--   bypass RLS on the sequence table. SET search_path is best practice with
--   SECURITY DEFINER to prevent search-path injection.
--
-- Function body is byte-for-byte identical to 2026-05-09_atomic_order_number.sql
-- — only the function attributes change. No application code change required.
--
-- Apply manually via Supabase SQL editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date    date    := (NOW() AT TIME ZONE 'Europe/Brussels')::date;
  v_letter  char(1);
  v_number  int;
BEGIN
  IF NEW.order_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO order_number_sequences (
    establishment_id, sequence_date, current_letter, current_number
  )
  VALUES (NEW.establishment_id, v_date, 'A', 1)
  ON CONFLICT (establishment_id, sequence_date) DO UPDATE SET
    current_number = CASE
      WHEN order_number_sequences.current_number >= 99 THEN 1
      ELSE order_number_sequences.current_number + 1
    END,
    current_letter = CASE
      WHEN order_number_sequences.current_number >= 99
        THEN CHR(ASCII(order_number_sequences.current_letter) + 1)
      ELSE order_number_sequences.current_letter
    END,
    updated_at = NOW()
  RETURNING current_letter, current_number INTO v_letter, v_number;

  NEW.order_number := v_letter || LPAD(v_number::text, 2, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_order_number(p_establishment_id uuid)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date    date    := (NOW() AT TIME ZONE 'Europe/Brussels')::date;
  v_letter  char(1);
  v_number  int;
BEGIN
  INSERT INTO order_number_sequences (
    establishment_id, sequence_date, current_letter, current_number
  )
  VALUES (p_establishment_id, v_date, 'A', 1)
  ON CONFLICT (establishment_id, sequence_date) DO UPDATE SET
    current_number = CASE
      WHEN order_number_sequences.current_number >= 99 THEN 1
      ELSE order_number_sequences.current_number + 1
    END,
    current_letter = CASE
      WHEN order_number_sequences.current_number >= 99
        THEN CHR(ASCII(order_number_sequences.current_letter) + 1)
      ELSE order_number_sequences.current_letter
    END,
    updated_at = NOW()
  RETURNING current_letter, current_number INTO v_letter, v_number;

  RETURN v_letter || LPAD(v_number::text, 2, '0');
END;
$$;

COMMIT;

-- Smoke test (run from Supabase SQL editor as a non-superuser to confirm
-- the fix works under RLS — or just do a real cash sale on the counter):
--
--   -- Should return 'A<n>' without error:
--   SELECT public.generate_order_number('a0000000-0000-0000-0000-000000000001'::uuid);
--
--   -- Verify both functions are now SECURITY DEFINER:
--   SELECT proname, prosecdef
--   FROM pg_proc
--   WHERE proname = 'generate_order_number';
--   -- Expected: prosecdef = true for both rows.
