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
    assert.equal(slugFromAircraftTitle('737-800 PAX BW TC'), '737-800-pax-bw-tc');
  });
});

describe('scaffold-roles PMDG 738 BCF', () => {
  it('matches freighter titles and maps deck as cargo', () => {
    const h = matchHeuristic('737-800BCF SSW');
    assert.equal(h?.id, 'pmdg-738-bcf');
    assert.deepEqual(h?.stationRoles.passengerStations, []);
    assert.deepEqual(h?.stationRoles.baggageStations, [1, 2, 3, 4, 5, 6]);
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
  });
});
