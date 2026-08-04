import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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
import {
  computeFingerprintV2,
  fingerprintFromProfile,
  hashAndSignProfile,
  profileAcceptsLiveTitle,
  signDocument,
} from '@msfs-compat/shared';
import type { CatalogBackend, CatalogEntry } from './types.js';

export interface SeenFingerprint {
  fingerprint: string;
  structuralHash?: string;
  title: string;
  publisher: string;
  icao?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
}

export interface CatalogIndex {
  version: number;
  generatedAt: string;
  entries: CatalogEntry[];
  seen: Record<string, SeenFingerprint>;
}

export interface FileCatalogStoreOptions {
  profilesDir: string;
  dataDir: string;
  signingKey?: string;
  publicBaseUrl?: string;
}

/** File-backed catalog (default when DATABASE_URL is unset). */
export class FileCatalogStore implements CatalogBackend {
  readonly profilesDir: string;
  readonly dataDir: string;
  readonly signingKey: string;
  readonly publicBaseUrl: string;
  private index: CatalogIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: [],
    seen: {},
  };

  constructor(options: FileCatalogStoreOptions) {
    this.profilesDir = resolve(options.profilesDir);
    this.dataDir = resolve(options.dataDir);
    this.signingKey = options.signingKey ?? process.env.CATALOG_SIGNING_KEY ?? 'dev-local-key';
    this.publicBaseUrl = (options.publicBaseUrl ?? 'http://localhost:8080/v1').replace(/\/$/, '');
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(join(this.dataDir, 'sessions'), { recursive: true });
    await mkdir(join(this.dataDir, 'telemetry'), { recursive: true });
    await this.seedFromProfiles();
    await this.persistIndex();
  }

  getEntries(): CatalogEntry[] {
    return this.index.entries;
  }

  async seedFromProfiles(): Promise<void> {
    const entries: CatalogEntry[] = [];
    let files: string[] = [];
    try {
      files = (await readdir(this.profilesDir)).filter((f) => f.endsWith('.json'));
    } catch {
      files = [];
    }

    for (const file of files) {
      const profilePath = join(this.profilesDir, file);
      const raw = await readFile(profilePath, 'utf8');
      const profile = JSON.parse(raw) as AircraftProfile;
      if (!profile?.schemaVersion || !profile.profileKey) continue;

      const { fingerprint, structuralHash } = fingerprintFromProfile(profile);
      const signed = hashAndSignProfile(profile, this.signingKey);

      entries.push({
        fingerprint,
        structuralHash,
        profileKey: profile.profileKey,
        semver: profile.semver,
        status: profile.semver.includes('draft') ? 'provisional' : 'active',
        confidenceScore: profile.semver.includes('draft') ? 0.7 : 0.95,
        capabilities: profile.capabilities ?? ['simconnect'],
        documentHash: signed.documentHash,
        signature: signed.signature,
        sizeBytes: signed.sizeBytes,
        profilePath,
        profile,
      });
    }

    let seen: Record<string, SeenFingerprint> = {};
    try {
      const existing = JSON.parse(
        await readFile(join(this.dataDir, 'index.json'), 'utf8'),
      ) as CatalogIndex;
      seen = existing.seen ?? {};
    } catch {
      seen = {};
    }

    this.index = {
      version: 1,
      generatedAt: new Date().toISOString(),
      entries,
      seen,
    };
  }

  async persistIndex(): Promise<void> {
    const serializable = {
      version: this.index.version,
      generatedAt: this.index.generatedAt,
      seen: this.index.seen,
      entries: this.index.entries.map((e) => ({
        fingerprint: e.fingerprint,
        structuralHash: e.structuralHash,
        profileKey: e.profileKey,
        semver: e.semver,
        status: e.status,
        confidenceScore: e.confidenceScore,
        capabilities: e.capabilities,
        documentHash: e.documentHash,
        signature: e.signature,
        sizeBytes: e.sizeBytes,
        profilePath: e.profilePath,
      })),
    };
    await writeFile(join(this.dataDir, 'index.json'), `${JSON.stringify(serializable, null, 2)}\n`, 'utf8');
  }

  findByFingerprint(fingerprint: string): CatalogEntry | undefined {
    return this.index.entries.find((e) => e.fingerprint === fingerprint);
  }

  findByLiveTitle(liveTitle: string): CatalogEntry | undefined {
    const matches = this.index.entries.filter((e) =>
      profileAcceptsLiveTitle(e.profile, liveTitle),
    );
    if (matches.length === 0) return undefined;
    matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
    return matches[0];
  }

  findByKeySemver(profileKey: string, semver: string): CatalogEntry | undefined {
    const key = decodeURIComponent(profileKey);
    return this.index.entries.find((e) => e.profileKey === key && e.semver === semver);
  }

  registerFingerprint(request: FingerprintRequest): FingerprintResponse {
    const { fingerprint, structuralHash } = computeFingerprintV2({
      identity: request.identity,
      structure: request.structure,
    });

    const now = new Date().toISOString();
    const prev = this.index.seen[fingerprint];
    this.index.seen[fingerprint] = {
      fingerprint,
      structuralHash,
      title: request.identity.title,
      publisher: request.identity.publisher,
      icao: request.identity.icao,
      firstSeenAt: prev?.firstSeenAt ?? now,
      lastSeenAt: now,
      seenCount: (prev?.seenCount ?? 0) + 1,
    };

    void this.persistIndex();

    const byFp = this.findByFingerprint(fingerprint);
    // Same tank/station hash can serve cargo + passenger; only accept when the
    // live title matches this profile (or its liveTitles aliases).
    const entry =
      (byFp && profileAcceptsLiveTitle(byFp.profile, request.identity.title)
        ? byFp
        : undefined) ?? this.findByLiveTitle(request.identity.title);
    if (!entry) {
      return {
        fingerprint,
        known: Boolean(byFp),
        homologationRequired: true,
        profileStatus: 'none',
      };
    }

    return {
      fingerprint,
      known: true,
      homologationRequired: false,
      profileStatus: entry.status,
      activeProfileKey: entry.profileKey,
      activeSemver: entry.semver,
      confidenceScore: entry.confidenceScore,
    };
  }

  resolveProfile(fingerprint: string, _simVersion: string, _channel = 'stable'): ProfileResolveResponse | null {
    let entry = this.findByFingerprint(fingerprint);
    if (entry) {
      const seen = this.index.seen[fingerprint];
      if (seen?.title && !profileAcceptsLiveTitle(entry.profile, seen.title)) {
        entry = this.findByLiveTitle(seen.title);
      }
    }
    if (!entry) {
      const seen = this.index.seen[fingerprint];
      if (seen?.title) {
        entry = this.findByLiveTitle(seen.title);
      }
    }
    if (!entry) return null;

    const documentUrl = `${this.publicBaseUrl}/profiles/${encodeURIComponent(entry.profileKey)}/document?semver=${encodeURIComponent(entry.semver)}`;
    return {
      profileKey: entry.profileKey,
      semver: entry.semver,
      status: entry.status,
      confidenceScore: entry.confidenceScore,
      documentUrl,
      documentHash: entry.documentHash,
      signature: entry.signature,
      capabilities: entry.capabilities,
    };
  }

  getManifest(channel = 'stable'): ProfileManifest {
    const entries = this.index.entries.map((e) => ({
      fingerprint: e.fingerprint,
      profileKey: e.profileKey,
      semver: e.semver,
      documentHash: e.documentHash,
      sizeBytes: e.sizeBytes,
    }));

    const generatedAt = new Date().toISOString();
    const manifestVersion = this.index.version;
    const payload = JSON.stringify({ channel, manifestVersion, generatedAt, entries });
    const signature = signDocument(createHash('sha256').update(payload).digest('hex'), this.signingKey);

    return {
      channel,
      manifestVersion,
      generatedAt,
      entries,
      signature,
    };
  }

  getDocument(profileKey: string, semver: string): ProfileDocumentEnvelope | null {
    const entry = this.findByKeySemver(profileKey, semver);
    if (!entry) return null;
    return {
      profile: entry.profile as unknown as Record<string, unknown>,
      documentHash: entry.documentHash,
      signature: entry.signature,
    };
  }

  async startHomologationSession(request: HomologationSessionStartRequest): Promise<HomologationSession> {
    const sessionId = randomUUID();
    const session: HomologationSession = {
      sessionId,
      fingerprint: request.fingerprint,
      checklist: [
        'Confirm aircraft on ground with parking brake',
        'Run draft-profile --calibrate (or calibrate existing draft)',
        'Run smoke --profile <draft.json>',
        'Promote to profiles/examples when fuel+payload succeed',
      ],
    };
    await writeFile(
      join(this.dataDir, 'sessions', `${sessionId}.json`),
      `${JSON.stringify({ ...session, clientId: request.clientId, simVersion: request.simVersion, createdAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );
    return session;
  }

  async ingestOperations(batch: OperationTelemetryBatch): Promise<{ accepted: number }> {
    const line = `${JSON.stringify({ ...batch, ingestedAt: new Date().toISOString() })}\n`;
    await appendFile(join(this.dataDir, 'telemetry', 'operations.jsonl'), line, 'utf8');
    return { accepted: batch.events?.length ?? 0 };
  }
}

/** @deprecated Use FileCatalogStore */
export { FileCatalogStore as CatalogStore };
