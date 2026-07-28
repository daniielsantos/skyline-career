#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogStore } from './store.js';
import { createCatalogServer } from './server.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? '8080');
  const profilesDir = process.env.PROFILES_DIR ?? resolve(repoRoot, 'profiles', 'examples');
  const dataDir = process.env.DATA_DIR ?? resolve(repoRoot, '.data', 'catalog');
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}/v1`;

  const store = new CatalogStore({
    profilesDir,
    dataDir,
    publicBaseUrl,
  });
  await store.init();

  const app = await createCatalogServer({ store });
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(
    { port, profilesDir, dataDir, entries: store.getEntries().length },
    'catalog-api listening',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
