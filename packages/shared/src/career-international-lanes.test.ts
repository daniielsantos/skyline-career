import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MAX,
  DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MIN,
  DYNAMIC_INTL_LANES_MAX,
  DYNAMIC_INTL_LANES_PER_COUNTRY_BUDGET_MAX,
  DYNAMIC_INTL_LANES_PER_COUNTRY_MIN,
  intlGatewayBudget,
  intlLaneBudget,
  orderIntlDirsOriginRoundRobin,
} from './career-international-lanes.js';

describe('intl proportional budgets', () => {
  it('scales gateways with hub count inside [2, 12]', () => {
    assert.equal(intlGatewayBudget(0), DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MIN);
    assert.equal(intlGatewayBudget(12), DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MIN);
    assert.equal(intlGatewayBudget(24), 2);
    assert.equal(intlGatewayBudget(25), 3);
    assert.equal(intlGatewayBudget(60), 5);
    assert.equal(intlGatewayBudget(96), 8);
    assert.equal(intlGatewayBudget(144), DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MAX);
    assert.equal(intlGatewayBudget(400), DYNAMIC_INTL_GATEWAYS_PER_COUNTRY_MAX);
  });

  it('falls back to linear lane budget without world totals', () => {
    assert.equal(intlLaneBudget(0), DYNAMIC_INTL_LANES_PER_COUNTRY_MIN);
    assert.equal(intlLaneBudget(10), Math.round(2 + 10 * 0.14));
    assert.equal(intlLaneBudget(100), Math.round(2 + 100 * 0.14));
  });

  it('allocates lane involvement by hub share of the world pool', () => {
    const totalCargoHubs = 2_000;
    const countryCount = 200;
    const br = intlLaneBudget(100, { totalCargoHubs, countryCount });
    const island = intlLaneBudget(2, { totalCargoHubs, countryCount });
    assert.ok(br > island, `BR ${br} should beat island ${island}`);
    assert.ok(br > 8, `large country should clear old flat cap, got ${br}`);
    assert.ok(
      br <= DYNAMIC_INTL_LANES_PER_COUNTRY_BUDGET_MAX,
      `BR exceeds budget max: ${br}`,
    );
    assert.ok(
      island >= DYNAMIC_INTL_LANES_PER_COUNTRY_MIN && island < br,
      `island budget should stay thin, got ${island}`,
    );
    // Pool ≈ 2×LANES_MAX; BR share 100/2000 of extras after floors.
    const base = DYNAMIC_INTL_LANES_PER_COUNTRY_MIN;
    const extraPool = DYNAMIC_INTL_LANES_MAX * 2 - countryCount * base;
    const expected = Math.min(
      DYNAMIC_INTL_LANES_PER_COUNTRY_BUDGET_MAX,
      base + Math.round((100 / totalCargoHubs) * extraPool),
    );
    assert.equal(br, expected);
  });
});

describe('orderIntlDirsOriginRoundRobin', () => {
  it('interleaves origin countries instead of pure global nm-sort', () => {
    const dirs = [
      { originCountryId: 'DE', nm: 120, originIcao: 'EDDF', destIcao: 'LFPG' },
      { originCountryId: 'DE', nm: 200, originIcao: 'EDDM', destIcao: 'LIRF' },
      { originCountryId: 'BR', nm: 900, originIcao: 'SBGR', destIcao: 'SCEL' },
      { originCountryId: 'BR', nm: 1_200, originIcao: 'SBSN', destIcao: 'SPQU' },
      { originCountryId: 'US', nm: 400, originIcao: 'KJFK', destIcao: 'CYYZ' },
    ];
    const ordered = orderIntlDirsOriginRoundRobin(dirs);
    assert.deepEqual(
      ordered.map((d) => d.originCountryId),
      ['BR', 'DE', 'US', 'BR', 'DE'],
    );
    assert.equal(ordered[0]?.originIcao, 'SBGR');
    assert.equal(ordered[1]?.originIcao, 'EDDF');
    assert.equal(ordered[2]?.originIcao, 'KJFK');
  });
});
