-- Migration: atomic order_number generation with Brussels timezone
-- Date: 2026-05-09
-- Sprint: J3 — fix/orders-tenant-binding (PR D)
--
-- Problem:
--   Two functions generate order_numbers (e.g. "A01", "A02", …):
--
--   (1) generate_order_number()  — TRIGGER on orders BEFORE INSERT
--       Used by direct INSERTs from the client (kiosk, counter, driver).
--       Reads MAX(order_number) FROM orders … ORDER BY created_at DESC LIMIT 1
--       then assigns NEW.order_number := next.
--       *** RACE CONDITION ***: two concurrent INSERTs see the same row,
--       both compute the same next number → duplicates on the KDS at peak
--       (kiosk + counter at lunch rush). Also uses DATE(created_at) without
--       TZ, so the day boundary rolls at 00:00 UTC = 02:00 Brussels (CEST),
--       which means orders placed between 00:00 and 02:00 Brussels keep
--       yesterday's sequence.
--
--   (2) generate_order_number(p_establishment_id uuid)  — RPC
--       Called from src/app/api/orders/route.ts (click & collect web flow).
--       Already uses INSERT … ON CONFLICT DO NOTHING + UPDATE … RETURNING,
--       which IS atomic thanks to the row-level lock on the unique key
--       (establishment_id, sequence_date). Same TZ bug though.
--
-- Fix:
--   Rewrite both to use a single atomic upsert against the existing table
--   `order_number_sequences` (PK id, UNIQUE (establishment_id, sequence_date),
--    columns current_letter char DEFAULT 'A', current_number int DEFAULT 0).
--   The pattern INSERT … ON CONFLICT (uniq_cols) DO UPDATE SET … RETURNING
--   takes a row-level lock on the conflicting row, serializing concurrent
--   trigger invocations on the same (establishment, day) row.
--   Additionally, switch the day computation to Europe/Brussels so the
--   sequence resets cleanly at the merchant's midnight, not UTC midnight.
--
-- Out of scope:
--   The unique index on orders (establishment_id, day_brussels, order_number)
--   is intentionally NOT added here — it lives in the OrderMdj parallel
--   stack, awaiting this trigger fix to land first to avoid 500s on races.
--
-- Apply manually via Supabase SQL editor after a logical backup.
-- Rollback: re-create the previous functions from a backup.

BEGIN;

-- ─── (1) Trigger function used by direct INSERT into orders ─────────────────
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_date    date    := (NOW() AT TIME ZONE 'Europe/Brussels')::date;
  v_letter  char(1);
  v_number  int;
BEGIN
  -- Skip if explicitly set by the caller (e.g. RPC pre-fill, data import).
  IF NEW.order_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Atomic upsert: INSERT first row of the (establishment, day) pair OR
  -- increment the existing row. ON CONFLICT … DO UPDATE acquires a row
  -- lock on the conflicting row, serializing concurrent INSERTs.
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

-- ─── (2) RPC used by /api/orders POST (click & collect) ─────────────────────
-- Same atomic pattern, fixed TZ.
CREATE OR REPLACE FUNCTION public.generate_order_number(p_establishment_id uuid)
RETURNS varchar
LANGUAGE plpgsql
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

-- Smoke test (run after applying):
--
--   -- 1. Verify the trigger is still attached:
--   SELECT tgname, tgrelid::regclass, tgfoid::regproc
--   FROM pg_trigger
--   WHERE tgrelid = 'orders'::regclass
--     AND tgname ILIKE '%order_number%';
--
--   -- 2. Race test (run from two psql sessions concurrently):
--   --    BEGIN; INSERT INTO orders (establishment_id, …) VALUES (…); -- don't COMMIT yet
--   --    The 2nd session should block until the 1st commits, then get the next number.
--
--   -- 3. TZ test:
--   --    SELECT (NOW() AT TIME ZONE 'Europe/Brussels')::date AS brussels_today,
--   --           CURRENT_DATE AS server_today;
--   --    At ~01:30 Brussels these should differ in winter, not in summer.
