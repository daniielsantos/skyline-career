import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CareerPlayerAirframe } from '@msfs-compat/shared';
import {
  compareStationLayouts,
  findMarketFamilyCandidates,
  stationLayoutFromIndexes,
  stationLayoutFromPack,
} from './career-family-merge.js';
import type { OfpRolesPackFile } from './ofp-compliance/scaffold-roles.js';

describe('compareStationLayouts', () => {
  it('classifies identical roles vs same indexes vs different', () => {
    const a = stationLayoutFromIndexes([1, 2, 3, 4], {
      1: 'crew',
      2: 'crew',
      3: 'baggage',
      4: 'baggage',
    });
    const b = stationLayoutFromIndexes([1, 2, 3, 4], {
      1: 'crew',
      2: 'crew',
      3: 'baggage',
      4: 'baggage',
    });
    const c = stationLayoutFromIndexes([1, 2, 3, 4]);
    const d = stationLayoutFromIndexes([1, 2, 3, 4, 5]);
    assert.equal(compareStationLayouts(a, b), 'identical');
    assert.equal(compareStationLayouts(a, c), 'same-indexes');
    assert.equal(compareStationLayouts(a, d), 'different-stations');
  });
});

describe('findMarketFamilyCandidates', () => {
  const catalog: CareerPlayerAirframe[] = [
    {
      typeId: 'blackbox-bn2-islander-cargo-tip-tanks',
      aircraftClassId: 'light_ga',
      label: 'BN2 Islander Cargo',
      rolesPackRelPath: 'profiles/ofp/blackbox-bn2-islander-cargo-tip-tanks.json',
      simbriefIcao: 'BN2P',
      simbriefAirframeMatch: 'Default',
    },
    {
      typeId: 'c208-caravan-cargo',
      aircraftClassId: 'light_turboprop',
      label: 'Cessna 208 Caravan Cargo',
      rolesPackRelPath: 'profiles/ofp/blacksquare-caravan-cargo-pod.json',
      simbriefIcao: 'C208',
      simbriefAirframeMatch: 'Default',
    },
  ];

  const bn2Pack: OfpRolesPackFile = {
    ofpId: 'blackbox-bn2-islander-cargo-tip-tanks',
    matchTitles: ['BN2 Islander - Cargo / Analogue / Tip Tanks'],
    stationMap: [
      { simVarIndex: 1, role: 'crew' },
      { simVarIndex: 2, role: 'crew' },
      { simVarIndex: 3, role: 'baggage' },
      { simVarIndex: 4, role: 'baggage' },
    ],
  };

  it('finds same ICAO + class with compatible stations', () => {
    const packs = new Map([
      ['profiles/ofp/blackbox-bn2-islander-cargo-tip-tanks.json', bn2Pack],
    ]);
    const found = findMarketFamilyCandidates({
      icao: 'BN2P',
      aircraftClassId: 'light_ga',
      profileLayout: stationLayoutFromIndexes([1, 2, 3, 4], {
        1: 'crew',
        2: 'crew',
        3: 'baggage',
        4: 'baggage',
      }),
      matchTitle: 'BN2 Islander - Cargo / Garmin / Tip Tanks',
      catalog,
      packsByRelPath: packs,
    });
    assert.equal(found.length, 1);
    assert.equal(found[0]!.typeId, 'blackbox-bn2-islander-cargo-tip-tanks');
    assert.equal(found[0]!.compatibility, 'identical');
  });

  it('skips when title already in the family pack', () => {
    const packs = new Map([
      ['profiles/ofp/blackbox-bn2-islander-cargo-tip-tanks.json', bn2Pack],
    ]);
    const found = findMarketFamilyCandidates({
      icao: 'BN2P',
      aircraftClassId: 'light_ga',
      profileLayout: stationLayoutFromIndexes([1, 2, 3, 4]),
      matchTitle: 'BN2 Islander - Cargo / Analogue / Tip Tanks',
      catalog,
      packsByRelPath: packs,
    });
    assert.equal(found.length, 0);
  });

  it('does not match a different ICAO', () => {
    const found = findMarketFamilyCandidates({
      icao: 'C172',
      aircraftClassId: 'light_ga',
      profileLayout: stationLayoutFromIndexes([1, 2, 3, 4]),
      catalog,
      packsByRelPath: new Map(),
    });
    assert.equal(found.length, 0);
  });

  it('reads station layout from an OFP pack', () => {
    const layout = stationLayoutFromPack(bn2Pack);
    assert.deepEqual(layout?.indexes, [1, 2, 3, 4]);
    assert.match(layout?.rolesKey ?? '', /crew/);
  });
});
