-- Isolation des données par artisan au niveau de la base de données
-- (Row Level Security), en complément des filtres déjà présents dans le
-- code applicatif — pas à la place.
--
-- Le rôle "postgres" utilisé pour les migrations et les scripts (seed,
-- cron de relance) a l'attribut BYPASSRLS : il continue de tout voir, comme
-- avant, c'est voulu (ce sont des opérations d'administration qui doivent
-- pouvoir traverser tous les artisans). Un nouveau rôle restreint,
-- "app_runtime", est créé ici pour les requêtes de l'application qui
-- servent une session d'un artisan précis (le dashboard) : ce rôle n'a PAS
-- BYPASSRLS, donc les policies ci-dessous s'appliquent réellement à lui.
--
-- Le mot de passe de "app_runtime" est fixé séparément par
-- src/scripts/setupRuntimeRole.ts (jamais en dur dans une migration versionnée).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  artisans, leads, messages, appointments, revenues, reminders, processed_calls
  TO app_runtime;

-- FORCE : applique la policy même au propriétaire de la table (par défaut,
-- Postgres exempte le propriétaire) — filet de sécurité supplémentaire si
-- jamais la propriété des tables change un jour.
ALTER TABLE artisans FORCE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE revenues FORCE ROW LEVEL SECURITY;
ALTER TABLE reminders FORCE ROW LEVEL SECURITY;
ALTER TABLE processed_calls FORCE ROW LEVEL SECURITY;

-- app.artisan_id est fixé par l'application via SET LOCAL, une fois par
-- requête, juste après avoir identifié l'artisan à partir de son jeton de
-- dashboard. Si la variable n'est pas fixée, current_setting(..., true)
-- renvoie NULL et aucune ligne ne correspond : accès fermé par défaut,
-- jamais ouvert par défaut.

DROP POLICY IF EXISTS artisan_isolation ON artisans;
CREATE POLICY artisan_isolation ON artisans
  TO app_runtime
  USING (id = current_setting('app.artisan_id', true)::uuid)
  WITH CHECK (id = current_setting('app.artisan_id', true)::uuid);

DROP POLICY IF EXISTS artisan_isolation ON leads;
CREATE POLICY artisan_isolation ON leads
  TO app_runtime
  USING (artisan_id = current_setting('app.artisan_id', true)::uuid)
  WITH CHECK (artisan_id = current_setting('app.artisan_id', true)::uuid);

DROP POLICY IF EXISTS artisan_isolation ON revenues;
CREATE POLICY artisan_isolation ON revenues
  TO app_runtime
  USING (artisan_id = current_setting('app.artisan_id', true)::uuid)
  WITH CHECK (artisan_id = current_setting('app.artisan_id', true)::uuid);

DROP POLICY IF EXISTS artisan_isolation ON messages;
CREATE POLICY artisan_isolation ON messages
  TO app_runtime
  USING (lead_id IN (SELECT id FROM leads WHERE artisan_id = current_setting('app.artisan_id', true)::uuid))
  WITH CHECK (lead_id IN (SELECT id FROM leads WHERE artisan_id = current_setting('app.artisan_id', true)::uuid));

DROP POLICY IF EXISTS artisan_isolation ON appointments;
CREATE POLICY artisan_isolation ON appointments
  TO app_runtime
  USING (lead_id IN (SELECT id FROM leads WHERE artisan_id = current_setting('app.artisan_id', true)::uuid))
  WITH CHECK (lead_id IN (SELECT id FROM leads WHERE artisan_id = current_setting('app.artisan_id', true)::uuid));

DROP POLICY IF EXISTS artisan_isolation ON reminders;
CREATE POLICY artisan_isolation ON reminders
  TO app_runtime
  USING (lead_id IN (SELECT id FROM leads WHERE artisan_id = current_setting('app.artisan_id', true)::uuid))
  WITH CHECK (lead_id IN (SELECT id FROM leads WHERE artisan_id = current_setting('app.artisan_id', true)::uuid));

-- processed_calls ne contient aucune donnée propre à un artisan (juste des
-- identifiants d'appel Twilio pour éviter un traitement en double) : accès
-- libre pour app_runtime, la RLS reste techniquement active sur la table
-- mais sans filtrage nécessaire ici.
DROP POLICY IF EXISTS runtime_access ON processed_calls;
CREATE POLICY runtime_access ON processed_calls
  TO app_runtime
  USING (true)
  WITH CHECK (true);
