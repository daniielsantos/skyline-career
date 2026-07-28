import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import type {
  AircraftProfile,
  FingerprintRequest,
  FingerprintResponse,
  HomologationSession,
  HomologationSessionStartRequest,
  OperationTelemetryBatch,
  ProfileDocumentEnvelope,
  ProfileManifest,
  ProfileResolveResponse,
} from '@msfs-compat/shared';
import { computeFingerprintV2, signDocument } from '@msfs-compat/shared';
import type { CatalogBackend, CatalogEntry } from './types.js';

const { Pool } = pg;

export interface PostgresCatalogStoreOptions {
  databaseUrl: string;
  signingKey?: string;
  publicBaseUrl?: string;
}

type ProfileRow = {
  fingerprint_v2: string;
  structural_hash: string;
  profile_key: string;
  semver: string;
  status: 'active' | 'provisional' | 'draft' | 'deprecated' | 'blocked';
  confidence_score: string | number;
  capabilities: string[] | null;
  document_hash: string;
  signature: string | null;
  profile_document: AircraftProfile;
};

export class PostgresCatalogStore implements CatalogBackend {
  readonly signingKey: string;
  readonly publicBaseUrl: string;
  private readonly pool: pg.Pool;

  constructor(options: PostgresCatalogStoreOptions) {
    this.pool = new Pool({ connectionString: options.databaseUrl });
    this.signingKey = options.signingKey ?? process.env.CATALOG_SIGNING_KEY ?? 'dev-local-key';
    this.publicBaseUrl = (options.publicBaseUrl ?? 'http://localhost:8080/v1').replace(/\/$/, '');
  }

  async init(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getEntries(): Promise<CatalogEntry[]> {
    const { rows } = await this.pool.query<ProfileRow>(
      `SELECT af.fingerprint_v2, af.structural_hash,
              ap.profile_key, ap.semver, ap.status, ap.confidence_score,
              ap.capabilities, ap.document_hash, ap.signature, ap.profile_document
       FROM aircraft_profiles ap
       JOIN aircraft_fingerprints af ON af.id = ap.fingerprint_id
       WHERE ap.status IN ('active', 'provisional')
       ORDER BY ap.profile_key, ap.semver`,
    );
    return rows.map((row) => this.rowToEntry(row));
  }

  private rowToEntry(row: ProfileRow): CatalogEntry {
    const status = row.status === 'active' ? 'active' : 'provisional';
    const profile = row.profile_document;
    const body = JSON.stringify(profile);
    return {
      fingerprint: row.fingerprint_v2,
      structuralHash: row.structural_hash,
      profileKey: row.profile_key,
      semver: row.semver,
      status,
      confidenceScore: Number(row.confidence_score),
      capabilities: row.capabilities ?? ['simconnect'],
      documentHash: row.document_hash,
      signature: row.signature ?? '',
      sizeBytes: Buffer.byteLength(body, 'utf8'),
      profile,
    };
  }

  private async ensurePublisher(slug: string, displayName: string): Promise<string> {
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM aircraft_publishers WHERE slug = $1`,
      [slug],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO aircraft_publishers (slug, display_name)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [slug, displayName],
    );
    return inserted.rows[0]!.id;
  }

  private async findBestProfile(fingerprint: string): Promise<ProfileRow | null> {
    const { rows } = await this.pool.query<ProfileRow>(
      `SELECT af.fingerprint_v2, af.structural_hash,
              ap.profile_key, ap.semver, ap.status, ap.confidence_score,
              ap.capabilities, ap.document_hash, ap.signature, ap.profile_document
       FROM aircraft_profiles ap
       JOIN aircraft_fingerprints af ON af.id = ap.fingerprint_id
       WHERE af.fingerprint_v2 = $1
         AND ap.status IN ('active', 'provisional')
       ORDER BY CASE ap.status WHEN 'active' THEN 0 ELSE 1 END,
                ap.confidence_score DESC
       LIMIT 1`,
      [fingerprint],
    );
    return rows[0] ?? null;
  }

  async registerFingerprint(request: FingerprintRequest): Promise<FingerprintResponse> {
    const { fingerprint, structuralHash } = computeFingerprintV2({
      identity: request.identity,
      structure: request.structure,
    });

    const publisherId = await this.ensurePublisher(
      request.identity.publisher.toLowerCase().replace(/\s+/g, '-'),
      request.identity.publisher,
    );

    const tankCount = request.structure.tankSchema.length;
    const stationCount = request.structure.stationSchema.length;

    await this.pool.query(
      `INSERT INTO aircraft_fingerprints (
         fingerprint_v2, publisher_id, title, atc_model, atc_type, icao,
         package_name, package_version, base_container, structural_hash,
         tank_count, station_count, empty_weight_lb, max_gross_weight_lb,
         seen_count, last_seen_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 1, now()
       )
       ON CONFLICT (fingerprint_v2) DO UPDATE SET
         last_seen_at = now(),
         seen_count = aircraft_fingerprints.seen_count + 1,
         title = EXCLUDED.title,
         atc_model = EXCLUDED.atc_model,
         atc_type = EXCLUDED.atc_type,
         icao = EXCLUDED.icao,
         structural_hash = EXCLUDED.structural_hash,
         tank_count = EXCLUDED.tank_count,
         station_count = EXCLUDED.station_count`,
      [
        fingerprint,
        publisherId,
        request.identity.title,
        request.identity.atcModel ?? null,
        request.identity.atcType ?? null,
        request.identity.icao ?? null,
        request.identity.packageName ?? null,
        request.identity.packageVersion ?? null,
        request.identity.baseContainer ?? null,
        structuralHash,
        tankCount,
        stationCount,
        request.structure.weightLimits.emptyWeightLb ?? null,
        request.structure.weightLimits.maxGrossWeightLb ?? null,
      ],
    );

    const best = await this.findBestProfile(fingerprint);
    if (!best) {
      return {
        fingerprint,
        known: false,
        homologationRequired: true,
        profileStatus: 'none',
      };
    }

    const status = best.status === 'active' ? 'active' : 'provisional';
    return {
      fingerprint,
      known: true,
      homologationRequired: false,
      profileStatus: status,
      activeProfileKey: best.profile_key,
      activeSemver: best.semver,
      confidenceScore: Number(best.confidence_score),
    };
  }

  async resolveProfile(
    fingerprint: string,
    _simVersion: string,
    channel = 'stable',
  ): Promise<ProfileResolveResponse | null> {
    // Prefer profiles with an active release on the requested channel when present.
    const released = await this.pool.query<ProfileRow>(
      `SELECT af.fingerprint_v2, af.structural_hash,
              ap.profile_key, ap.semver, ap.status, ap.confidence_score,
              ap.capabilities, ap.document_hash, ap.signature, ap.profile_document
       FROM aircraft_profiles ap
       JOIN aircraft_fingerprints af ON af.id = ap.fingerprint_id
       JOIN profile_releases pr ON pr.profile_id = ap.id
       WHERE af.fingerprint_v2 = $1
         AND ap.status IN ('active', 'provisional')
         AND pr.channel = $2
         AND pr.is_active = true
       ORDER BY CASE ap.status WHEN 'active' THEN 0 ELSE 1 END,
                ap.confidence_score DESC
       LIMIT 1`,
      [fingerprint, channel],
    );

    const best = released.rows[0] ?? (await this.findBestProfile(fingerprint));
    if (!best) return null;

    const status = best.status === 'active' ? 'active' : 'provisional';
    return {
      profileKey: best.profile_key,
      semver: best.semver,
      status,
      confidenceScore: Number(best.confidence_score),
      documentUrl: `${this.publicBaseUrl}/profiles/${encodeURIComponent(best.profile_key)}/document?semver=${encodeURIComponent(best.semver)}`,
      documentHash: best.document_hash,
      signature: best.signature ?? '',
      capabilities: best.capabilities ?? ['simconnect'],
    };
  }

  async getManifest(channel = 'stable'): Promise<ProfileManifest> {
    const { rows } = await this.pool.query<ProfileRow>(
      `SELECT af.fingerprint_v2, af.structural_hash,
              ap.profile_key, ap.semver, ap.status, ap.confidence_score,
              ap.capabilities, ap.document_hash, ap.signature, ap.profile_document
       FROM aircraft_profiles ap
       JOIN aircraft_fingerprints af ON af.id = ap.fingerprint_id
       WHERE ap.status IN ('active', 'provisional')
       ORDER BY ap.profile_key, ap.semver`,
    );

    const entries = rows.map((row) => {
      const body = JSON.stringify(row.profile_document);
      return {
        fingerprint: row.fingerprint_v2,
        profileKey: row.profile_key,
        semver: row.semver,
        documentHash: row.document_hash,
        sizeBytes: Buffer.byteLength(body, 'utf8'),
      };
    });

    const generatedAt = new Date().toISOString();
    const manifestVersion = 1;
    const payload = JSON.stringify({ channel, manifestVersion, generatedAt, entries });
    const signature = signDocument(createHash('sha256').update(payload).digest('hex'), this.signingKey);

    return { channel, manifestVersion, generatedAt, entries, signature };
  }

  async getDocument(profileKey: string, semver: string): Promise<ProfileDocumentEnvelope | null> {
    const key = decodeURIComponent(profileKey);
    const { rows } = await this.pool.query<{
      profile_document: AircraftProfile;
      document_hash: string;
      signature: string | null;
    }>(
      `SELECT profile_document, document_hash, signature
       FROM aircraft_profiles
       WHERE profile_key = $1 AND semver = $2
       LIMIT 1`,
      [key, semver],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      profile: row.profile_document as unknown as Record<string, unknown>,
      documentHash: row.document_hash,
      signature: row.signature ?? '',
    };
  }

  async startHomologationSession(request: HomologationSessionStartRequest): Promise<HomologationSession> {
    const fp = await this.pool.query<{ id: string }>(
      `SELECT id FROM aircraft_fingerprints WHERE fingerprint_v2 = $1`,
      [request.fingerprint],
    );
    let fingerprintId = fp.rows[0]?.id;
    if (!fingerprintId) {
      // Create a placeholder fingerprint so the FK succeeds.
      const publisherId = await this.ensurePublisher('unknown', 'Unknown');
      const inserted = await this.pool.query<{ id: string }>(
        `INSERT INTO aircraft_fingerprints (fingerprint_v2, publisher_id, title, structural_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (fingerprint_v2) DO UPDATE SET last_seen_at = now()
         RETURNING id`,
        [request.fingerprint, publisherId, 'Unknown aircraft', '0'.repeat(64)],
      );
      fingerprintId = inserted.rows[0]!.id;
    }

    const sessionId = randomUUID();
    await this.pool.query(
      `INSERT INTO homologation_sessions (id, fingerprint_id, client_id, user_id, sim_version, status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6::jsonb)`,
      [
        sessionId,
        fingerprintId,
        request.clientId,
        request.userId ?? null,
        request.simVersion,
        JSON.stringify({ checklist: true }),
      ],
    );

    return {
      sessionId,
      fingerprint: request.fingerprint,
      checklist: [
        'Confirm aircraft on ground with parking brake',
        'Run draft-profile --calibrate (or calibrate existing draft)',
        'Run smoke --profile <draft.json>',
        'Promote to profiles/examples when fuel+payload succeed',
      ],
    };
  }

  async ingestOperations(batch: OperationTelemetryBatch): Promise<{ accepted: number }> {
    let accepted = 0;
    for (const event of batch.events ?? []) {
      let fingerprintId: string | null = null;
      if (event.fingerprint) {
        const r = await this.pool.query<{ id: string }>(
          `SELECT id FROM aircraft_fingerprints WHERE fingerprint_v2 = $1`,
          [event.fingerprint],
        );
        fingerprintId = r.rows[0]?.id ?? null;
      }

      let profileId: string | null = null;
      if (event.profileKey && event.profileSemver) {
        const r = await this.pool.query<{ id: string }>(
          `SELECT id FROM aircraft_profiles WHERE profile_key = $1 AND semver = $2`,
          [event.profileKey, event.profileSemver],
        );
        profileId = r.rows[0]?.id ?? null;
      }

      await this.pool.query(
        `INSERT INTO client_operations (
           client_id, fingerprint_id, profile_id, operation, success,
           strategy_used, fallback_used, duration_ms, error_code, profile_semver, context
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          batch.clientId,
          fingerprintId,
          profileId,
          event.operation,
          event.success,
          event.strategyUsed ?? null,
          event.fallbackUsed ?? false,
          event.durationMs ?? null,
          event.errorCode ?? null,
          event.profileSemver ?? null,
          JSON.stringify(event.context ?? {}),
        ],
      );
      accepted += 1;
    }
    return { accepted };
  }
}
