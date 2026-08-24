-- Disponibilité d'un produit par jour et par plage horaire.
--
-- Jusqu'ici un produit n'avait que `is_available` (booléen global, basculé à la
-- main en cas de rupture). Impossible d'exprimer « le menu étudiant se vend du
-- lundi au vendredi entre 11h30 et 14h ». Cette colonne ajoute cette règle sans
-- toucher à `is_available`, qui garde son rôle : la rupture de stock.
--
-- Les deux se combinent en ET : un produit hors de sa plage n'est pas vendable,
-- un produit en rupture non plus.
--
-- Forme du JSON (NULL = disponible en permanence, comportement historique) :
--   {
--     "days":  [1,2,3,4,5],                          -- ISO : 1 = lundi … 7 = dimanche
--     "slots": [{"start": "11:30", "end": "14:00"}], -- heures locales Europe/Brussels
--     "from":  "2026-08-31",                         -- optionnel, début de validité
--     "until": null                                  -- optionnel, fin de validité
--   }
--
-- `days` vide ou absent = tous les jours. `slots` vide ou absent = toute la journée.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS availability_schedule jsonb;

COMMENT ON COLUMN public.products.availability_schedule IS
  'Règle de disponibilité par jour/plage horaire (heures locales Europe/Brussels). '
  'NULL = toujours disponible. Se combine en ET avec is_available. '
  'Forme : {"days":[1..7],"slots":[{"start":"HH:MM","end":"HH:MM"}],"from":"YYYY-MM-DD","until":"YYYY-MM-DD"}';

-- Garde-fou : on refuse une règle mal formée plutôt que de la laisser filer et
-- de découvrir en plein service qu'un produit n'est jamais vendable.
--
-- La validation vit dans une fonction parce qu'un CHECK n'accepte pas de
-- sous-requête, et qu'il en faut une pour parcourir les tableaux JSON.
-- `search_path` est figé comme sur les autres fonctions du schéma
-- (cf. 2026-07-02_hardening_functions.sql).
CREATE OR REPLACE FUNCTION public.is_valid_availability_schedule(regle jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT
    regle IS NULL
    OR (
      jsonb_typeof(regle) = 'object'
      AND (
        NOT regle ? 'days'
        OR regle -> 'days' = 'null'::jsonb
        OR (
          jsonb_typeof(regle -> 'days') = 'array'
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(regle -> 'days') AS d
            WHERE jsonb_typeof(d) <> 'number'
               OR (d)::text::numeric NOT BETWEEN 1 AND 7
          )
        )
      )
      AND (
        NOT regle ? 'slots'
        OR regle -> 'slots' = 'null'::jsonb
        OR (
          jsonb_typeof(regle -> 'slots') = 'array'
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(regle -> 'slots') AS s
            WHERE jsonb_typeof(s) <> 'object'
               OR NOT (s ? 'start') OR NOT (s ? 'end')
               OR s ->> 'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
               OR s ->> 'end'   !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
               OR (s ->> 'start') >= (s ->> 'end')
          )
        )
      )
      AND (
        NOT regle ? 'from'
        OR regle -> 'from' = 'null'::jsonb
        OR regle ->> 'from' ~ '^\d{4}-\d{2}-\d{2}$'
      )
      AND (
        NOT regle ? 'until'
        OR regle -> 'until' = 'null'::jsonb
        OR regle ->> 'until' ~ '^\d{4}-\d{2}-\d{2}$'
      )
    );
$$;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_availability_schedule_shape;

ALTER TABLE public.products
  ADD CONSTRAINT products_availability_schedule_shape
  CHECK (public.is_valid_availability_schedule(availability_schedule));

-- Les produits à horaires restent rares : un index partiel suffit et ne coûte
-- rien sur les produits existants qui ont la colonne à NULL.
CREATE INDEX IF NOT EXISTS idx_products_availability_schedule
  ON public.products (establishment_id)
  WHERE availability_schedule IS NOT NULL;
