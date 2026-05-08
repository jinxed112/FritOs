-- Migration: add per-profile establishment binding
-- Date: 2026-05-09
-- Sprint: J2 — fix/multi-tenant-selector-pilot (PR A)
--
-- Context:
--   The admin back-office currently hardcodes the Boussu UUID in 21 files,
--   which makes Jurbise unreachable. PR A introduces a signed admin cookie
--   that holds the currently-selected establishment_id. The cookie is bound
--   to the user, but the server side also needs to know which establishments
--   each non-super_admin user is allowed to select.
--
-- Model (option A, validated):
--   - super_admin → profiles.establishment_id IS NULL → may select any active
--     establishment via the admin sidebar dropdown.
--   - admin / manager / employee → profiles.establishment_id = their site →
--     pinned, no dropdown, auto-selected at login.
--
-- Apply manually via Supabase SQL editor (read-only MCP — Claude does not run
-- migrations). Take a logical backup of the profiles table first.
--
-- Rollback (if needed):
--   ALTER TABLE profiles DROP COLUMN establishment_id;
--   DROP INDEX IF EXISTS idx_profiles_establishment_role;

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS establishment_id UUID
    REFERENCES establishments(id)
    ON DELETE SET NULL;

-- Composite index supports the two main lookups:
--   1. "list members of an establishment" (admin/users page, future)
--   2. "what is the role + establishment of this user" (current-establishment endpoint)
CREATE INDEX IF NOT EXISTS idx_profiles_establishment_role
  ON profiles (establishment_id, role);

COMMIT;

-- Post-migration manual steps (executed by Michele):
--
--   1. Confirm Michele's profile is super_admin with establishment_id = NULL:
--
--        SELECT id, role, establishment_id
--        FROM profiles
--        WHERE id = '<michele_user_id>';
--
--      If role is wrong:
--        UPDATE profiles SET role = 'super_admin', establishment_id = NULL
--        WHERE id = '<michele_user_id>';
--
--   2. For each non-super_admin user, set establishment_id explicitly:
--
--        UPDATE profiles SET establishment_id = '<boussu_uuid>'
--        WHERE role IN ('admin', 'manager', 'employee')
--          AND establishment_id IS NULL
--          AND <some_filter_for_boussu_users>;
--
--      (No bulk default applied here — pinning the wrong people to Boussu
--       would silently leak Jurbise data later.)
