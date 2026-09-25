import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickDefaultPortId } from './ports-default-pick';

const SANTOS = {
  id: 'BRSSZ',
  name: 'Santos',
  countryId: 'BR',
  lat: -23.952,
  lon: -46.308,
  pickupHubs: ['SBGR'],
  deskPickupHub: 'SBGR',
};
const MIAMI = {
  id: 'USMIA',
  name: 'Miami',
  countryId: 'US',
  lat: 25.774,
  lon: -80.171,
  pickupHubs: ['KMIA'],
  deskPickupHub: 'KMIA',
};
const HOUSTON = {
  id: 'USHOU',
  name: 'Houston',
  countryId: 'US',
  lat: 29.682,
  lon: -94.998,
  pickupHubs: ['KIAH'],
  deskPickupHub: 'KIAH',
};

/** KPBI West Palm Beach */
const HOME = { lat: 26.683, lon: -80.096 };

describe('pickDefaultPortId', () => {
  it('picks nearest port to home hub (not catalog[0] Santos)', () => {
    assert.equal(
      pickDefaultPortId({
        ports: [SANTOS, MIAMI, HOUSTON],
        homeLat: HOME.lat,
        homeLon: HOME.lon,
        homeCountryId: 'US',
      }),
      'USMIA',
    );
  });

  it('prefers owned Port FBO over nearer vacant', () => {
    assert.equal(
      pickDefaultPortId({
        ports: [
          SANTOS,
          { ...MIAMI, concession: { status: 'vacant' } },
          { ...HOUSTON, concession: { status: 'yours' } },
        ],
        homeLat: HOME.lat,
        homeLon: HOME.lon,
      }),
      'USHOU',
    );
  });

  it('prefers port linked to owned warehouse hub', () => {
    assert.equal(
      pickDefaultPortId({
        ports: [SANTOS, MIAMI, HOUSTON],
        homeLat: HOME.lat,
        homeLon: HOME.lon,
        ownedWarehouseHubs: ['SBGR'],
      }),
      'BRSSZ',
    );
  });

  it('falls back to home country when coords missing', () => {
    assert.equal(
      pickDefaultPortId({
        ports: [SANTOS, MIAMI, HOUSTON],
        homeCountryId: 'US',
      }),
      'USMIA',
    );
  });

  it('falls back to catalog[0] when nothing else matches', () => {
    assert.equal(pickDefaultPortId({ ports: [SANTOS, MIAMI] }), 'BRSSZ');
  });
});
