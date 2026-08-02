import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCareerPath, pathForLocation } from './routes.ts';

describe('career UI routes', () => {
  it('maps tabs to canonical operational paths', () => {
    assert.equal(pathForLocation({ tab: 'market', airportIcao: null }), '/freights');
    assert.equal(pathForLocation({ tab: 'aircraft', airportIcao: null }), '/airframes');
    assert.equal(pathForLocation({ tab: 'hangar', airportIcao: null }), '/hangar');
    assert.equal(pathForLocation({ tab: 'staging', airportIcao: null }), '/dispatch');
    assert.equal(pathForLocation({ tab: 'fleet', airportIcao: null }), '/rivals');
    assert.equal(pathForLocation({ tab: 'pilot', airportIcao: null }), '/company');
    assert.equal(pathForLocation({ tab: 'map', airportIcao: null }), '/network');
    assert.equal(pathForLocation({ tab: 'missions', airportIcao: null }), '/logbook');
    assert.equal(pathForLocation({ tab: 'settings', airportIcao: null }), '/settings');
    assert.equal(
      pathForLocation({ tab: 'market', airportIcao: 'sbgl' }),
      '/airport/SBGL',
    );
  });

  it('parses canonical paths and legacy aliases', () => {
    assert.deepEqual(parseCareerPath('/freights'), {
      tab: 'market',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/market'), {
      tab: 'market',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/airframes'), {
      tab: 'aircraft',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/aircraft'), {
      tab: 'aircraft',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/dispatch'), {
      tab: 'staging',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/network'), {
      tab: 'map',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/map'), {
      tab: 'map',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/staging'), {
      tab: 'staging',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/rivals'), {
      tab: 'fleet',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/npc-fleet'), {
      tab: 'fleet',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/fleet'), {
      tab: 'fleet',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/company'), {
      tab: 'pilot',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/pilot'), {
      tab: 'pilot',
      airportIcao: null,
    });
    assert.deepEqual(parseCareerPath('/missions'), {
      tab: 'missions',
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
