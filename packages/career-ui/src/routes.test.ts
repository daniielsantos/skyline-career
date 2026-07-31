import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCareerPath, pathForLocation } from './routes.ts';

describe('career UI routes', () => {
  it('maps tabs to paths', () => {
    assert.equal(pathForLocation({ tab: 'settings', airportIcao: null }), '/settings');
    assert.equal(pathForLocation({ tab: 'pilot', airportIcao: null }), '/pilot');
    assert.equal(pathForLocation({ tab: 'missions', airportIcao: null }), '/logbook');
    assert.equal(pathForLocation({ tab: 'fleet', airportIcao: null }), '/npc-fleet');
    assert.equal(
      pathForLocation({ tab: 'market', airportIcao: 'sbgl' }),
      '/airport/SBGL',
    );
  });

  it('parses paths including aliases', () => {
    assert.deepEqual(parseCareerPath('/settings'), {
      tab: 'settings',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/missions'), {
      tab: 'missions',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/fleet'), {
      tab: 'fleet',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/airport/sbct'), {
      tab: 'market',
      airportIcao: 'SBCT',
    });
    assert.deepEqual(parseCareerPath('/'), {
      tab: 'market',
      airportIcao: null,
    });
  });
});
