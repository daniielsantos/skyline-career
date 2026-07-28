#!/usr/bin/env node
/**
 * Seed profiles/examples into Postgres (upsert publisher, fingerprint, profile, release).
 * Requires DATABASE_URL and built @msfs-compat/shared.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://skyline:skyline@localhost:5432/skyline';
const sharedPath = pathToFileURL(join(root, 'packages', 'shared', 'dist', 'index.js')).href;

async function main() {
  const shared = await import(sharedPath);
  const examplesDir = join(root, 'profiles', 'examples');
  const files = (await readdir(examplesDir)).filter((f) => f.endsWith('.json'));
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const signingKey = process.env.CATALOG_SIGNING_KEY ?? 'dev-local-key';
  let seeded = 0;

  try {
    for (const file of files) {
      const profile = JSON.parse(await readFile(join(examplesDir, file), 'utf8'));
      if (!profile?.profileKey) continue;

      const { fingerprint, structuralHash } = shared.fingerprintFromProfile(profile);
      const signed = shared.hashAndSignProfile(profile, signingKey);
      const publisherSlug = (profile.match?.publisher ?? 'asobo').toLowerCase().replace(/\s+/g, '-');
      const publisherName = profile.match?.publisher ?? 'asobo';
      const status = String(profile.semver).includes('draft') ? 'provisional' : 'active';
      const confidence = status === 'active' ? 0.95 : 0.7;
      const tankCount = profile.fuel?.tanks?.length ?? 0;
      const stationCount = profile.payload?.stations?.length ?? 0;

      const pub = await client.query(
        `INSERT INTO aircraft_publishers (slug, display_name)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id`,
        [publisherSlug, publisherName],
      );
      const publisherId = pub.rows[0].id;

      const fp = await client.query(
        `INSERT INTO aircraft_fingerprints (
           fingerprint_v2, publisher_id, title, icao, structural_hash,
           tank_count, station_count, seen_count, last_seen_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, now())
         ON CONFLICT (fingerprint_v2) DO UPDATE SET
           title = EXCLUDED.title,
           icao = EXCLUDED.icao,
           structural_hash = EXCLUDED.structural_hash,
           tank_count = EXCLUDED.tank_count,
           station_count = EXCLUDED.station_count,
           last_seen_at = now()
         RETURNING id`,
        [
          fingerprint,
          publisherId,
          profile.match?.title ?? profile.displayName ?? profile.profileId,
          profile.match?.icao ?? null,
          structuralHash,
          tankCount,
          stationCount,
        ],
      );
      const fingerprintId = fp.rows[0].id;

      const prof = await client.query(
        `INSERT INTO aircraft_profiles (
           profile_key, fingerprint_id, semver, status, confidence_score,
           capabilities, profile_document, document_hash, signature, published_at
         ) VALUES ($1, $2, $3, $4::profile_status, $5, $6, $7::jsonb, $8, $9, now())
         ON CONFLICT (profile_key, semver) DO UPDATE SET
           fingerprint_id = EXCLUDED.fingerprint_id,
           status = EXCLUDED.status,
           confidence_score = EXCLUDED.confidence_score,
           capabilities = EXCLUDED.capabilities,
           profile_document = EXCLUDED.profile_document,
           document_hash = EXCLUDED.document_hash,
           signature = EXCLUDED.signature,
           published_at = COALESCE(aircraft_profiles.published_at, now())
         RETURNING id`,
        [
          profile.profileKey,
          fingerprintId,
          profile.semver,
          status,
          confidence,
          profile.capabilities ?? ['simconnect'],
          JSON.stringify(profile),
          signed.documentHash,
          signed.signature,
        ],
      );
      const profileId = prof.rows[0].id;

      // Newer seed wins: deprecate other active/provisional versions of the same key.
      await client.query(
        `UPDATE aircraft_profiles
         SET status = 'deprecated'
         WHERE profile_key = $1
           AND semver <> $2
           AND status IN ('active', 'provisional')`,
        [profile.profileKey, profile.semver],
      );

      await client.query(
        `INSERT INTO profile_releases (profile_id, channel, rollout_pct, is_active, activated_at)
         SELECT $1, 'stable', 100, true, now()
         WHERE NOT EXISTS (
           SELECT 1 FROM profile_releases
           WHERE profile_id = $1 AND channel = 'stable' AND is_active = true
         )`,
        [profileId],
      );

      seeded += 1;
      console.log(`[db-seed] ${profile.profileKey}@${profile.semver} → ${fingerprint.slice(0, 12)}…`);
    }
    console.log(`[db-seed] OK seeded=${seeded}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[db-seed] FAILED', err instanceof Error ? err.message || String(err) : err);
  process.exit(1);
});
