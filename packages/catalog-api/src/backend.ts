import { resolve } from 'node:path';
import type { CatalogBackend } from './types.js';
import { FileCatalogStore } from './store.js';
import { PostgresCatalogStore } from './postgres-store.js';

export interface CreateCatalogBackendOptions {
  repoRoot: string;
  publicBaseUrl?: string;
  profilesDir?: string;
  dataDir?: string;
  databaseUrl?: string;
  signingKey?: string;
}

/**
 * DATABASE_URL → Postgres; otherwise file-backed catalog from profiles/examples.
 */
export function createCatalogBackend(options: CreateCatalogBackendOptions): CatalogBackend {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  const publicBaseUrl = options.publicBaseUrl;
  const signingKey = options.signingKey ?? process.env.CATALOG_SIGNING_KEY;

  if (databaseUrl) {
    return new PostgresCatalogStore({
      databaseUrl,
      publicBaseUrl,
      signingKey,
    });
  }

  return new FileCatalogStore({
    profilesDir: options.profilesDir ?? resolve(options.repoRoot, 'profiles', 'examples'),
    dataDir: options.dataDir ?? resolve(options.repoRoot, '.data', 'catalog'),
    publicBaseUrl,
    signingKey,
  });
}
