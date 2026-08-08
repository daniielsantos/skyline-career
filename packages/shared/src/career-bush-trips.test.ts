import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertBushTripCatalog,
  BUSH_TRIPS,
  bushTripLegDistanceNm,
  bushTripTotalDistanceNm,
  getBushTrip,
  isBushTripPlayable,
  listBushTrips,
  listPlayableBushTrips,
  type BushTripDef,
} from './career-bush-trips.js';
import {
  isBushFreightOdAllowed,
  isBushHub,
} from './career-bush.js';
import {
  createSeedEconomyWorld,
  tickEconomyN,
} from './career-economy.js';

describe('unified bush trips catalog', () => {
  it('asserts BR round-trip is provisionally playable for board smoke', () => {
    assertBushTripCatalog();
    assert.ok(listBushTrips().length >= 1);
    const trip = getBushTrip('br-rio-negro-tapuruquara');
    assert.ok(trip);
    assert.equal(trip!.countryId, 'BR');
    assert.equal(trip!.msfsValidated, true);
    assert.equal(trip!.legs.length, 2);
    assert.equal(trip!.legs[0]!.fromIcao, 'SBEG');
    assert.equal(trip!.legs[0]!.toIcao, 'SWTP');
    assert.equal(trip!.legs[1]!.toIcao, 'SBEG');
    assert.equal(isBushTripPlayable(trip!), true);
    assert.equal(listPlayableBushTrips().length, 4);
    assert.ok(bushTripLegDistanceNm(trip!.legs[0]!) > 100);
    assert.ok(bushTripTotalDistanceNm(trip!) > 200);
  });

  it('rejects empty / broken chains in assert', () => {
    const bad: BushTripDef = {
      id: 'bad-empty',
      title: 'Bad',
      countryId: 'BR',
      msfsValidated: false,
      legs: [],
    };
    assert.throws(() => assertBushTripCatalog([bad]), /≥1 leg/i);

    const broken: BushTripDef = {
      id: 'bad-chain',
      title: 'Broken',
      countryId: 'BR',
      msfsValidated: false,
      legs: [
        {
          id: 'l1',
          fromIcao: 'SBEG',
          toIcao: 'SWTP',
          waypoints: [],
          cargoKg: 100,
        },
        {
          id: 'l2',
          fromIcao: 'SBSN',
          toIcao: 'SBBE',
          waypoints: [],
          cargoKg: 0,
        },
      ],
    };
    assert.throws(() => assertBushTripCatalog([broken]), /breaks chain/i);
  });

  it('accepts one-way tours that end on a different hub', () => {
    const oneWay: BushTripDef = {
      id: 'one-way-ok',
      title: 'One Way',
      countryId: 'BR',
      msfsValidated: false,
      legs: [
        {
          id: 'l1',
          fromIcao: 'SBEG',
          toIcao: 'SWTP',
          waypoints: [],
          cargoKg: 100,
        },
        {
          id: 'l2',
          fromIcao: 'SWTP',
          toIcao: 'SBSN',
          waypoints: [],
          cargoKg: 50,
        },
      ],
    };
    assert.doesNotThrow(() => assertBushTripCatalog([oneWay]));
  });

  it('treats validated trip as playable when legs are not explicitly false', () => {
    const draft = BUSH_TRIPS[0]!;
    const playable: BushTripDef = {
      ...draft,
      id: 'playable-copy',
      msfsValidated: true,
      legs: draft.legs.map((l) => ({ ...l, msfsValidated: true })),
    };
    assert.equal(isBushTripPlayable(playable), true);
  });
});

describe('Market no longer forms bush freights', () => {
  it('blocks any OD that touches a bush hub', () => {
    assert.equal(isBushFreightOdAllowed('SNYA', 'SBEG'), false);
    assert.equal(isBushFreightOdAllowed('SBEG', 'SWTP'), false);
    assert.equal(isBushFreightOdAllowed('KESW', 'KSEA'), false);
    assert.equal(isBushFreightOdAllowed('26A', 'KRMG'), false);
    assert.equal(isBushFreightOdAllowed('O64', 'KMPI'), false);
    assert.equal(isBushFreightOdAllowed('SBGR', 'SBKP'), true);
  });

  it('formLots never emits lots on bush hubs', () => {
    const world = createSeedEconomyWorld({ seed: 'no-bush-lots' });
    tickEconomyN(world, 24, { advanceWallClock: false });
    const bushTouch = world.lots.filter(
      (l) => isBushHub(l.originIcao) || isBushHub(l.destIcao),
    );
    assert.equal(bushTouch.length, 0);
  });
});
