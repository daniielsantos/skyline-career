-- MSFS Compatibility Layer — initial schema
-- PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

CREATE TYPE profile_status AS ENUM (
  'draft',
  'provisional',
  'active',
  'deprecated',
  'blocked'
);

CREATE TYPE homologation_session_status AS ENUM (
  'pending',
  'in_progress',
  'submitted',
  'rejected',
  'accepted'
);

CREATE TYPE sample_quality AS ENUM (
  'rejected',
  'low',
  'medium',
  'high'
);

CREATE TYPE conflict_resolution AS ENUM (
  'open',
  'auto_resolved',
  'manual_resolved',
  'ignored'
);

-- ---------------------------------------------------------------------------
-- Aircraft identity
-- ---------------------------------------------------------------------------

CREATE TABLE aircraft_publishers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE aircraft_fingerprints (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_v2        CHAR(64) NOT NULL UNIQUE,
  publisher_id          UUID REFERENCES aircraft_publishers(id),
  title                 TEXT NOT NULL,
  atc_model             TEXT,
  atc_type              TEXT,
  icao                  TEXT,
  package_name          TEXT,
  package_version       TEXT,
  base_container        TEXT,
  structural_hash       CHAR(64) NOT NULL,
  tank_count            SMALLINT,
  station_count         SMALLINT,
  empty_weight_lb       NUMERIC(10, 2),
  max_gross_weight_lb   NUMERIC(10, 2),
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count            BIGINT NOT NULL DEFAULT 1,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_aircraft_fingerprints_lookup
  ON aircraft_fingerprints (publisher_id, title, package_version);

CREATE INDEX idx_aircraft_fingerprints_icao
  ON aircraft_fingerprints (icao);

-- ---------------------------------------------------------------------------
-- Profiles (versioned, signed)
-- ---------------------------------------------------------------------------

CREATE TABLE aircraft_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key       TEXT NOT NULL,
  fingerprint_id    UUID NOT NULL REFERENCES aircraft_fingerprints(id) ON DELETE CASCADE,
  semver            TEXT NOT NULL,
  status            profile_status NOT NULL DEFAULT 'draft',
  confidence_score  NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 1),
  capabilities      TEXT[] NOT NULL DEFAULT '{}',
  profile_document  JSONB NOT NULL,
  document_hash     CHAR(64) NOT NULL,
  signature         TEXT,
  changelog         TEXT,
  min_sim_version   TEXT,
  max_sim_version   TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at      TIMESTAMPTZ,
  deprecated_at     TIMESTAMPTZ,
  UNIQUE (profile_key, semver)
);

CREATE INDEX idx_aircraft_profiles_fingerprint_status
  ON aircraft_profiles (fingerprint_id, status, confidence_score DESC);

CREATE INDEX idx_aircraft_profiles_active
  ON aircraft_profiles (status)
  WHERE status IN ('provisional', 'active');

-- Rollout / canary distribution
CREATE TABLE profile_releases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES aircraft_profiles(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL DEFAULT 'stable',
  rollout_pct     SMALLINT NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  sim_version_min TEXT,
  sim_version_max TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at    TIMESTAMPTZ
);

CREATE INDEX idx_profile_releases_active
  ON profile_releases (channel, is_active);

-- ---------------------------------------------------------------------------
-- Homologation pipeline
-- ---------------------------------------------------------------------------

CREATE TABLE homologation_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_id    UUID NOT NULL REFERENCES aircraft_fingerprints(id) ON DELETE CASCADE,
  client_id         TEXT NOT NULL,
  user_id           TEXT,
  sim_version       TEXT NOT NULL,
  status            homologation_session_status NOT NULL DEFAULT 'pending',
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  flight_summary    JSONB NOT NULL DEFAULT '{}'::jsonb,
  rejection_reason  TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_homologation_sessions_fingerprint
  ON homologation_sessions (fingerprint_id, status, started_at DESC);

CREATE TABLE homologation_samples (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES homologation_sessions(id) ON DELETE CASCADE,
  fingerprint_id    UUID NOT NULL REFERENCES aircraft_fingerprints(id) ON DELETE CASCADE,
  quality           sample_quality NOT NULL DEFAULT 'low',
  quality_score     NUMERIC(5, 4) NOT NULL DEFAULT 0,
  phase             TEXT NOT NULL,
  captured_at       TIMESTAMPTZ NOT NULL,
  sim_state         JSONB NOT NULL,
  write_attempts    JSONB NOT NULL DEFAULT '[]'::jsonb,
  readback          JSONB NOT NULL DEFAULT '{}'::jsonb,
  inferred_strategy JSONB,
  flags             TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_homologation_samples_fingerprint_quality
  ON homologation_samples (fingerprint_id, quality, created_at DESC);

-- Aggregated inference results before profile promotion
CREATE TABLE profile_candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_id      UUID NOT NULL REFERENCES aircraft_fingerprints(id) ON DELETE CASCADE,
  candidate_document  JSONB NOT NULL,
  support_count       INTEGER NOT NULL DEFAULT 0,
  success_rate        NUMERIC(5, 4) NOT NULL DEFAULT 0,
  variance_score      NUMERIC(5, 4) NOT NULL DEFAULT 0,
  composite_score     NUMERIC(5, 4) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_candidates_fingerprint_score
  ON profile_candidates (fingerprint_id, composite_score DESC);

CREATE TABLE profile_conflicts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_id  UUID NOT NULL REFERENCES aircraft_fingerprints(id) ON DELETE CASCADE,
  candidate_a_id  UUID NOT NULL REFERENCES profile_candidates(id) ON DELETE CASCADE,
  candidate_b_id  UUID NOT NULL REFERENCES profile_candidates(id) ON DELETE CASCADE,
  conflict_type   TEXT NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution      conflict_resolution NOT NULL DEFAULT 'open',
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Runtime telemetry & operations
-- ---------------------------------------------------------------------------

CREATE TABLE client_operations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT NOT NULL,
  user_id         TEXT,
  fingerprint_id  UUID REFERENCES aircraft_fingerprints(id),
  profile_id      UUID REFERENCES aircraft_profiles(id),
  operation       TEXT NOT NULL,
  success         BOOLEAN NOT NULL,
  strategy_used   TEXT,
  fallback_used   BOOLEAN NOT NULL DEFAULT false,
  duration_ms     INTEGER,
  error_code      TEXT,
  sim_version     TEXT,
  profile_semver  TEXT,
  context         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_operations_fingerprint_created
  ON client_operations (fingerprint_id, created_at DESC);

CREATE INDEX idx_client_operations_success
  ON client_operations (operation, success, created_at DESC);

-- Manifest for CDN / delta distribution
CREATE TABLE profile_manifests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel         TEXT NOT NULL DEFAULT 'stable',
  manifest_version INTEGER NOT NULL,
  manifest_body   JSONB NOT NULL,
  signature       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, manifest_version)
);

-- ---------------------------------------------------------------------------
-- Helper views
-- ---------------------------------------------------------------------------

CREATE VIEW v_active_profiles AS
SELECT
  af.fingerprint_v2,
  af.title,
  af.icao,
  ap.profile_key,
  ap.semver,
  ap.status,
  ap.confidence_score,
  ap.capabilities,
  ap.document_hash,
  ap.published_at
FROM aircraft_profiles ap
JOIN aircraft_fingerprints af ON af.id = ap.fingerprint_id
WHERE ap.status IN ('provisional', 'active')
  AND (ap.published_at IS NULL OR ap.published_at <= now());
