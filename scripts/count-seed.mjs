import { createSeedEconomyWorld } from '../packages/shared/dist/career-economy.js';

try {
  const w = createSeedEconomyWorld({ seed: 'count' });
  console.log('SEED_COUNT', w.airports.length);
} catch (err) {
  console.error('SEED_FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
}
