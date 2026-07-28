import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AircraftProfile, ProfileDocumentEnvelope, ProfileManifest } from '@msfs-compat/shared';
import { CatalogClient } from './catalog-client.js';

export interface CachedProfile {
  path: string;
  profile: AircraftProfile;
  documentHash: string;
  signature: string;
}

function slugKey(profileKey: string, semver: string): string {
  return `${profileKey.replace(/[\\/]/g, '__')}__${semver}.json`;
}

export class ProfileCache {
  readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = resolve(cacheDir);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
  }

  async writeEnvelope(envelope: ProfileDocumentEnvelope): Promise<CachedProfile> {
    await this.ensureDir();
    const profile = envelope.profile as unknown as AircraftProfile;
    const file = slugKey(profile.profileKey, profile.semver);
    const path = join(this.cacheDir, file);
    const payload = {
      documentHash: envelope.documentHash,
      signature: envelope.signature,
      profile,
    };
    await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return {
      path,
      profile,
      documentHash: envelope.documentHash,
      signature: envelope.signature,
    };
  }

  async findByFingerprint(fingerprint: string): Promise<CachedProfile | undefined> {
    await this.ensureDir();
    let files: string[] = [];
    try {
      files = (await readdir(this.cacheDir)).filter((f) => f.endsWith('.json'));
    } catch {
      return undefined;
    }

    for (const file of files) {
      try {
        const raw = JSON.parse(await readFile(join(this.cacheDir, file), 'utf8')) as {
          documentHash: string;
          signature: string;
          profile: AircraftProfile;
        };
        if (raw.profile?.match?.fingerprint === fingerprint) {
          return {
            path: join(this.cacheDir, file),
            profile: raw.profile,
            documentHash: raw.documentHash,
            signature: raw.signature,
          };
        }
      } catch {
        // skip
      }
    }
    return undefined;
  }

  async findByKey(profileKey: string, semver: string): Promise<CachedProfile | undefined> {
    const path = join(this.cacheDir, slugKey(profileKey, semver));
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as {
        documentHash: string;
        signature: string;
        profile: AircraftProfile;
      };
      return {
        path,
        profile: raw.profile,
        documentHash: raw.documentHash,
        signature: raw.signature,
      };
    } catch {
      return undefined;
    }
  }

  async syncFromCatalog(client: CatalogClient, channel = 'stable'): Promise<{
    manifest: ProfileManifest;
    downloaded: number;
    skipped: number;
  }> {
    const manifest = await client.getManifest(channel);
    let downloaded = 0;
    let skipped = 0;

    for (const entry of manifest.entries) {
      const existing = await this.findByKey(entry.profileKey, entry.semver);
      if (existing && existing.documentHash === entry.documentHash) {
        skipped += 1;
        continue;
      }
      const envelope = await client.getDocument(entry.profileKey, entry.semver);
      await this.writeEnvelope(envelope);
      downloaded += 1;
    }

    await writeFile(
      join(this.cacheDir, '_manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    return { manifest, downloaded, skipped };
  }
}
