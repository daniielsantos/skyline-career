import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRolesPackFromHeuristic,
  matchHeuristic,
  packMatchesTitle,
  slugFromAircraftTitle,
} from './scaffold-roles.js';

describe('scaffold-roles PMDG 738 PAX', () => {
  it('matches SSW and BW titles', () => {
    assert.equal(matchHeuristic('737-800 PAX SSW TC')?.id, 'pmdg-738-pax');
    assert.equal(matchHeuristic('737-800 PAX BW TC')?.id, 'pmdg-738-pax');
    assert.equal(matchHeuristic('A320neo'), undefined);
  });

  it('builds pack with matchTitles', () => {
    const h = matchHeuristic('737-800 PAX BW TC')!;
    const pack = buildRolesPackFromHeuristic('737-800 PAX BW TC', h);
    assert.ok(packMatchesTitle(pack, '737-800 PAX BW TC'));
    assert.deepEqual(pack.payload?.stationRoles?.passengerStations, [1, 2, 3, 4]);
    assert.deepEqual(pack.liveSources?.fuel, ['pmdg-ng3', 'classic']);
    assert.deepEqual(pack.liveSources?.weights, ['pmdg-efb-lvars']);
    assert.equal(pack.simbriefIcao, 'B738');
    assert.match(pack.simbriefAirframeMatch ?? '', /Dual Class/);
    assert.equal(pack.loadMethod, 'native-simbrief');
    assert.equal(pack.injectCapable, false);
    assert.equal(slugFromAircraftTitle('737-800 PAX BW TC'), '737-800-pax-bw-tc');
  });
});

describe('scaffold-roles PMDG 738 BCF', () => {
  it('matches freighter titles and maps deck as cargo', () => {
    const h = matchHeuristic('737-800BCF SSW');
    assert.equal(h?.id, 'pmdg-738-bcf');
    assert.deepEqual(h?.stationRoles.passengerStations, []);
    assert.deepEqual(h?.stationRoles.baggageStations, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(h?.liveSources.payload, ['pmdg-efb', 'classic-stations']);
    assert.equal(matchHeuristic('737-800BCF BW')?.id, 'pmdg-738-bcf');
  });
});

describe('scaffold-roles TFDi MD-11F', () => {
  it('matches freighter title and maps upper+lower as cargo', () => {
    const h = matchHeuristic('TFDi Design MD-11F PW4462');
    assert.equal(h?.id, 'tfdi-md11f');
    assert.equal(h?.icao, 'MD11');
    assert.deepEqual(h?.stationRoles.passengerStations, []);
    assert.deepEqual(h?.stationRoles.baggageStations, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.deepEqual(h?.stationRoles.crewStations, [1, 2, 3]);
    assert.deepEqual(h?.liveSources.fuel, ['tfdi-efb', 'mass-balance']);
    assert.deepEqual(h?.liveSources.payload, ['tfdi-efb']);
    assert.equal(h?.loadMethod, 'native-simbrief');
    assert.equal(h?.injectCapable, false);
  });
});

describe('scaffold-roles Black Square Caravan', () => {
  it('declares direct-injection for Career autoset', () => {
    const h = matchHeuristic(
      'Black Square Caravan Professional Cargo Pod N208BS',
    );
    assert.equal(h?.id, 'blacksquare-caravan-cargo-pod');
    assert.equal(h?.marketTypeId, 'c208-caravan-cargo');
    assert.equal(h?.loadMethod, 'direct-injection');
    assert.equal(h?.injectCapable, true);
    const pack = buildRolesPackFromHeuristic(
      'Black Square Caravan Professional Cargo Pod N208BS',
      h!,
    );
    assert.equal(pack.loadMethod, 'direct-injection');
    assert.equal(pack.injectCapable, true);
  });
});

describe('scaffold-roles Asobo C208B Cargo', () => {
  it('shares the Caravan Market SKU with a separate station map', () => {
    const h = matchHeuristic('C208B Cargo N208AS');
    assert.equal(h?.id, 'asobo-c208b-cargo');
    assert.equal(h?.marketTypeId, 'c208-caravan-cargo');
    assert.equal(h?.marketLabel, 'Cessna 208 Caravan Cargo');
    assert.deepEqual(h?.stationRoles.baggageStations, [
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });
});

describe('scaffold-roles Black Box BN-2 Islander Cargo', () => {
  it('matches Analogue and Garmin tip-tank as one Market family', () => {
    assert.equal(
      matchHeuristic('BN2 Islander - Cargo / Analogue / Tip Tanks')?.id,
      'blackbox-bn2-islander-cargo-tip-tanks',
    );
    assert.equal(
      matchHeuristic('BN2 Islander - Cargo / Garmin / Tip Tanks')?.id,
      'blackbox-bn2-islander-cargo-tip-tanks',
    );
    const h = matchHeuristic('BN2 Islander - Cargo / Garmin / Tip Tanks')!;
    assert.equal(h.marketLabel, 'BN2 Islander Cargo');
    assert.equal(h.familyPackRel, 'blackbox-bn2-islander-cargo-tip-tanks.json');
    assert.equal(h.loadMethod, 'direct-injection');
  });
});

describe('scaffold-roles Black Square Commander 114', () => {
  it('matches NA and TC as one Market family', () => {
    assert.equal(
      matchHeuristic('Black Square Commander 114')?.id,
      'blacksquare-commander-114',
    );
    assert.equal(
      matchHeuristic('Black Square Commander 114TC N114TC')?.id,
      'blacksquare-commander-114',
    );
    const h = matchHeuristic('Black Square Commander 114TC')!;
    assert.equal(h.marketLabel, 'Rockwell Commander 114');
    assert.equal(h.familyPackRel, 'blacksquare-commander-114.json');
  });
});

describe('scaffold-roles Black Square Bonanza', () => {
  it('matches A36 / A36TC / B36TP as one direct-injection family', () => {
    assert.equal(
      matchHeuristic('Black Square A36 Bonanza Professional')?.id,
      'blacksquare-bonanza-professional',
    );
    assert.equal(
      matchHeuristic('Black Square A36TC Bonanza Professional N5172C')?.id,
      'blacksquare-bonanza-professional',
    );
    assert.equal(
      matchHeuristic('Black Square B36TP Bonanza Professional')?.id,
      'blacksquare-bonanza-professional',
    );
    const h = matchHeuristic('Black Square B36TP Bonanza Professional')!;
    assert.equal(h.loadMethod, 'direct-injection');
    assert.equal(h.injectCapable, true);
    assert.deepEqual(h.stationRoles.crewStations, [1, 2]);
    assert.deepEqual(h.stationRoles.baggageStations, [3, 4, 5, 6, 7]);
  });
});

describe('scaffold-roles Black Square Duke', () => {
  it('matches B60 / Turbine / Grand as one direct-injection family', () => {
    assert.equal(
      matchHeuristic('Black Square B60 Duke')?.id,
      'blacksquare-b60-duke',
    );
    assert.equal(
      matchHeuristic('Black Square Turbine Duke N6060X')?.id,
      'blacksquare-b60-duke',
    );
    assert.equal(
      matchHeuristic('Black Square Grand Duke')?.id,
      'blacksquare-b60-duke',
    );
    const h = matchHeuristic('Black Square B60 Duke')!;
    assert.equal(h.loadMethod, 'direct-injection');
    assert.equal(h.injectCapable, true);
    assert.equal(h.marketLabel, 'Beechcraft Duke BE60');
    // Station 1 is forward baggage — crew is 2–3, not 1–2.
    assert.deepEqual(h.stationRoles.crewStations, [2, 3]);
    assert.deepEqual(h.stationRoles.baggageStations, [1, 4, 5, 6, 7, 8]);
  });
});

describe('scaffold-roles Asobo C172SP Cargo', () => {
  it('matches Classic and G1000 as one Market family', () => {
    assert.equal(matchHeuristic('C172SP Classic Cargo')?.id, 'asobo-c172sp-cargo');
    assert.equal(matchHeuristic('C172SP G1000 Cargo N172SP')?.id, 'asobo-c172sp-cargo');
    const h = matchHeuristic('C172SP G1000 Cargo')!;
    assert.equal(h.marketLabel, 'Cessna 172SP Cargo');
    assert.equal(h.familyPackRel, 'asobo-c172sp-cargo.json');
    assert.deepEqual(h.stationRoles.crewStations, [1, 2]);
    assert.deepEqual(h.stationRoles.baggageStations, [3, 4, 5, 6]);
  });
});

describe('scaffold-roles ToLiss A346', () => {
  it('matches Pax title and maps cabin/baggage stations', () => {
    const h = matchHeuristic('ToLiss A346 PRO [Preset Pax]');
    assert.equal(h?.id, 'toliss-a346');
    assert.equal(h?.icao, 'A346');
    assert.deepEqual(h?.stationRoles.passengerStations, [3, 4, 5]);
    assert.deepEqual(h?.stationRoles.baggageStations, [6, 7]);
    assert.deepEqual(h?.stationRoles.crewStations, [1, 2]);
    assert.deepEqual(h?.liveSources.fuel, ['mass-balance', 'classic']);
    assert.deepEqual(h?.liveSources.weights, ['classic-weights']);
  });
});
