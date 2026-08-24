import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertBushLightGa,
  assertFerryNotBush,
  bushLotPayMult,
  bushRequiresLightGa,
  isBushFreightOdAllowed,
  isBushGateway,
  isBushHub,
  isBushTripOnlyHub,
  listBushIcaos,
  listBushTripOnlyIcaos,
} from './career-bush.js';
import { assertBrCareerHubCatalog, BR_CAREER_HUBS } from './career-br-hubs.js';
import { assertCaCareerHubCatalog, CA_CAREER_HUBS } from './career-ca-hubs.js';
import { assertMxCareerHubCatalog, MX_CAREER_HUBS } from './career-mx-hubs.js';
import { assertUsCareerHubCatalog, US_CAREER_HUBS } from './career-us-hubs.js';
import {
  createSeedEconomyWorld,
  migrateEconomyWorld,
} from './career-economy.js';
import {
  ensureDemandOrders,
  listOpenDemandOrders,
} from './career-demand.js';
import { planFerryRoute, hubDistanceNm } from './career-ferry-route.js';
import { emptyMissionsStateV2, selectStarterHub, quoteFerry } from './career-fleet.js';
import { acceptEmptyFlight } from './career-mission.js';
import { resolveAirframeMaxRangeNm } from './career-player-airframes.js';

describe('global soft-field bush hubs', () => {
  it('catalogs bush spokes in BR/US/CA/MX', () => {
    assertBrCareerHubCatalog();
    assertUsCareerHubCatalog();
    assertCaCareerHubCatalog();
    assertMxCareerHubCatalog();
    assert.equal(BR_CAREER_HUBS.filter((h) => h.bush).length, 2);
    assert.equal(US_CAREER_HUBS.filter((h) => h.bush).length, 3);
    assert.equal(CA_CAREER_HUBS.filter((h) => h.bush).length, 3);
    assert.equal(MX_CAREER_HUBS.filter((h) => h.bush).length, 1);
    assert.equal(listBushIcaos().length, 9);
    assert.ok(isBushHub('SNYA'));
    assert.ok(isBushHub('KESW'));
    assert.ok(isBushHub('CYHE'));
    assert.ok(isBushHub('MMCG'));
    assert.ok(isBushGateway('SBEG'));
    assert.ok(isBushGateway('KSEA'));
    assert.ok(isBushGateway('CYVR'));
    assert.ok(isBushGateway('MMCU'));
    assert.equal(isBushHub('SBEG'), false);
    assert.equal(isBushHub('SW2G'), false);
  });

  it('blocks Market freights that touch bush hubs (trips own those ODs)', () => {
    assert.equal(isBushFreightOdAllowed('SNYA', 'SBEG'), false);
    assert.equal(isBushFreightOdAllowed('SBBE', 'SWTP'), false);
    assert.equal(isBushFreightOdAllowed('KESW', 'KSEA'), false);
    assert.equal(isBushFreightOdAllowed('CYHE', 'CYVR'), false);
    assert.equal(isBushFreightOdAllowed('MMCG', 'MMCU'), false);
    assert.equal(isBushFreightOdAllowed('SNYA', 'SWTP'), false);
    assert.equal(isBushFreightOdAllowed('26A', 'KFDK'), false);
    assert.equal(isBushFreightOdAllowed('SBGR', 'SBKP'), true);
    assert.equal(bushRequiresLightGa('SNYA', 'SBEG'), true);
    assert.equal(bushRequiresLightGa('KESW', 'KSEA'), true);
    assert.equal(bushRequiresLightGa('SBGR', 'SBKP'), false);
  });

  it('pads electronics outbound pay from bush', () => {
    assert.ok(bushLotPayMult('SNYA', 'SBEG', 'electronics') > 1.2);
    assert.ok(bushLotPayMult('KESW', 'KSEA', 'electronics') > 1.2);
    assert.ok(bushLotPayMult('SBEG', 'SNYA', 'supplies') > 1);
    assert.equal(bushLotPayMult('SBGR', 'SBKP', 'electronics'), 1);
  });

  it('blocks ferry on soft-field bush; allows ferry into trip-only starts', () => {
    assert.throws(
      () =>
        planFerryRoute({
          originIcao: 'SBEG',
          finalDestIcao: 'SNYA',
          maxRangeNm: 800,
        }),
      /Bush strips require a flown mission/i,
    );
    assert.throws(
      () =>
        planFerryRoute({
          originIcao: 'KSEA',
          finalDestIcao: 'KESW',
          maxRangeNm: 800,
        }),
      /Bush strips require a flown mission/i,
    );
    assert.throws(() => assertFerryNotBush('SBEG', 'SWTP'), /ferry unavailable/i);
    assert.throws(() => assertFerryNotBush('CYVR', 'CYHE'), /ferry unavailable/i);
    assert.doesNotThrow(() => assertFerryNotBush('KRMG', '26A'));
    assert.doesNotThrow(() => assertFerryNotBush('O67', 'O56'));
    assert.doesNotThrow(() => assertFerryNotBush('O67', 'KHTH'));
    assert.doesNotThrow(() => assertFerryNotBush('26A', 'KRMG'));
  });

  it('rejects light_ga gate helper for non-GA on bush OD', () => {
    assert.throws(
      () => assertBushLightGa('SNYA', 'SBEG', 'narrow_freighter'),
      /light GA/i,
    );
    assert.doesNotThrow(() => assertBushLightGa('SNYA', 'SBEG', 'light_ga'));
    assert.doesNotThrow(() =>
      assertBushLightGa('SBGR', 'SBKP', 'narrow_freighter'),
    );
  });

  it('coverage migrate adds bush hubs to legacy saves', () => {
    const fresh = createSeedEconomyWorld({ seed: 'bush-cover' });
    const bush = listBushIcaos();
    assert.ok(bush.every((icao) => fresh.airports.some((a) => a.icao === icao)));
    assert.ok(
      bush.every((icao) => fresh.airports.find((a) => a.icao === icao)?.bush),
    );

    const legacyAirports = fresh.airports.filter((a) => !isBushHub(a.icao));
    const legacy = migrateEconomyWorld({
      version: 3,
      seed: fresh.seed,
      tick: 0,
      lastBatchAtMs: Date.now(),
      airports: JSON.parse(JSON.stringify(legacyAirports)),
      lots: [],
      events: [],
      npcs: [],
      npcFlights: [],
      fuelTrucks: [],
      fuelHauls: [],
      internationalLanes: [],
    });
    for (const icao of bush) {
      assert.ok(legacy.airports.some((a) => a.icao === icao), `missing ${icao}`);
      assert.equal(legacy.airports.find((a) => a.icao === icao)?.bush, true);
    }
  });

  it('blocks bush as starter home hub', () => {
    assert.throws(
      () =>
        selectStarterHub(emptyMissionsStateV2(), 'SNYA', {
          pilotName: 'NoBushHome',
        }),
      /cannot be a home hub/i,
    );
    assert.throws(
      () =>
        selectStarterHub(emptyMissionsStateV2(), 'KESW', {
          pilotName: 'NoBushHomeUs',
        }),
      /cannot be a home hub/i,
    );
    assert.throws(
      () =>
        selectStarterHub(emptyMissionsStateV2(), 'O64', {
          pilotName: 'NoTripOnlyHome',
        }),
      /cannot be a home hub/i,
    );
    assert.ok(isBushTripOnlyHub('26A'));
    assert.ok(listBushTripOnlyIcaos().includes('CA51'));
    assert.equal(isBushHub('26A'), false);
  });

  it('allows ferry out of trip-only to a network hub; empty flight still works', () => {
    const world = createSeedEconomyWorld({ seed: 'empty-o67' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'KMIA', {
      pilotName: 'Recovery Pilot',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    const aircraft = state.fleet[0]!;
    aircraft.locationIcao = 'O67';
    state.pilotIcao = 'O67';

    const maxRangeNm = resolveAirframeMaxRangeNm(
      aircraft.airframeTypeId,
      aircraft.aircraftClassId,
    );
    const candidates = ['KHTH', 'KBIH', 'KCCR', 'KRNO', 'KSFO'].filter((icao) => {
      const nm = hubDistanceNm('O67', icao);
      return nm != null && nm > 0 && nm <= maxRangeNm;
    });
    assert.ok(candidates.length > 0, 'expected a network hub within C172 range of O67');
    const dest = candidates[0]!;

    const quote = quoteFerry(world, state, {
      aircraftId: aircraft.id,
      destIcao: dest,
    });
    assert.equal(quote.originIcao, 'O67');
    assert.equal(quote.destIcao, dest);

    assert.doesNotThrow(() =>
      quoteFerry(world, state, {
        aircraftId: aircraft.id,
        destIcao: 'O56',
      }),
    );

    const accepted = acceptEmptyFlight(world, state, {
      aircraftId: aircraft.id,
      destIcao: dest,
    });
    assert.equal(accepted.mission.emptyFlight, true);
    assert.equal(accepted.mission.originIcao, 'O67');
    assert.equal(accepted.mission.destIcao, dest);
  });

  it('does not post Demand Board orders to bush dests (SimBrief Dispatch)', () => {
    const world = createSeedEconomyWorld({ seed: 'demand-no-bush' });
    const mmcg = world.airports.find((a) => a.icao === 'MMCG');
    assert.ok(mmcg);
    for (const pile of Object.values(mmcg.inventory)) {
      pile.stockKg = 0;
    }
    ensureDemandOrders(world);
    const open = listOpenDemandOrders(world);
    assert.equal(
      open.some((o) => isBushHub(o.destIcao) || isBushTripOnlyHub(o.destIcao)),
      false,
    );
    assert.equal(
      open.some((o) => o.destIcao === 'MMCG' || o.destIcao === 'MM68'),
      false,
    );
  });
});