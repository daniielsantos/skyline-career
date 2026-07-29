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
