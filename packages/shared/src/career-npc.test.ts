import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  createNpcContractPilotOffer,
  createNpcRepositionOffer,
  acceptContractPilotOffer,
  contractPilotLiftKg,
  contractPilotHasFlyableAirframe,
  describeLotMarketPressure,
  drainNpcMroParts,
  ensureNpcAirframes,
  ensureNpcFleet,
  estimateNpcBlockHours,
  contractPilotMissionDeadlineTick,
  listActiveNpcFreights,
  listNpcFleetStatus,
  listMarketLots,
  listRegionMarketPressure,
  migrateEconomyWorld,
  hoursToTicks,
  listNpcHomeRegions,
  NPCS_PER_REGION,
  NPC_FLEET_MIN,
  resolveNpcFleetComposition,
  targetNpcFleetSize,
  NPC_FLEET_COMPOSITION,
  NPC_FLEET_SIZE,
  NPC_MX_INTERVAL_HOURS,
  NPC_MX_PARTS_KG,
  npcAirframeIsHomologated,
  npcCanOfferContractPilot,
  npcClaimForLot,
  npcLaneAirborneKg,
  npcMaxCargoKg,
  quoteContractPilotFeeUsd,
  playerLaneInboundKg,
  laneInboundKg,
  npcLaneSaturation,
  LANE_SATURATION_KG,
  NPC_MIN_BID_KG,
  scoreLotForNpc,
  npcRegionBidCapacity,
  isNpcReadyToBid,
  routeDistanceNm,
  settleNpcOpsDue,
  tickEconomyN,
  MAX_OPEN_REPOSITION_OFFERS,
  MAX_OPEN_STARTER_REPOSITION_OFFERS,
  MIN_OPEN_CONTRACT_PILOT_OFFERS,
  MIN_OPEN_STARTER_CONTRACT_PILOT_OFFERS,
  MIN_STARTER_CREW_OFFERS_PER_ACTIVE_COUNTRY,
  STARTER_CREW_OFFERS_PER_EXTRA_COMPANY,
  MAX_STARTER_CREW_OFFERS_PER_ACTIVE_COUNTRY,
  AWAITING_PILOT_MIN_HOURS,
  AWAITING_PILOT_MAX_HOURS,
  AWAITING_PILOT_SHORT_MIN_HOURS,
  AWAITING_PILOT_SHORT_MAX_HOURS,
  isStarterContractPilotClass,
  countOpenContractPilotOffers,
  countOpenContractPilotOffersInCountry,
  maxOpenContractPilotOffers,
  contractPilotOriginCountry,
  activeContractPilotCountries,
  starterContractPilotCountryFloor,
  starterContractPilotCountryNeedsFloor,
  TICKS_PER_DAY,
  REPOSITION_AWAITING_MAX_HOURS,
  REPOSITION_PILOT_FEE_MIN_USD,
  pickNpcHomeReturnIcao,
  quoteRepositionPilotFeeUsd,
  isDomesticOd,
  isInternationalOdAllowed,
  topUpStarterContractPilotFloor,
} from './career-economy.js';
import { healAwaitingPilotBoardLots } from './career-npc.js';
import { invalidateLaneInboundIndex } from './career-lane-index.js';

type SeedWorld = ReturnType<typeof createSeedEconomyWorld>;

/**
 * Lot whose route still leaves payload for this NPC's airframe.
 * On long legs a small GA SKU burns its whole useful load on fuel, so the crew
 * offer has zero lift and acceptContractPilotOffer rightly refuses it.
 */
function findLiftableLot(
  world: SeedWorld,
  npc: SeedWorld['npcs'][number],
  heldLots: ReadonlySet<string>,
  minAvailableKg = 200,
  extra?: (lot: SeedWorld['lots'][number]) => boolean,
): SeedWorld['lots'][number] | undefined {
  return world.lots.find((lot) => {
    if (heldLots.has(lot.id)) return false;
    if (lot.status !== 'available' && lot.status !== 'reserved') return false;
    if (lot.quantityKg - lot.reservedKg < minAvailableKg) return false;
    if (extra && !extra(lot)) return false;
    const distanceNm = routeDistanceNm(world, lot.originIcao, lot.destIcao);
    if (distanceNm === undefined) return false;
    return (
      contractPilotLiftKg(
        npc.airframeTypeId ?? '',
        npc.aircraftClassId,
        minAvailableKg,
        { distanceNm },
      ) > 0
    );
  });
}
import { cancelMission, getAircraftClass, settleMission } from './career-mission.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import type { NpcFlight, ShipmentLot } from './types/career-economy.js';

function worldRegionCount(world: { airports: { region: string }[] }): number {
  return listNpcHomeRegions(world.airports).length;
}

function worldFleetTarget(world: { airports: { region: string }[] }): number {
  return targetNpcFleetSize(worldRegionCount(world));
}

function npcCompositionCount(
  world: { airports: { region: string }[] },
  aircraftClassId: string,
): number {
  return (
    resolveNpcFleetComposition(worldRegionCount(world)).find(
      (slot) => slot.aircraftClassId === aircraftClassId,
    )?.count ?? 0
  );
}

/** Larger fleets fill the reposition offer cap during tick — clear for unit tests. */
function clearOpenRepositionOffers(world: SeedWorld): void {
  const open = world.npcFlights.filter(
    (f) => f.status === 'awaiting_pilot' && f.kind === 'reposition',
  );
  if (open.length === 0) return;
  const flightIds = new Set(open.map((f) => f.id));
  const lotIds = new Set(open.map((f) => f.lotId));
  world.npcFlights = world.npcFlights.filter((f) => !flightIds.has(f.id));
  world.lots = world.lots.filter((l) => !lotIds.has(l.id));
  for (const npc of world.npcs) {
    if (npc.currentFlightId && flightIds.has(npc.currentFlightId)) {
      npc.currentFlightId = undefined;
      npc.status = 'idle';
      npc.busyUntilMs = undefined;
      npc.busyUntilTick = undefined;
    }
  }
}

/** Away pad with a legal homebound reposition (domestic or on an intl lane). */
function findReachableAwayPad(
  world: SeedWorld,
  npc: SeedWorld['npcs'][number],
): SeedWorld['airports'][number] | undefined {
  const maxR = getAircraftClass(npc.aircraftClassId).maxRangeNm;
  for (const ap of world.airports) {
    if (ap.region === npc.homeRegion) continue;
    const dest = pickNpcHomeReturnIcao(world, npc, ap.icao);
    if (!dest) continue;
    const destRegion =
      world.airports.find((a) => a.icao === dest)?.region ?? '';
    if (
      !isDomesticOd(ap.region, destRegion) &&
      !isInternationalOdAllowed(world, ap.icao, dest)
    ) {
      continue;
    }
    const dist = routeDistanceNm(world, ap.icao, dest);
    if (dist !== undefined && dist >= 40 && dist <= maxR) return ap;
  }
  return undefined;
}

describe('NPC freighter fleet', () => {
  it('scales fleet size with mapped region count', () => {
    assert.equal(targetNpcFleetSize(0), NPC_FLEET_MIN);
    assert.equal(targetNpcFleetSize(3), Math.max(NPC_FLEET_MIN, 3 * NPCS_PER_REGION));
    assert.equal(targetNpcFleetSize(20), 20 * NPCS_PER_REGION);
    const for20 = resolveNpcFleetComposition(20);
    assert.equal(
      for20.reduce((n, s) => n + s.count, 0),
      targetNpcFleetSize(20),
    );
    // Legacy aliases stay calibrated to a 20-region reference map.
    assert.equal(NPC_FLEET_SIZE, targetNpcFleetSize(20));
    assert.equal(
      NPC_FLEET_COMPOSITION.reduce((n, s) => n + s.count, 0),
      NPC_FLEET_SIZE,
    );
  });

  it('seeds jets plus medium piston, light jet, Caravan and Bonanza GA freighters', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-seed' });
    assert.equal(world.npcs.length, worldFleetTarget(world));
    assert.equal(world.npcFlights.length, 0);
    const narrow = world.npcs.filter((n) => n.aircraftClassId === 'narrow_freighter');
    const wide = world.npcs.filter((n) => n.aircraftClassId === 'wide_freighter');
    const mediumPiston = world.npcs.filter((n) => n.aircraftClassId === 'medium_piston');
    const lightJet = world.npcs.filter((n) => n.aircraftClassId === 'light_jet');
    const caravan = world.npcs.filter((n) => n.aircraftClassId === 'light_turboprop');
    const bonanza = world.npcs.filter((n) => n.aircraftClassId === 'light_ga');
    assert.equal(narrow.length, npcCompositionCount(world, 'narrow_freighter'));
    assert.equal(wide.length, npcCompositionCount(world, 'wide_freighter'));
    assert.equal(mediumPiston.length, npcCompositionCount(world, 'medium_piston'));
    assert.equal(lightJet.length, npcCompositionCount(world, 'light_jet'));
    assert.equal(caravan.length, npcCompositionCount(world, 'light_turboprop'));
    assert.equal(bonanza.length, npcCompositionCount(world, 'light_ga'));
    assert.ok(world.npcs.every((n) => n.status === 'idle'));
    assert.ok(world.npcs.every((n) => n.reliability > 0 && n.aggressiveness > 0));
  });

  it('grows the fleet when a new region is mapped onto an existing save', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-scale-region' });
    const before = world.npcs.length;
    const regionsBefore = worldRegionCount(world);
    const sample = world.airports[0]!;
    world.airports.push({
      ...sample,
      icao: 'TEST',
      name: 'Test Expansion Hub',
      region: 'EU-TEST',
    });
    ensureNpcFleet(world);
    const regionsAfter = worldRegionCount(world);
    assert.equal(regionsAfter, regionsBefore + 1);
    assert.equal(world.npcs.length, worldFleetTarget(world));
    assert.ok(world.npcs.length > before);
    assert.ok(
      world.npcs.some((n) => n.homeRegion === 'EU-TEST'),
      'new region should receive at least one home operator from top-up',
    );
  });

  it('prunes idle surplus NPCs back to the region-scaled target', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-prune' });
    const target = worldFleetTarget(world);
    assert.equal(world.npcs.length, target);
    const donor = world.npcs.find((n) => !n.currentFlightId)!;
    assert.ok(donor);
    for (let i = 0; i < 22; i++) {
      world.npcs.push({
        ...donor,
        id: `npc-extra-${i}`,
        name: `Extra Operator ${i}`,
        currentFlightId: undefined,
        status: 'idle',
        busyUntilMs: undefined,
        busyUntilTick: undefined,
      });
    }
    assert.equal(world.npcs.length, target + 22);
    ensureNpcFleet(world);
    assert.equal(world.npcs.length, target);
    const byRegion = new Map<string, number>();
    for (const npc of world.npcs) {
      byRegion.set(npc.homeRegion, (byRegion.get(npc.homeRegion) ?? 0) + 1);
    }
    const counts = [...byRegion.values()];
    assert.equal(Math.max(...counts) - Math.min(...counts) <= 1, true);
  });

  it('does not prune NPCs that still hold an active flight', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-prune-hold' });
    const target = worldFleetTarget(world);
    const carrier = world.npcs.find(
      (n) => n.aircraftClassId === 'light_ga' && !n.currentFlightId,
    )!;
    assert.ok(carrier);
    const flightId = 'flt_prune_hold';
    carrier.currentFlightId = flightId;
    carrier.status = 'busy';
    world.npcFlights.push({
      id: flightId,
      npcId: carrier.id,
      lotId: 'lot_prune_hold',
      commodityId: 'general',
      originIcao: world.airports[0]!.icao,
      destIcao: world.airports[1]!.icao,
      cargoKg: 200,
      payUsd: 500,
      aircraftClassId: carrier.aircraftClassId,
      status: 'in_flight',
      departedAtTick: world.tick,
      arrivesAtTick: world.tick + 8,
      departedAtMs: world.lastBatchAtMs,
      arrivesAtMs: (world.lastBatchAtMs ?? Date.now()) + 2 * 3_600_000,
    });
    // Flood light_ga far above target with idle clones of another GA.
    const gaTarget = npcCompositionCount(world, 'light_ga');
    const idleGa = world.npcs.find(
      (n) =>
        n.aircraftClassId === 'light_ga' &&
        n.id !== carrier.id &&
        !n.currentFlightId,
    )!;
    assert.ok(idleGa);
    const extras = gaTarget + 5;
    for (let i = 0; i < extras; i++) {
      world.npcs.push({
        ...idleGa,
        id: `npc-ga-extra-${i}`,
        name: `GA Extra ${i}`,
        currentFlightId: undefined,
        status: 'idle',
      });
    }
    ensureNpcFleet(world);
    assert.ok(
      world.npcs.some((n) => n.id === carrier.id),
      'in-flight NPC must survive prune',
    );
    const gaLeft = world.npcs.filter((n) => n.aircraftClassId === 'light_ga')
      .length;
    // Carrier blocked prune of one slot, so light_ga may sit 1 above target.
    assert.ok(gaLeft <= gaTarget + 1);
    assert.ok(world.npcs.length <= target + 1);
  });

  it('assigns homologated player airframes when the class has Market SKUs', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-airframes' });
    assert.ok(world.npcs.every((n) => Boolean(n.airframeTypeId)));
    const light = world.npcs.filter(
      (n) =>
        n.aircraftClassId === 'light_ga' ||
        n.aircraftClassId === 'light_turboprop' ||
        n.aircraftClassId === 'light_jet',
    );
    assert.ok(light.length > 0);
    for (const npc of light) {
      assert.ok(
        npcAirframeIsHomologated(npc.airframeTypeId),
        `${npc.id} ${npc.airframeTypeId} should be homologated`,
      );
    }
    const heavy = world.npcs.filter(
      (n) =>
        n.aircraftClassId === 'narrow_freighter' ||
        n.aircraftClassId === 'wide_freighter' ||
        n.aircraftClassId === 'medium_piston',
    );
    // Heavy classes now have PMDG/TFDi SKUs too, so they may be homologated —
    // the invariant is only that every NPC carries a resolvable airframe.
    assert.ok(heavy.every((n) => Boolean(n.airframeTypeId)));
    const types = new Set(world.npcs.map((n) => n.airframeTypeId));
    assert.ok(types.size >= 5, `expected variety, got ${[...types].join(',')}`);
    for (const npc of world.npcs) {
      assert.ok(npcMaxCargoKg(npc) <= getAircraftClass(npc.aircraftClassId).maxCargoKg);
    }
  });

  it('remigrates abstract light NPCs onto homologated SKUs', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-homo-migrate' });
    const lightGa = world.npcs.filter((n) => n.aircraftClassId === 'light_ga');
    assert.ok(lightGa.length > 0);
    for (const npc of lightGa) {
      npc.airframeTypeId = 'C172SP';
      delete npc.maxCargoKg;
    }
    const remapped = ensureNpcAirframes(world);
    assert.ok(remapped >= lightGa.length);
    for (const npc of lightGa) {
      assert.ok(npcAirframeIsHomologated(npc.airframeTypeId));
      assert.notEqual(npc.airframeTypeId, 'C172SP');
    }
  });

  it('backfills airframes on legacy NPCs missing typeId', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-airframe-backfill' });
    for (const npc of world.npcs) {
      delete npc.airframeTypeId;
      delete npc.maxCargoKg;
    }
    const assigned = ensureNpcAirframes(world);
    assert.equal(assigned, world.npcs.length);
    assert.ok(world.npcs.every((n) => Boolean(n.airframeTypeId)));
  });

  it('tops up legacy jet-only fleets with GA NPCs', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-topup' });
    const jetOnly = world.npcs
      .filter(
        (n) =>
          n.aircraftClassId === 'narrow_freighter' ||
          n.aircraftClassId === 'wide_freighter',
      )
      .map((n) => ({ ...n }));
    assert.equal(
      jetOnly.length,
      npcCompositionCount(world, 'narrow_freighter') +
        npcCompositionCount(world, 'wide_freighter'),
    );
    const migrated = migrateEconomyWorld({
      version: 3,
      seed: world.seed,
      tick: world.tick,
      lastSyncedAtMs: world.lastSyncedAtMs,
      lastBatchAtMs: world.lastBatchAtMs,
      airports: world.airports,
      lots: [],
      events: [],
      npcs: jetOnly,
      npcFlights: [],
    });
    assert.equal(
      migrated.npcs.filter((n) => n.aircraftClassId === 'light_turboprop').length,
      npcCompositionCount(migrated, 'light_turboprop'),
    );
    assert.equal(
      migrated.npcs.filter((n) => n.aircraftClassId === 'medium_piston').length,
      npcCompositionCount(migrated, 'medium_piston'),
    );
    assert.equal(
      migrated.npcs.filter((n) => n.aircraftClassId === 'light_jet').length,
      npcCompositionCount(migrated, 'light_jet'),
    );
    assert.equal(
      migrated.npcs.filter((n) => n.aircraftClassId === 'light_ga').length,
      npcCompositionCount(migrated, 'light_ga'),
    );
    assert.equal(migrated.npcs.length, worldFleetTarget(migrated));
  });

  it('migrates legacy saves without npcs', () => {
    const seeded = createSeedEconomyWorld({ seed: 'legacy-npc' });
    const raw = {
      version: 2 as const,
      seed: 'legacy-npc',
      tick: 5,
      lastSyncedAtMs: Date.now(),
      airports: seeded.airports,
      lots: [],
      events: [],
    };
    const migrated = migrateEconomyWorld(raw);
    assert.equal(migrated.version, 3);
    assert.equal(migrated.npcs.length, worldFleetTarget(migrated));
    assert.ok(Array.isArray(migrated.npcFlights));
  });

  it('gives map-expansion regions a home operator on legacy saves', () => {
    const seeded = createSeedEconomyWorld({ seed: 'legacy-regions' });
    const legacyRegions = ['BR-SE', 'BR-S', 'BR-NE'];
    const raw = {
      version: 3 as const,
      seed: 'legacy-regions',
      tick: 40,
      lastSyncedAtMs: Date.now(),
      airports: seeded.airports.filter((ap) => legacyRegions.includes(ap.region)),
      lots: [],
      events: [],
      npcs: seeded.npcs.slice(0, 15).map((npc, i) => ({
        ...npc,
        homeRegion: legacyRegions[i % legacyRegions.length]!,
      })),
      npcFlights: [],
    };
    const migrated = migrateEconomyWorld(raw);
    const regions = new Set(migrated.airports.map((ap) => ap.region));
    for (const region of regions) {
      assert.ok(
        migrated.npcs.some((npc) => npc.homeRegion === region),
        `expected at least one NPC based in ${region}`,
      );
    }
    assert.equal(migrated.npcs.length, worldFleetTarget(migrated));
  });

  it('estimates busy time ≥ flight block hours', () => {
    const { flightHours, busyHours } = estimateNpcBlockHours(2_000, 'narrow_freighter');
    assert.ok(flightHours >= 1);
    assert.ok(busyHours >= flightHours);
    assert.equal(busyHours, flightHours + 0.5);
    // Fractional resolution (not whole-hour ceil) for a mid-range hop.
    const short = estimateNpcBlockHours(500, 'narrow_freighter');
    assert.ok(short.flightHours < 2);
    assert.ok(Number.isInteger(short.flightHours * 10));
  });

  it('lets light_ga score GA-sized LTL and skips large electronics', () => {
    const world = createSeedEconomyWorld({ seed: 'ga-ltl-bid' });
    const ga = world.npcs.find((n) => n.aircraftClassId === 'light_ga');
    assert.ok(ga);
    ga!.status = 'idle';
    ga!.locationIcao = 'SBGR';
    ga!.feeBias = 0.5;
    const ltl: ShipmentLot = {
        id: 'lot-ga-ltl',
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBKP',
        quantityKg: 200,
        reservedKg: 0,
        createdAtTick: world.tick,
        expiresAtTick: world.tick + 48,
        payUsd: 400,
        basePayUsd: 400,
        urgency: 'normal',
        reason: 'test GA LTL',
        status: 'available',
      };
    const heavy: typeof ltl = {
      ...ltl,
      id: 'lot-ga-heavy',
      commodityId: 'electronics',
      destIcao: 'SBGL',
      quantityKg: 18_000,
      payUsd: 40_000,
      basePayUsd: 40_000,
      reason: 'test large electronics',
    };
    const rng = () => 0.5;
    assert.ok(NPC_MIN_BID_KG <= 200);
    assert.ok(scoreLotForNpc(world, ga!, ltl, rng) != null);
    assert.equal(scoreLotForNpc(world, ga!, heavy, rng), null);
  });

  it('wide NPCs can score long-haul intl lots that light GA cannot', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-intl-index' });
    const wide = world.npcs.find((n) => n.aircraftClassId === 'wide_freighter');
    const ga = world.npcs.find((n) => n.aircraftClassId === 'light_ga');
    const narrow = world.npcs.find((n) => n.aircraftClassId === 'narrow_freighter');
    assert.ok(wide);
    assert.ok(ga);
    assert.ok(narrow);
    assert.equal(isInternationalOdAllowed(world, 'SBGR', 'KMIA'), true);
    const dist = routeDistanceNm(world, 'SBGR', 'KMIA');
    assert.ok(dist != null && dist > 2500, `GRU→MIA should be long-haul (${dist} nm)`);
    assert.ok(dist < 6000, `GRU→MIA should be in wide range (${dist} nm)`);
    wide!.status = 'idle';
    wide!.feeBias = 0.5;
    wide!.aggressiveness = 0.5;
    wide!.reliability = 1;
    ga!.status = 'idle';
    ga!.feeBias = 0.5;
    narrow!.status = 'idle';
    narrow!.feeBias = 0.5;
    const lot: ShipmentLot = {
      id: 'lot-intl-gru-mia',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'KMIA',
      quantityKg: 20_000,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 96,
      payUsd: 80_000,
      basePayUsd: 80_000,
      urgency: 'normal',
      reason: 'test intl trunk',
      status: 'available',
    };
    const rng = () => 0.5;
    assert.ok(scoreLotForNpc(world, wide!, lot, rng) != null);
    assert.equal(scoreLotForNpc(world, ga!, lot, rng), null);
    assert.equal(scoreLotForNpc(world, narrow!, lot, rng), null);
  });

  it('scores busy lanes lower so NPCs leave crowded OD freight for the player', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-busy-penalty' });
    const npc = world.npcs.find((n) => n.aircraftClassId === 'narrow_freighter');
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.locationIcao = 'SBGR';
    npc!.feeBias = 0.5;
    npc!.aggressiveness = 0.5;
    npc!.reliability = 1;
    const lot: ShipmentLot = {
      id: 'lot-busy-od',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 8_000,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 48,
      payUsd: 20_000,
      basePayUsd: 20_000,
      urgency: 'normal',
      reason: 'test busy OD',
      status: 'available',
    };
    const rng = () => 0.5;
    const clear = scoreLotForNpc(world, npc!, lot, rng);
    assert.ok(clear != null);
    world.npcFlights.push({
      id: 'npcf-busy-od',
      npcId: world.npcs[0]!.id,
      lotId: 'lot_other',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      commodityId: 'general',
      cargoKg: Math.ceil(LANE_SATURATION_KG * 0.5),
      payUsd: 1,
      aircraftClassId: 'narrow_freighter',
      departedAtTick: world.tick,
      arrivesAtTick: world.tick + 4,
      departedAtMs: world.lastBatchAtMs,
      arrivesAtMs: world.lastBatchAtMs + 4 * 3_600_000,
      status: 'in_flight',
    });
    invalidateLaneInboundIndex(world);
    const busy = scoreLotForNpc(world, npc!, lot, rng);
    assert.ok(busy != null);
    assert.ok(
      busy! < clear!,
      `busy score ${busy} should be below clear ${clear}`,
    );
  });

  it('claims lots with wall-clock ETA and settles mid-hour', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-haul' });
    for (const npc of world.npcs) {
      npc.aggressiveness = 0.95;
      npc.reliability = 0.99;
      npc.feeBias = 0.5;
    }

    tickEconomyN(world, 72);
    assert.ok(
      world.npcFlights.length > 0 ||
        world.npcs.some(
          (n) =>
            n.status === 'busy' ||
            n.status === 'resting' ||
            (n.dutyHoursAccum ?? 0) > 0,
        ),
      'expected NPCs to claim work after market forms',
    );

    const nowMs = world.lastBatchAtMs;
    const beforeFlights = listActiveNpcFreights(world, nowMs);
    if (beforeFlights.length === 0) {
      // Crew rest can clear the airborne board at the catch-up boundary; duty proves work happened.
      assert.ok(
        world.npcs.some((n) => (n.dutyHoursAccum ?? 0) > 0 || n.status === 'resting'),
      );
      return;
    }
    const sample = beforeFlights[0]!;
    assert.ok(sample.progressPct >= 0 && sample.progressPct <= 100);
    assert.ok(sample.flightHours >= 1);
    assert.ok(sample.phase === 'enroute' || sample.phase === 'arriving');
    assert.ok(typeof sample.flight.departedAtMs === 'number');
    assert.ok(typeof sample.flight.arrivesAtMs === 'number');
    assert.ok(sample.flight.arrivesAtMs > sample.flight.departedAtMs);

    const dist = routeDistanceNm(world, sample.flight.originIcao, sample.flight.destIcao) ?? 0;
    const { flightHours } = estimateNpcBlockHours(
      dist,
      sample.flight.aircraftClassId,
    );
    assert.equal(
      sample.flight.arrivesAtTick - sample.flight.departedAtTick,
      hoursToTicks(flightHours),
    );
    const npc = world.npcs.find((n) => n.id === sample.flight.npcId)!;
    assert.equal(npc.status, 'busy');
    assert.ok(typeof npc.busyUntilMs === 'number');
    assert.ok(npc.busyUntilMs! > sample.flight.arrivesAtMs);

    // Mid-hour progress: halfway through the flight block.
    const mid =
      sample.flight.departedAtMs +
      (sample.flight.arrivesAtMs - sample.flight.departedAtMs) / 2;
    const midView = listActiveNpcFreights(world, mid).find(
      (f) => f.flight.id === sample.flight.id,
    );
    assert.ok(midView);
    assert.ok(midView!.progressPct >= 45 && midView!.progressPct <= 55);

    const dest = world.airports.find((a) => a.icao === sample.flight.destIcao)!;
    const destBefore = dest.inventory[sample.flight.commodityId]?.stockKg ?? 0;

    // Settle exactly at arrival (continuous ops, no batch required).
    const { settledFlights } = settleNpcOpsDue(world, sample.flight.arrivesAtMs);
    assert.ok(settledFlights >= 1);
    assert.ok(
      !world.npcFlights.some((f) => f.id === sample.flight.id),
      'flight should be pruned after settle',
    );
    const destAfter = dest.inventory[sample.flight.commodityId]?.stockKg ?? 0;
    assert.ok(
      destAfter >= destBefore,
      `dest stock should not drop after NPC delivery (${destBefore} → ${destAfter})`,
    );

    // Idempotent: settling again at the same instant does nothing.
    const again = settleNpcOpsDue(world, sample.flight.arrivesAtMs);
    assert.equal(again.settledFlights, 0);

    const npcAfter = world.npcs.find((n) => n.id === sample.flight.npcId)!;
    assert.notEqual(npcAfter.currentFlightId, sample.flight.id);
  });

  it('exposes a full fleet roster with mission details', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-roster' });
    for (const npc of world.npcs) {
      npc.aggressiveness = 0.95;
      npc.reliability = 0.99;
      npc.feeBias = 0.5;
    }
    tickEconomyN(world, 36);
    const roster = listNpcFleetStatus(world, world.lastBatchAtMs);
    assert.equal(roster.length, worldFleetTarget(world));
    assert.ok(roster.some((r) => r.phase !== 'idle'), 'expected some busy NPCs');
    for (const row of roster) {
      if (!row.mission) continue;
      assert.ok(row.mission.originIcao);
      assert.ok(row.mission.destIcao);
      assert.ok(row.mission.cargoKg >= 0);
      assert.ok(typeof row.mission.arrivesAtMs === 'number');
    }
    // Empty reposition legs also show a mission with cargoKg 0, so the roster
    // must not be judged by whichever row happens to come first.
    assert.ok(
      roster.some((r) => (r.mission?.cargoKg ?? 0) > 0),
      'expected at least one loaded freight leg',
    );
  });

  it('enters crew rest after duty limit and blocks bidding until rest ends', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-rest-limit' });
    const npc = world.npcs[0]!;
    const nowMs = world.lastBatchAtMs;

    npc.status = 'busy';
    npc.currentFlightId = undefined;
    npc.busyUntilMs = nowMs - 1;
    npc.dutyHoursAccum = 10.6;
    npc.lastLegDutyHours = 3;

    settleNpcOpsDue(world, nowMs);
    assert.equal(npc.status, 'resting');
    assert.ok(typeof npc.restUntilMs === 'number');
    assert.ok(npc.restUntilMs! > nowMs);

    const roster = listNpcFleetStatus(world, nowMs);
    const row = roster.find((r) => r.id === npc.id)!;
    assert.equal(row.phase, 'resting');
    assert.ok((row.restHoursLeft ?? 0) > 0);

    // Still resting mid-window — must not be cleared to idle for bidding.
    settleNpcOpsDue(world, nowMs + 60_000);
    assert.equal(npc.status, 'resting');

    // After rest window: idle and duty reset.
    settleNpcOpsDue(world, npc.restUntilMs! + 1);
    assert.equal(npc.status, 'idle');
    assert.equal(npc.dutyHoursAccum ?? 0, 0);
    assert.equal(npc.restUntilMs, undefined);
  });

  it('returns to idle without rest when duty stays under the limit', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-rest-short' });
    const npc = world.npcs[0]!;
    const nowMs = world.lastBatchAtMs;

    npc.status = 'busy';
    npc.currentFlightId = undefined;
    npc.busyUntilMs = nowMs - 1;
    npc.dutyHoursAccum = 4;
    npc.lastLegDutyHours = 2.5;

    settleNpcOpsDue(world, nowMs);
    assert.equal(npc.status, 'idle');
    assert.equal(npc.restUntilMs, undefined);
    assert.equal(npc.dutyHoursAccum, 4);

    const roster = listNpcFleetStatus(world, nowMs);
    assert.equal(roster.find((r) => r.id === npc.id)?.phase, 'idle');
  });

  it('frees turnaround when busyUntilTick is past even if busyUntilMs is far future', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-tick-ms-drift' });
    const npc = world.npcs[0]!;
    const nowMs = world.lastBatchAtMs;

    npc.status = 'busy';
    npc.currentFlightId = undefined;
    npc.busyUntilTick = Math.max(0, world.tick - 10);
    npc.busyUntilMs = nowMs + 100 * 3_600_000; // ~100h wall drift
    npc.dutyHoursAccum = 3;
    npc.lastLegDutyHours = 2;

    assert.equal(isNpcReadyToBid(npc, nowMs, world.tick), true);
    settleNpcOpsDue(world, nowMs);
    assert.notEqual(npc.status, 'busy');
    assert.equal(npc.busyUntilMs, undefined);
  });

  it('forces rest after a long single leg even under cumulative duty cap', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-rest-longleg' });
    const npc = world.npcs[0]!;
    const nowMs = world.lastBatchAtMs;

    npc.status = 'busy';
    npc.currentFlightId = undefined;
    npc.busyUntilMs = nowMs - 1;
    npc.dutyHoursAccum = 7.2;
    npc.lastLegDutyHours = 7.2;

    settleNpcOpsDue(world, nowMs);
    assert.equal(npc.status, 'resting');
    assert.ok((npc.restUntilMs ?? 0) > nowMs);
  });

  it('backfills missing duty from live flights and desyncs clustered turnarounds', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-duty-backfill' });
    const nowMs = world.lastBatchAtMs;
    const a = world.npcs[0]!;
    const b = world.npcs[1]!;
    a.status = 'busy';
    b.status = 'busy';
    a.currentFlightId = undefined;
    b.currentFlightId = undefined;
    a.busyUntilMs = nowMs + 3_600_000;
    b.busyUntilMs = nowMs + 3_600_000 + 60_000; // same 5-min bucket
    delete a.dutyHoursAccum;
    delete b.dutyHoursAccum;

    ensureNpcFleet(world);
    assert.ok(typeof a.dutyHoursAccum === 'number');
    assert.ok(typeof b.dutyHoursAccum === 'number');
    assert.notEqual(a.busyUntilMs, b.busyUntilMs);
  });

  it('rapid +1 day advances NPC missions instead of freezing near Date.now()', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-plus1day-freeze' });
    for (const npc of world.npcs) {
      npc.aggressiveness = 0.95;
      npc.reliability = 0.99;
      npc.feeBias = 0.5;
    }

    tickEconomyN(world, 48);
    const fingerprint = () =>
      [
        ...world.npcFlights
          .filter((f) => f.status === 'in_flight')
          .map((f) => `${f.id}:${f.originIcao}>${f.destIcao}`),
        ...world.npcs.map(
          (n) =>
            `${n.id}:${n.status}:${n.busyUntilMs ?? ''}:${n.restUntilMs ?? ''}:${n.currentFlightId ?? ''}`,
        ),
      ]
        .sort()
        .join('|');

    const before = fingerprint();
    const tickBefore = world.tick;
    assert.ok(
      world.npcFlights.some((f) => f.status === 'in_flight') ||
        world.npcs.some((n) => n.status === 'busy' || n.status === 'resting'),
      'expected NPC activity after warm-up',
    );

    // Instant second day — previously left the board identical.
    tickEconomyN(world, 24);
    assert.equal(world.tick, tickBefore + 24);
    assert.notEqual(
      fingerprint(),
      before,
      'competing fleet should change after a compressed +1 day',
    );
  });

  it('reports regional bid capacity from idle vs resting home fleet', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-capacity' });
    const region = world.npcs[0]!.homeRegion;
    const nowMs = world.lastBatchAtMs;
    const home = world.npcs.filter((n) => n.homeRegion === region);
    assert.ok(home.length >= 1);

    for (const npc of home) {
      npc.status = 'idle';
      npc.currentFlightId = undefined;
      npc.busyUntilMs = undefined;
      npc.restUntilMs = undefined;
    }
    assert.equal(npcRegionBidCapacity(world, region, nowMs), 1);

    for (const npc of home) {
      npc.status = 'resting';
      npc.restUntilMs = nowMs + 12 * 3_600_000;
    }
    assert.equal(npcRegionBidCapacity(world, region, nowMs), 0);

    assert.equal(npcRegionBidCapacity(world, 'NO-SUCH-REGION', nowMs), 1);
  });

  it('describes thin-fleet and lane-busy pressure for UI chips', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-pressure-chips' });
    const nowMs = world.lastBatchAtMs;
    const origin = 'SBGR';
    const dest = 'SBGL';
    const region =
      world.airports.find((a) => a.icao === origin)?.region ?? 'BR-SE';
    for (const npc of world.npcs.filter((n) => n.homeRegion === region)) {
      npc.status = 'resting';
      npc.restUntilMs = nowMs + 12 * 3_600_000;
      npc.currentFlightId = undefined;
    }

    const thin = describeLotMarketPressure(
      world,
      { originIcao: origin, destIcao: dest, commodityId: 'general' },
      nowMs,
    );
    assert.equal(thin.thinFleet, true);
    assert.equal(thin.laneBusy, false);
    assert.ok(['fair', 'marginal', 'poor'].includes(thin.weather));

    world.npcFlights.push({
      id: 'npcf-busy-lane',
      npcId: world.npcs[0]!.id,
      lotId: 'lot_busy',
      originIcao: origin,
      destIcao: dest,
      commodityId: 'general',
      cargoKg: Math.ceil(LANE_SATURATION_KG * 0.4),
      payUsd: 1,
      aircraftClassId: 'narrow_freighter',
      departedAtTick: world.tick,
      arrivesAtTick: world.tick + 2,
      departedAtMs: nowMs,
      arrivesAtMs: nowMs + 2 * 3_600_000,
      status: 'in_flight',
    });
    invalidateLaneInboundIndex(world);
    const busy = describeLotMarketPressure(
      world,
      { originIcao: origin, destIcao: dest, commodityId: 'general' },
      nowMs,
    );
    assert.equal(busy.laneBusy, true);

    const regions = listRegionMarketPressure(world, nowMs);
    assert.ok(regions.some((r) => r.region === region && r.thinFleet && r.weather));
    assert.equal(
      regions.find((r) => r.region === region)?.laneBusy,
      true,
      'busy outbound lane should surface on the region climate line',
    );
  });

  it('measures lane airborne kg and saturation from in_flight NPC cargo', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-lane-sat' });
    assert.equal(npcLaneAirborneKg(world, 'SBGR', 'SBGL', 'electronics'), 0);
    assert.equal(npcLaneSaturation(world, 'SBGR', 'SBGL', 'electronics'), 0);

    const flight: NpcFlight = {
      id: 'npcf-lane-test',
      npcId: world.npcs[0]!.id,
      lotId: 'lot_lane_test',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      commodityId: 'electronics',
      cargoKg: 14_000,
      payUsd: 1,
      aircraftClassId: 'narrow_freighter',
      departedAtTick: world.tick,
      arrivesAtTick: world.tick + 2,
      departedAtMs: world.lastBatchAtMs,
      arrivesAtMs: world.lastBatchAtMs + 2 * 3_600_000,
      status: 'in_flight',
    };
    world.npcFlights.push(flight);
    invalidateLaneInboundIndex(world);

    assert.equal(npcLaneAirborneKg(world, 'SBGR', 'SBGL', 'electronics'), 14_000);
    assert.equal(npcLaneAirborneKg(world, null, 'SBGL', 'electronics'), 14_000);
    assert.equal(npcLaneAirborneKg(world, 'SBPA', 'SBGL', 'electronics'), 0);
    assert.ok(
      Math.abs(npcLaneSaturation(world, 'SBGR', 'SBGL', 'electronics') - 14_000 / LANE_SATURATION_KG) <
        1e-9,
    );

    world.inboundPending = [
      {
        id: 'msn_p:lot',
        missionId: 'msn_p',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        commodityId: 'electronics',
        cargoKg: 7_000,
        expiresAtTick: world.tick + 10,
        source: 'player',
      },
    ];
    invalidateLaneInboundIndex(world);
    assert.equal(playerLaneInboundKg(world, 'SBGR', 'SBGL', 'electronics'), 7_000);
    assert.equal(laneInboundKg(world, 'SBGR', 'SBGL', 'electronics'), 21_000);
    assert.ok(
      Math.abs(npcLaneSaturation(world, 'SBGR', 'SBGL', 'electronics') - 21_000 / LANE_SATURATION_KG) <
        1e-9,
    );

    flight.cargoKg = LANE_SATURATION_KG;
    invalidateLaneInboundIndex(world);
    assert.equal(npcLaneSaturation(world, 'SBGR', 'SBGL', 'electronics'), 1);
  });

  it('enters shop MX after enough block hours and drains terminal parts', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-mx-drain' });
    const npc = world.npcs.find((n) => n.aircraftClassId === 'narrow_freighter')!;
    const icao = 'SBGR';
    npc.locationIcao = icao;
    // Interval stretches with reliability — clear the bar for any operator.
    npc.reliability = 0.45;
    npc.hoursSinceMx = NPC_MX_INTERVAL_HOURS.narrow_freighter * 2;
    npc.dutyHoursAccum = 0;
    npc.lastLegDutyHours = 0;
    npc.status = 'busy';
    npc.busyUntilMs = world.lastBatchAtMs - 1_000;
    npc.currentFlightId = undefined;

    const before = world.airports.find((a) => a.icao === icao)!.inventory.mro_parts!
      .stockKg;
    const nowMs = world.lastBatchAtMs;
    settleNpcOpsDue(world, nowMs);

    assert.equal(npc.status, 'maintenance');
    assert.ok((npc.mxUntilMs ?? 0) > nowMs);
    assert.equal(npc.hoursSinceMx, 0);
    const after = world.airports.find((a) => a.icao === icao)!.inventory.mro_parts!
      .stockKg;
    assert.equal(after, before - NPC_MX_PARTS_KG.narrow_freighter);

    const roster = listNpcFleetStatus(world, nowMs);
    const row = roster.find((r) => r.id === npc.id)!;
    assert.equal(row.phase, 'maintenance');
    assert.equal(row.locationIcao, icao);
  });

  it('dry MRO stock still grounds NPC longer without draining', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-mx-dry' });
    const npc = world.npcs.find((n) => n.aircraftClassId === 'light_turboprop')!;
    const icao = 'SBPS';
    npc.locationIcao = icao;
    npc.hoursSinceMx = NPC_MX_INTERVAL_HOURS.light_turboprop * 2;
    npc.dutyHoursAccum = 0;
    npc.lastLegDutyHours = 0;
    npc.status = 'busy';
    npc.busyUntilMs = world.lastBatchAtMs - 1_000;

    const ap = world.airports.find((a) => a.icao === icao)!;
    ap.inventory.mro_parts!.stockKg = 0;
    const nowMs = world.lastBatchAtMs;
    settleNpcOpsDue(world, nowMs);

    assert.equal(npc.status, 'maintenance');
    assert.equal(ap.inventory.mro_parts!.stockKg, 0);
    const shopMs = (npc.mxUntilMs ?? 0) - nowMs;
    // Dry surcharge (×1.6) pushes dwell above the non-dry maximum (~2.5×1.15h).
    assert.ok(shopMs > 2.5 * 1.15 * 3_600_000);
  });

  it('returns to idle when shop MX completes', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-mx-done' });
    const npc = world.npcs[0]!;
    npc.status = 'maintenance';
    npc.mxUntilMs = world.lastBatchAtMs - 1_000;
    npc.dutyHoursAccum = 0;
    npc.lastLegDutyHours = 0;
    settleNpcOpsDue(world, world.lastBatchAtMs);
    assert.equal(npc.status, 'idle');
    assert.equal(npc.mxUntilMs, undefined);
  });

  it('drainNpcMroParts reports scarcity correctly', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-mx-helper' });
    const ap = world.airports.find((a) => a.icao === 'SBGL')!;
    ap.inventory.mro_parts!.stockKg = 50;
    const partial = drainNpcMroParts(world, 'SBGL', 200);
    assert.equal(partial.scarcity, 'partial');
    assert.equal(partial.takenKg, 50);
    ap.inventory.mro_parts!.stockKg = 0;
    const dry = drainNpcMroParts(world, 'SBGL', 100);
    assert.equal(dry.scarcity, 'dry');
    assert.equal(dry.takenKg, 0);
  });

  it('creates awaiting_pilot offers for homologated NPCs and surfaces crewNeeded claims', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-offer' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc, 'expected homologated NPC');
    // Park the operator so the offer path is deterministic.
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = world.lots.find(
      (l) =>
        !heldLots.has(l.id) &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot, 'expected a bookable lot');
    const beforeReserved = lot!.reservedKg;
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.5,
    });
    assert.equal(flight.status, 'awaiting_pilot');
    assert.ok((flight.awaitingPilotUntilMs ?? 0) > nowMs);
    assert.equal(
      flight.pilotFeeUsd,
      quoteContractPilotFeeUsd(flight.payUsd),
    );
    assert.ok(lot!.reservedKg > beforeReserved);
    assert.equal(npc!.status, 'busy');
    assert.equal(npc!.currentFlightId, flight.id);

    const claim = npcClaimForLot(world, lot!.id, nowMs);
    assert.ok(claim?.crewNeeded);
    assert.equal(claim?.pilotFeeUsd, flight.pilotFeeUsd);
    assert.equal(claim?.npcName, npc!.name);
    assert.ok(typeof claim?.pilotFeeMinUsd === 'number');
    assert.ok((claim?.pilotFeeMinUsd ?? 0) <= (claim?.pilotFeeUsd ?? 0));

    const board = listMarketLots(world, { nowMs });
    const row = board.find((v) => v.lot.id === lot!.id);
    assert.equal(row?.npcClaim?.crewNeeded, true);
  });

  it('promotes expired awaiting_pilot offers into in_flight', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-timeout' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = world.lots.find(
      (l) =>
        !heldLots.has(l.id) &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.25,
    });
    assert.equal(flight.status, 'awaiting_pilot');
    flight.awaitingPilotUntilMs = nowMs - 1;
    settleNpcOpsDue(world, nowMs + 60_000);
    assert.equal(flight.status, 'in_flight');
    assert.equal(flight.awaitingPilotUntilMs, undefined);
    assert.ok(flight.arrivesAtMs > flight.departedAtMs);
    const claim = npcClaimForLot(world, lot!.id, nowMs + 60_000);
    assert.ok(claim);
    assert.equal(claim?.crewNeeded, undefined);
  });

  it('ages crew offer windows when +N hour tick advances the wall clock', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-tick-age' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = world.lots.find(
      (l) =>
        !heldLots.has(l.id) &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.25,
    });
    assert.equal(flight.status, 'awaiting_pilot');
    // Hold 30m — UI +1 h (4 ticks) must age the window and auto-depart the NPC.
    flight.awaitingPilotUntilMs = nowMs + 30 * 60_000;
    if (typeof flight.arrivesAtMs === 'number') {
      flight.arrivesAtMs = flight.awaitingPilotUntilMs;
    }
    if (npc) {
      npc.busyUntilMs = flight.awaitingPilotUntilMs;
    }

    tickEconomyN(world, 4); // +1 hour (UI +1 h)
    assert.equal(
      flight.status,
      'in_flight',
      'crew offer should promote after simulated +1h',
    );
    assert.equal(flight.awaitingPilotUntilMs, undefined);
  });

  it('caps concurrent crew holds so the fleet keeps flying', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-cap' });
    tickEconomyN(world, TICKS_PER_DAY * 2);

    const open = countOpenContractPilotOffers(world);
    const cap = maxOpenContractPilotOffers(world);
    const home = (world.homeCountryId ?? 'BR').trim().toUpperCase();
    const countryFloor = activeContractPilotCountries(world).includes(home)
      ? starterContractPilotCountryFloor(1)
      : 0;
    assert.ok(cap >= MIN_OPEN_CONTRACT_PILOT_OFFERS);
    // Home-country starter floor may overflow the global starter bucket by ≤ floor.
    assert.ok(
      open <= cap + countryFloor,
      `open crew holds ${open} should stay within cap ${cap} + country floor ${countryFloor}`,
    );
    assert.ok(
      countOpenContractPilotOffers(world, 'starter') <=
        maxOpenContractPilotOffers(world, 'starter') + countryFloor,
    );
    assert.ok(
      countOpenContractPilotOffers(world, 'other') <=
        maxOpenContractPilotOffers(world, 'other'),
    );
    // The cap exists to keep freighters flying rather than parked on a hold.
    const airborne = world.npcFlights.filter(
      (f) => f.status === 'in_flight',
    ).length;
    assert.ok(
      airborne > open,
      `expected more airborne (${airborne}) than parked on crew holds (${open})`,
    );
  });

  it('reserves crew-needed holds for starter-class airframes', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-starter-crew' });
    tickEconomyN(world, TICKS_PER_DAY);

    const starterCap = maxOpenContractPilotOffers(world, 'starter');
    const home = (world.homeCountryId ?? 'BR').trim().toUpperCase();
    const countryFloor = activeContractPilotCountries(world).includes(home)
      ? starterContractPilotCountryFloor(1)
      : 0;
    assert.ok(starterCap >= MIN_OPEN_STARTER_CONTRACT_PILOT_OFFERS);
    const starterOpen = countOpenContractPilotOffers(world, 'starter');
    assert.ok(
      starterOpen > 0,
      `expected light GA/turboprop crew holds, got ${starterOpen}`,
    );
    assert.ok(
      starterOpen <= starterCap + countryFloor,
      `starter open ${starterOpen} > cap ${starterCap} + floor ${countryFloor}`,
    );
    const lightGa = world.npcFlights.filter(
      (f) =>
        f.status === 'awaiting_pilot' &&
        f.kind !== 'reposition' &&
        f.aircraftClassId === 'light_ga',
    ).length;
    const turboprop = world.npcFlights.filter(
      (f) =>
        f.status === 'awaiting_pilot' &&
        f.kind !== 'reposition' &&
        f.aircraftClassId === 'light_turboprop',
    ).length;
    assert.ok(
      lightGa + turboprop === starterOpen,
      `starter holds should be GA/TP only (ga=${lightGa} tp=${turboprop} open=${starterOpen})`,
    );
  });

  it('scales starter country floor with company count', () => {
    assert.equal(
      starterContractPilotCountryFloor(1),
      MIN_STARTER_CREW_OFFERS_PER_ACTIVE_COUNTRY,
    );
    assert.equal(
      starterContractPilotCountryFloor(3),
      MIN_STARTER_CREW_OFFERS_PER_ACTIVE_COUNTRY +
        STARTER_CREW_OFFERS_PER_EXTRA_COMPANY * 2,
    );
    assert.equal(starterContractPilotCountryFloor(3), 18);
    assert.equal(
      starterContractPilotCountryFloor(100),
      MAX_STARTER_CREW_OFFERS_PER_ACTIVE_COUNTRY,
    );
  });

  it('country floor opens starter crew at home when the global starter cap is full', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-country-floor' });
    world.homeCountryId = 'BR';
    assert.deepEqual(activeContractPilotCountries(world), ['BR']);

    const foreignAp = world.airports.find(
      (a) => contractPilotOriginCountry(world, a.icao) === 'US',
    );
    assert.ok(foreignAp, 'expected a US hub for foreign filler offers');
    const starterCap = maxOpenContractPilotOffers(world, 'starter');
    const fillerNpc = world.npcs.find((n) =>
      isStarterContractPilotClass(n.aircraftClassId),
    );
    assert.ok(fillerNpc);
    for (let i = 0; i < starterCap; i++) {
      world.npcFlights.push({
        id: `fill-starter-${i}`,
        npcId: fillerNpc!.id,
        lotId: `fill-lot-${i}`,
        originIcao: foreignAp!.icao,
        destIcao: foreignAp!.icao,
        commodityId: 'general',
        cargoKg: 200,
        payUsd: 500,
        aircraftClassId: 'light_ga',
        departedAtTick: world.tick,
        arrivesAtTick: world.tick,
        departedAtMs: world.lastBatchAtMs ?? Date.now(),
        arrivesAtMs: (world.lastBatchAtMs ?? Date.now()) + 3_600_000,
        status: 'awaiting_pilot',
        awaitingPilotUntilMs: (world.lastBatchAtMs ?? Date.now()) + 3_600_000,
      });
    }
    assert.ok(
      countOpenContractPilotOffers(world, 'starter') >= starterCap,
      'global starter cap should be saturated with foreign holds',
    );
    assert.equal(
      countOpenContractPilotOffersInCountry(world, 'BR', 'starter'),
      0,
    );
    assert.equal(
      starterContractPilotCountryNeedsFloor(world, 'SBGR'),
      true,
    );

    const npc = world.npcs.find(
      (n) =>
        npcCanOfferContractPilot(n) &&
        isStarterContractPilotClass(n.aircraftClassId),
    );
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot: ShipmentLot = {
      id: 'lot-br-floor-test',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      quantityKg: 200,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 48,
      payUsd: 400,
      urgency: 'normal',
      reason: 'starter floor test',
      status: 'available',
    };
    world.lots.push(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcContractPilotOffer(world, npc!.id, lot.id, {
      nowMs,
      rng: () => 0,
      respectCaps: true,
    });
    assert.equal(flight.status, 'awaiting_pilot');
    assert.equal(contractPilotOriginCountry(world, flight.originIcao), 'BR');
    assert.ok(
      countOpenContractPilotOffersInCountry(world, 'BR', 'starter') >= 1,
    );
  });

  it('country floor is a soft minimum — home can still open above the floor', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-country-softfloor' });
    world.homeCountryId = 'BR';
    const floor = starterContractPilotCountryFloor(1);
    const npc = world.npcs.find(
      (n) =>
        npcCanOfferContractPilot(n) &&
        isStarterContractPilotClass(n.aircraftClassId),
    );
    assert.ok(npc);
    for (let i = 0; i < floor; i++) {
      world.npcFlights.push({
        id: `fill-br-soft-${i}`,
        npcId: npc!.id,
        lotId: `fill-br-soft-lot-${i}`,
        originIcao: 'SBGR',
        destIcao: 'SBKP',
        commodityId: 'general',
        cargoKg: 200,
        payUsd: 400,
        aircraftClassId: 'light_ga',
        departedAtTick: world.tick,
        arrivesAtTick: world.tick,
        departedAtMs: Date.now(),
        arrivesAtMs: Date.now() + 3_600_000,
        status: 'awaiting_pilot',
        awaitingPilotUntilMs: Date.now() + 3_600_000,
      });
    }
    assert.equal(
      countOpenContractPilotOffersInCountry(world, 'BR', 'starter'),
      floor,
    );
    assert.equal(starterContractPilotCountryNeedsFloor(world, 'SBGR'), false);
    assert.ok(
      countOpenContractPilotOffers(world, 'starter') <
        maxOpenContractPilotOffers(world, 'starter'),
      'global starter cap should still have room',
    );
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    world.lots.push({
      id: 'lot-br-softfloor',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBKP',
      quantityKg: 180,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 48,
      payUsd: 350,
      urgency: 'normal',
      reason: 'starter soft floor test',
      status: 'available',
    });
    const flight = createNpcContractPilotOffer(world, npc!.id, 'lot-br-softfloor', {
      rng: () => 0,
      respectCaps: true,
    });
    assert.equal(flight.status, 'awaiting_pilot');
    assert.ok(
      countOpenContractPilotOffersInCountry(world, 'BR', 'starter') > floor,
    );
  });

  it('uses a short hold below the home-country starter floor and a long hold at the floor', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-short-hold' });
    tickEconomyN(world, 24);
    world.homeCountryId = 'BR';
    // Clear existing BR starter holds so the floor path is deterministic.
    for (const flight of world.npcFlights) {
      if (flight.status !== 'awaiting_pilot') continue;
      if (!isStarterContractPilotClass(flight.aircraftClassId)) continue;
      if (flight.kind === 'reposition') continue;
      if (contractPilotOriginCountry(world, flight.originIcao) !== 'BR') {
        continue;
      }
      flight.status = 'in_flight';
      delete flight.awaitingPilotUntilMs;
    }
    assert.equal(
      countOpenContractPilotOffersInCountry(world, 'BR', 'starter'),
      0,
    );
    const floor = starterContractPilotCountryFloor(1);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const starters = world.npcs.filter(
      (n) =>
        npcCanOfferContractPilot(n) &&
        isStarterContractPilotClass(n.aircraftClassId),
    );
    assert.ok(starters.length >= 2);

    const park = (npc: (typeof starters)[number]) => {
      npc.status = 'idle';
      npc.currentFlightId = undefined;
      npc.busyUntilMs = undefined;
      npc.busyUntilTick = undefined;
    };

    park(starters[0]!);
    const shortLot = findLiftableLot(
      world,
      starters[0]!,
      heldLots,
      80,
      (l) => contractPilotOriginCountry(world, l.originIcao) === 'BR',
    );
    assert.ok(shortLot);
    heldLots.add(shortLot!.id);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    assert.equal(
      starterContractPilotCountryNeedsFloor(world, shortLot!.originIcao),
      true,
    );
    const shortFlight = createNpcContractPilotOffer(
      world,
      starters[0]!.id,
      shortLot!.id,
      { nowMs, rng: () => 0 },
    );
    const shortHours =
      ((shortFlight.awaitingPilotUntilMs ?? nowMs) - nowMs) / 3_600_000;
    assert.ok(
      shortHours >= AWAITING_PILOT_SHORT_MIN_HOURS - 1e-9 &&
        shortHours <= AWAITING_PILOT_SHORT_MAX_HOURS + 1e-9,
      `expected short hold, got ${shortHours}h`,
    );

    // Fill home country up to the floor with synthetic BR holds.
    const brHub =
      world.airports.find((a) => a.icao === 'SBGR') ??
      world.airports.find(
        (a) => contractPilotOriginCountry(world, a.icao) === 'BR',
      );
    assert.ok(brHub);
    let brOpen = countOpenContractPilotOffersInCountry(world, 'BR', 'starter');
    let fill = 0;
    while (brOpen < floor) {
      world.npcFlights.push({
        id: `fill-br-${fill}`,
        npcId: starters[0]!.id,
        lotId: `fill-br-lot-${fill}`,
        originIcao: brHub!.icao,
        destIcao: brHub!.icao,
        commodityId: 'general',
        cargoKg: 200,
        payUsd: 500,
        aircraftClassId: 'light_turboprop',
        departedAtTick: world.tick,
        arrivesAtTick: world.tick,
        departedAtMs: nowMs,
        arrivesAtMs: nowMs + 3_600_000,
        status: 'awaiting_pilot',
        awaitingPilotUntilMs: nowMs + 3_600_000,
      });
      fill += 1;
      brOpen += 1;
    }
    assert.equal(
      starterContractPilotCountryNeedsFloor(world, brHub!.icao),
      false,
    );

    park(starters[1]!);
    const longLot = findLiftableLot(
      world,
      starters[1]!,
      heldLots,
      80,
      (l) => contractPilotOriginCountry(world, l.originIcao) === 'BR',
    );
    assert.ok(longLot);
    const longFlight = createNpcContractPilotOffer(
      world,
      starters[1]!.id,
      longLot!.id,
      { nowMs, rng: () => 0 },
    );
    const longHours =
      ((longFlight.awaitingPilotUntilMs ?? nowMs) - nowMs) / 3_600_000;
    assert.ok(
      longHours >= AWAITING_PILOT_MIN_HOURS - 1e-9 &&
        longHours <= AWAITING_PILOT_MAX_HOURS + 1e-9,
      `expected long hold, got ${longHours}h`,
    );
  });

  it('does not use the country floor bypass for jet+ crew holds', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-other-cap' });
    tickEconomyN(world, 24);
    world.homeCountryId = 'BR';
    const otherCap = maxOpenContractPilotOffers(world, 'other');
    const brHub =
      world.airports.find((a) => a.icao === 'SBGR') ??
      world.airports.find(
        (a) => contractPilotOriginCountry(world, a.icao) === 'BR',
      );
    assert.ok(brHub);
    const heavyNpc = world.npcs.find(
      (n) =>
        npcCanOfferContractPilot(n) &&
        !isStarterContractPilotClass(n.aircraftClassId),
    );
    assert.ok(heavyNpc);
    for (let i = 0; i < otherCap; i++) {
      world.npcFlights.push({
        id: `fill-other-${i}`,
        npcId: heavyNpc!.id,
        lotId: `fill-other-lot-${i}`,
        originIcao: brHub!.icao,
        destIcao: brHub!.icao,
        commodityId: 'general',
        cargoKg: 5_000,
        payUsd: 5_000,
        aircraftClassId: 'narrow_freighter',
        departedAtTick: world.tick,
        arrivesAtTick: world.tick,
        departedAtMs: world.lastBatchAtMs ?? Date.now(),
        arrivesAtMs: (world.lastBatchAtMs ?? Date.now()) + 3_600_000,
        status: 'awaiting_pilot',
        awaitingPilotUntilMs: (world.lastBatchAtMs ?? Date.now()) + 3_600_000,
      });
    }
    assert.ok(
      countOpenContractPilotOffers(world, 'other') >= otherCap,
    );

    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    heavyNpc!.status = 'idle';
    heavyNpc!.currentFlightId = undefined;
    heavyNpc!.busyUntilMs = undefined;
    heavyNpc!.busyUntilTick = undefined;
    const lot = findLiftableLot(world, heavyNpc!, heldLots, 200, (l) =>
      Boolean(contractPilotOriginCountry(world, l.originIcao) === 'BR'),
    );
    assert.ok(lot);
    assert.throws(() =>
      createNpcContractPilotOffer(world, heavyNpc!.id, lot!.id, {
        nowMs: world.lastBatchAtMs ?? Date.now(),
        rng: () => 0,
        respectCaps: true,
      }),
    );
  });

  it('never opens a crew offer on an abstract (non-homologated) NPC', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-abstract' });
    tickEconomyN(world, 24);
    const npc = world.npcs.find((n) => n.aircraftClassId === 'narrow_freighter');
    assert.ok(npc);
    // Force the abstract FSLTL code back onto a class that now has Market SKUs.
    npc!.airframeTypeId = 'B738';
    assert.equal(npcAirframeIsHomologated(npc!.airframeTypeId), false);
    assert.equal(npcCanOfferContractPilot(npc!), false);
    // Every offer path runs ensureNpcFleet first, which remigrates the operator
    // onto a Market SKU — the player never gets a crew hold nobody can fly.
    ensureNpcAirframes(world);
    assert.ok(npcAirframeIsHomologated(npc!.airframeTypeId));
    assert.equal(npcCanOfferContractPilot(npc!), true);
  });

  it('accepts a crew offer into a contract-pilot mission without aircraftId', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-accept' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = findLiftableLot(world, npc!, heldLots);
    assert.ok(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.4,
    });
    const offerCargoKg = flight.cargoKg;
    const offerPayUsd = flight.payUsd;
    const offerPilotFeeUsd =
      flight.pilotFeeUsd ?? quoteContractPilotFeeUsd(offerPayUsd);
    const reservedBefore = lot!.reservedKg;
    const state = emptyMissionsStateV2();
    const accepted = acceptContractPilotOffer(world, state, {
      lotId: lot!.id,
      airframeTypeId: npc!.airframeTypeId!,
      nowMs,
    });
    assert.equal(accepted.mission.contractPilot, true);
    assert.equal(accepted.mission.aircraftId, undefined);
    assert.equal(accepted.mission.airframeTypeId, npc!.airframeTypeId);
    assert.equal(accepted.mission.payUsd, accepted.pilotFeeUsd);
    const dist =
      routeDistanceNm(world, flight.originIcao, flight.destIcao) ?? undefined;
    const expectedLift = contractPilotLiftKg(
      npc!.airframeTypeId!,
      flight.aircraftClassId,
      offerCargoKg,
      { distanceNm: dist },
    );
    assert.equal(accepted.liftedKg, expectedLift);
    assert.equal(accepted.remainderKg, offerCargoKg - expectedLift);
    assert.equal(accepted.npcDepartedWithRemainder, false);
    assert.equal(
      accepted.remainderOpenOnBoard,
      expectedLift < offerCargoKg,
    );
    assert.equal(
      accepted.pilotFeeUsd,
      Math.max(
        50,
        Math.round(offerPilotFeeUsd * (expectedLift / offerCargoKg)),
      ),
    );
    assert.equal(accepted.mission.operatorNpcName, npc!.name);
    assert.equal(state.missions.length, 1);
    if (expectedLift >= offerCargoKg) {
      assert.ok(!world.npcFlights.some((f) => f.id === flight.id));
    } else {
      const rem = world.npcFlights.find((f) => f.id === flight.id);
      assert.ok(rem);
      assert.equal(rem!.status, 'awaiting_pilot');
      assert.equal(rem!.cargoKg, offerCargoKg - expectedLift);
    }
    assert.equal(lot!.reservedKg, reservedBefore);
    if (expectedLift >= offerCargoKg) {
      assert.equal(npcClaimForLot(world, lot!.id, nowMs), undefined);
    } else {
      const claim = npcClaimForLot(world, lot!.id, nowMs);
      assert.equal(claim?.crewNeeded, true);
      assert.equal(claim?.cargoKg, offerCargoKg - expectedLift);
    }
    // SLA must not copy a stale lot expiry onto the mission.
    assert.ok(
      accepted.mission.deadlineTick >= world.tick + hoursToTicks(2),
      `deadline ${accepted.mission.deadlineTick} should be >= accept+2h (${world.tick + hoursToTicks(2)})`,
    );
  });

  it('contractPilotMissionDeadlineTick floors past lot expiry to accept+block', () => {
    const staleExpiry = 168;
    const acceptTick = 199;
    const deadline = contractPilotMissionDeadlineTick({
      worldTick: acceptTick,
      lotExpiresAtTick: staleExpiry,
      distanceNm: 280,
      aircraftClassId: 'light_jet',
    });
    assert.ok(deadline > acceptTick);
    assert.ok(deadline > staleExpiry);
    assert.equal(
      deadline,
      Math.max(
        staleExpiry,
        acceptTick +
          hoursToTicks(
            Math.max(
              2,
              estimateNpcBlockHours(280, 'light_jet').flightHours + 1.5,
            ),
          ),
      ),
    );
  });

  it('acceptContractPilotOffer does not start already late when lot expired', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-stale-deadline' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter((f) => f.status === 'awaiting_pilot' || f.status === 'in_flight')
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = world.lots.find(
      (l) =>
        !heldLots.has(l.id) &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.4,
    });
    // Simulate the real bug: cargo lot expired hours ago, crew window still open.
    lot!.expiresAtTick = world.tick - hoursToTicks(8);
    const state = emptyMissionsStateV2();
    const accepted = acceptContractPilotOffer(world, state, {
      lotId: lot!.id,
      airframeTypeId: npc!.airframeTypeId!,
      nowMs,
    });
    assert.ok(accepted.mission.deadlineTick > world.tick);
    assert.ok(accepted.mission.deadlineTick > lot!.expiresAtTick);
    assert.equal(
      accepted.mission.deadlineTick,
      contractPilotMissionDeadlineTick({
        worldTick: world.tick,
        lotExpiresAtTick: lot!.expiresAtTick,
        distanceNm:
          routeDistanceNm(
            world,
            accepted.mission.originIcao,
            accepted.mission.destIcao,
          ) ?? undefined,
        aircraftClassId: accepted.mission.aircraftClassId,
      }),
    );
  });

  it('operator covers pilot-to origin on accept and settle moves pilot to dest', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-pilot-to' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = findLiftableLot(
      world,
      npc!,
      heldLots,
      200,
      (l) => l.originIcao.toUpperCase() !== 'SBGR',
    );
    assert.ok(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.35,
    });
    const state = emptyMissionsStateV2();
    state.hubSelected = true;
    state.pilotName = 'Ada Skyline';
    state.homeHubIcao = 'SBGR';
    state.pilotIcao = 'SBGR';
    state.walletUsd = 1_000;
    const walletBefore = state.walletUsd;
    const origin = flight.originIcao.toUpperCase();
    const dest = flight.destIcao.toUpperCase();
    assert.notEqual(origin, 'SBGR');

    const accepted = acceptContractPilotOffer(world, state, {
      lotId: lot!.id,
      airframeTypeId: npc!.airframeTypeId!,
      nowMs,
    });
    assert.equal(state.pilotIcao, origin);
    assert.equal(accepted.pilotRelocatedFrom, 'SBGR');
    assert.equal(state.walletUsd, walletBefore);

    const settled = settleMission(world, accepted.mission, {
      tick: world.tick,
      nowMs,
      skipMinAirborneGate: true,
      fleet: state,
    });
    assert.equal(settled.mission.status, 'settled');
    assert.equal(state.pilotIcao, dest);
    assert.equal(state.walletUsd, walletBefore);
  });

  it('route-limits F406 lift on long hops so SimBrief MTOW matches mission cargo', () => {
    const typeId = 'inibuilds-f406-caravan-ii-passenger';
    const offerKg = 1_700; // under structural ~1814 kg, over long-hop payload
    const structuralLift = contractPilotLiftKg(
      typeId,
      'light_turboprop',
      offerKg,
    );
    // Catalog structural payload (mtow − oew), not the offer or class fallback.
    assert.equal(structuralLift, 1_573);
    const routeLift = contractPilotLiftKg(typeId, 'light_turboprop', offerKg, {
      distanceNm: 913,
    });
    assert.ok(
      routeLift < offerKg,
      `expected route MTOW cap below ${offerKg}, got ${routeLift}`,
    );
    assert.ok(routeLift > 400);
    // Fuel planning pad reduced — more payload available than the old ~720 kg
    // SimBrief-under-estimate band; still route-limited below structural 1700.
    assert.ok(
      routeLift >= 900 && routeLift <= 1_300,
      `expected ~1000–1200 kg ballpark, got ${routeLift}`,
    );
  });

  it('marks light-jet transcon crew offers unflyable and promotes them early', () => {
    // KSFO→KCLE ~1874 nm is inside light_jet maxRange but fuel leaves 0 payload.
    const typeId = 'flysimware-learjet-35a-cargo';
    const lift = contractPilotLiftKg(typeId, 'light_jet', 907, {
      distanceNm: 1874,
    });
    assert.equal(lift, 0);

    const world = createSeedEconomyWorld({ seed: 'npc-crew-unflyable' });
    const nowMs = world.lastBatchAtMs ?? Date.now();
    // Class-wide reach grows as jets are homologated (Longitude, C750 do a
    // transcon with payload), so the unflyable case has to be intercontinental.
    const distanceNm = routeDistanceNm(world, 'KSFO', 'SBGR');
    assert.ok(distanceNm !== undefined && distanceNm > 4_000);
    assert.equal(
      contractPilotHasFlyableAirframe(
        {
          aircraftClassId: 'light_jet',
          cargoKg: 907,
          payUsd: 100_000,
          originIcao: 'KSFO',
          destIcao: 'SBGR',
        },
        { distanceNm },
      ),
      false,
    );
    world.npcFlights.push({
      id: 'npcf-unflyable-test',
      npcId: world.npcs[0]!.id,
      lotId: 'lot-unflyable-test',
      originIcao: 'KSFO',
      destIcao: 'SBGR',
      commodityId: 'electronics',
      cargoKg: 907,
      payUsd: 100_000,
      aircraftClassId: 'light_jet',
      departedAtTick: world.tick,
      arrivesAtTick: world.tick,
      departedAtMs: nowMs,
      arrivesAtMs: nowMs + 3_600_000,
      status: 'awaiting_pilot',
      awaitingPilotUntilMs: nowMs + 3_600_000,
      pilotFeeUsd: 40_000,
    });
    settleNpcOpsDue(world, nowMs);
    const flight = world.npcFlights.find((f) => f.id === 'npcf-unflyable-test');
    assert.ok(flight);
    assert.equal(flight!.status, 'in_flight');
  });

  it('hides Fly on awaiting_pilot holds with zero route lift', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-hide-fly' });
    const nowMs = world.lastBatchAtMs ?? Date.now();
    world.npcFlights.push({
      id: 'npcf-hide-fly-test',
      npcId: world.npcs[0]!.id,
      lotId: 'lot-hide-fly-test',
      originIcao: 'KSFO',
      destIcao: 'SBGR',
      commodityId: 'electronics',
      cargoKg: 907,
      payUsd: 100_000,
      aircraftClassId: 'light_jet',
      departedAtTick: world.tick,
      arrivesAtTick: world.tick,
      departedAtMs: nowMs,
      arrivesAtMs: nowMs + 3_600_000,
      status: 'awaiting_pilot',
      awaitingPilotUntilMs: nowMs + 3_600_000,
      pilotFeeUsd: 40_000,
    });
    const claim = npcClaimForLot(world, 'lot-hide-fly-test', nowMs);
    assert.ok(claim);
    assert.equal(claim!.crewNeeded, undefined);
  });

  it('partial lift leaves remainder claimable on the board', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-partial' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find(
      (n) =>
        n.aircraftClassId === 'light_turboprop' && npcCanOfferContractPilot(n),
    );
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = world.lots.find(
      (l) =>
        !heldLots.has(l.id) &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.45,
    });
    // Pin a short hop so this test isolates structural partial lift (not route fuel).
    let shortOrigin = flight.originIcao;
    let shortDest = flight.destIcao;
    outer: for (const a of world.airports) {
      for (const b of world.airports) {
        if (a.icao === b.icao) continue;
        const d = routeDistanceNm(world, a.icao, b.icao);
        if (d != null && d >= 40 && d <= 180) {
          shortOrigin = a.icao;
          shortDest = b.icao;
          break outer;
        }
      }
    }
    flight.originIcao = shortOrigin;
    flight.destIcao = shortDest;
    const originalPay = flight.payUsd;
    const originalFee = flight.pilotFeeUsd ?? quoteContractPilotFeeUsd(originalPay);
    // Inflate the hold so the player's SKU cannot cover it alone.
    const inflatedKg = 50_000;
    const addKg = inflatedKg - flight.cargoKg;
    flight.cargoKg = inflatedKg;
    lot!.reservedKg += addKg;
    lot!.quantityKg = Math.max(lot!.quantityKg, lot!.reservedKg);
    const state = emptyMissionsStateV2();
    const airframeTypeId =
      'inibuilds-f406-caravan-ii-passenger';
    const accepted = acceptContractPilotOffer(world, state, {
      lotId: lot!.id,
      airframeTypeId,
      nowMs,
    });
    assert.ok(accepted.liftedKg > 0);
    assert.ok(accepted.liftedKg < inflatedKg);
    assert.equal(accepted.remainderKg, inflatedKg - accepted.liftedKg);
    assert.equal(accepted.remainderOpenOnBoard, true);
    assert.equal(accepted.npcDepartedWithRemainder, false);
    assert.equal(accepted.mission.cargoKg, accepted.liftedKg);
    assert.ok(accepted.pilotFeeUsd < originalFee);
    const rem = world.npcFlights.find((f) => f.id === flight.id);
    assert.ok(rem);
    assert.equal(rem!.status, 'awaiting_pilot');
    assert.equal(rem!.cargoKg, accepted.remainderKg);
    assert.equal(npc!.currentFlightId, flight.id);
    const claim = npcClaimForLot(world, lot!.id, nowMs);
    assert.equal(claim?.crewNeeded, true);
    assert.equal(claim?.cargoKg, accepted.remainderKg);
    const board = listMarketLots(world, { nowMs });
    assert.ok(board.some((v) => v.lot.id === lot!.id && v.npcClaim?.crewNeeded));
  });

  it('cancel returns contract slice to the open remainder pool', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-cancel-pool' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find(
      (n) =>
        n.aircraftClassId === 'light_turboprop' && npcCanOfferContractPilot(n),
    );
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = world.lots.find(
      (l) =>
        !heldLots.has(l.id) &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.4,
    });
    let shortOrigin = flight.originIcao;
    let shortDest = flight.destIcao;
    outer: for (const a of world.airports) {
      for (const b of world.airports) {
        if (a.icao === b.icao) continue;
        const d = routeDistanceNm(world, a.icao, b.icao);
        if (d != null && d >= 40 && d <= 180) {
          shortOrigin = a.icao;
          shortDest = b.icao;
          break outer;
        }
      }
    }
    flight.originIcao = shortOrigin;
    flight.destIcao = shortDest;
    const inflatedKg = 50_000;
    const addKg = inflatedKg - flight.cargoKg;
    flight.cargoKg = inflatedKg;
    lot!.reservedKg += addKg;
    lot!.quantityKg = Math.max(lot!.quantityKg, lot!.reservedKg);
    const offerBefore = flight.cargoKg;
    const payBefore = flight.payUsd;
    const reservedBefore = lot!.reservedKg;
    const state = emptyMissionsStateV2();
    const accepted = acceptContractPilotOffer(world, state, {
      lotId: lot!.id,
      airframeTypeId: 'inibuilds-f406-caravan-ii-passenger',
      nowMs,
    });
    assert.equal(accepted.remainderOpenOnBoard, true);
    const afterAcceptKg = world.npcFlights.find((f) => f.id === flight.id)!.cargoKg;
    cancelMission(world, accepted.mission, { nowMs });
    const rem = world.npcFlights.find((f) => f.id === flight.id);
    assert.ok(rem);
    assert.equal(rem!.status, 'awaiting_pilot');
    assert.equal(rem!.cargoKg, afterAcceptKg + accepted.liftedKg);
    assert.equal(rem!.cargoKg, offerBefore);
    assert.equal(rem!.payUsd, payBefore);
    assert.equal(lot!.reservedKg, reservedBefore);
    assert.equal(npcClaimForLot(world, lot!.id, nowMs)?.crewNeeded, true);
  });

  it('rejects expired crew offers and settles fee with no fuel debit', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-settle' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = world.lots.find(
      (l) =>
        !heldLots.has(l.id) &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 200,
    );
    assert.ok(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.3,
    });
    // Keep the hold flyable — unflyable awaiting_pilot promotes on fleet settle.
    let shortOrigin = flight.originIcao;
    let shortDest = flight.destIcao;
    outer: for (const a of world.airports) {
      for (const b of world.airports) {
        if (a.icao === b.icao) continue;
        const d = routeDistanceNm(world, a.icao, b.icao);
        if (d != null && d >= 40 && d <= 180) {
          shortOrigin = a.icao;
          shortDest = b.icao;
          break outer;
        }
      }
    }
    flight.originIcao = shortOrigin;
    flight.destIcao = shortDest;
    flight.awaitingPilotUntilMs = nowMs - 1;
    assert.throws(
      () =>
        acceptContractPilotOffer(world, emptyMissionsStateV2(), {
          lotId: lot!.id,
          airframeTypeId: npc!.airframeTypeId!,
          nowMs,
        }),
      /expired/i,
    );

    // Re-open a valid hold window and accept.
    flight.awaitingPilotUntilMs = nowMs + 4 * 60 * 60 * 1000;
    const state = emptyMissionsStateV2();
    const { mission, pilotFeeUsd } = acceptContractPilotOffer(world, state, {
      lotId: lot!.id,
      airframeTypeId: npc!.airframeTypeId!,
      nowMs,
    });
    const settled = settleMission(world, mission, {
      tick: world.tick,
      nowMs,
      skipMinAirborneGate: true,
    });
    assert.equal(settled.fuelDebitUsd, 0);
    assert.equal(settled.walletCreditUsd, pilotFeeUsd);
    assert.equal(settled.mission.fuelUplift?.costUsd ?? 0, 0);
    assert.equal(settled.mission.status, 'settled');
  });

  it('cancel after accept releases the reserved cargo', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-cancel' });
    tickEconomyN(world, 24);
    const heldLots = new Set(
      world.npcFlights
        .filter(
          (f) => f.status === 'in_flight' || f.status === 'awaiting_pilot',
        )
        .map((f) => f.lotId),
    );
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    npc!.status = 'idle';
    npc!.currentFlightId = undefined;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const lot = findLiftableLot(world, npc!, heldLots);
    assert.ok(lot);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    createNpcContractPilotOffer(world, npc!.id, lot!.id, {
      nowMs,
      rng: () => 0.2,
    });
    const state = emptyMissionsStateV2();
    const accepted = acceptContractPilotOffer(world, state, {
      lotId: lot!.id,
      airframeTypeId: npc!.airframeTypeId!,
      nowMs,
    });
    const reservedAtAccept = lot!.reservedKg;
    const cancelled = cancelMission(world, accepted.mission, { nowMs });
    assert.equal(cancelled.status, 'cancelled');
    if (accepted.remainderOpenOnBoard) {
      // Slice returned to the Contract pool — reservation stays with the offer.
      assert.equal(lot!.reservedKg, reservedAtAccept);
      assert.ok(
        world.npcFlights.some(
          (f) => f.lotId === lot!.id && f.status === 'awaiting_pilot',
        ),
      );
    } else {
      assert.ok(lot!.reservedKg < reservedAtAccept);
    }
  });

  it('opens reposition crew offer after freight settles away from home', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-repo-settle' });
    tickEconomyN(world, 12);
    clearOpenRepositionOffers(world);
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    const away = findReachableAwayPad(world, npc!);
    const homeHub = world.airports.find((a) => a.region === npc!.homeRegion);
    assert.ok(away && homeHub);

    // Simulate an in-flight freight that is about to land away from home.
    npc!.status = 'busy';
    npc!.hoursSinceMx = 0;
    npc!.busyUntilMs = undefined;
    npc!.busyUntilTick = undefined;
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const freight: NpcFlight = {
      id: `npcf-test-repo-${npc!.id}`,
      npcId: npc!.id,
      lotId: `lot-test-repo-${npc!.id}`,
      originIcao: homeHub!.icao,
      destIcao: away!.icao,
      commodityId: 'general',
      cargoKg: 500,
      payUsd: 1_000,
      aircraftClassId: npc!.aircraftClassId,
      departedAtTick: world.tick,
      arrivesAtTick: world.tick,
      departedAtMs: nowMs - 3_600_000,
      arrivesAtMs: nowMs - 1_000,
      status: 'in_flight',
    };
    npc!.currentFlightId = freight.id;
    world.npcFlights.push(freight);
    world.lots.push({
      id: freight.lotId,
      commodityId: 'general',
      originIcao: freight.originIcao,
      destIcao: freight.destIcao,
      quantityKg: 500,
      reservedKg: 500,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 48,
      payUsd: 1_000,
      urgency: 'normal',
      reason: 'test freight',
      status: 'in_transit',
    });

    settleNpcOpsDue(world, nowMs);
    const repo = world.npcFlights.find(
      (f) =>
        f.npcId === npc!.id &&
        f.status === 'awaiting_pilot' &&
        f.kind === 'reposition',
    );
    assert.ok(repo, 'expected reposition crew offer after away delivery');
    assert.equal(repo!.originIcao, away!.icao);
    assert.equal(npc!.locationIcao, away!.icao);
    assert.equal(npc!.currentFlightId, repo!.id);

    const claim = npcClaimForLot(world, repo!.lotId, nowMs);
    assert.equal(claim?.crewNeeded, true);
    assert.equal(claim?.crewReposition, true);

    const board = listMarketLots(world, { nowMs });
    const row = board.find((v) => v.lot.id === repo!.lotId);
    assert.equal(row?.npcClaim?.crewNeeded, true);
    assert.equal(row?.npcClaim?.crewReposition, true);
  });

  it('creates reposition offer via helper and surfaces on the board', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-repo-helper' });
    tickEconomyN(world, 12);
    clearOpenRepositionOffers(world);
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    const away = findReachableAwayPad(world, npc!);
    assert.ok(away);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcRepositionOffer(world, npc!.id, away!.icao, {
      nowMs,
      rng: () => 0.4,
    });
    assert.equal(flight.kind, 'reposition');
    assert.equal(flight.status, 'awaiting_pilot');
    assert.equal(flight.cargoKg, 0);
    assert.ok(
      (flight.awaitingPilotUntilMs ?? 0) - nowMs <=
        REPOSITION_AWAITING_MAX_HOURS * 3_600_000 + 1,
    );
  });

  it('promotes expired reposition offers into solo homebound flight', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-repo-timeout' });
    tickEconomyN(world, 12);
    clearOpenRepositionOffers(world);
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    const away = findReachableAwayPad(world, npc!);
    assert.ok(away);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcRepositionOffer(world, npc!.id, away!.icao, {
      nowMs,
      rng: () => 0.5,
    });
    assert.equal(flight.status, 'awaiting_pilot');

    settleNpcOpsDue(world, (flight.awaitingPilotUntilMs ?? nowMs) + 1);
    const live = world.npcFlights.find((f) => f.id === flight.id);
    assert.ok(live);
    assert.equal(live!.status, 'in_flight');
    assert.equal(live!.kind, 'reposition');
    assert.ok(live!.arrivesAtMs > nowMs);

    settleNpcOpsDue(world, live!.arrivesAtMs + 1);
    assert.ok(!world.npcFlights.some((f) => f.id === flight.id));
    assert.equal(npc!.locationIcao, live!.destIcao);
    assert.equal(
      world.airports.find((a) => a.icao === npc!.locationIcao)?.region,
      npc!.homeRegion,
    );
  });

  it('accepts reposition as empty contract-pilot mission', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-repo-accept' });
    tickEconomyN(world, 12);
    clearOpenRepositionOffers(world);
    const npc = world.npcs.find((n) => npcCanOfferContractPilot(n));
    assert.ok(npc);
    const away = findReachableAwayPad(world, npc!);
    assert.ok(away);
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcRepositionOffer(world, npc!.id, away!.icao, {
      nowMs,
      rng: () => 0.3,
    });
    const dist =
      routeDistanceNm(world, flight.originIcao, flight.destIcao) ?? 0;
    const expectedFee = quoteRepositionPilotFeeUsd(dist, flight.aircraftClassId);
    assert.equal(flight.pilotFeeUsd, expectedFee);
    assert.ok(expectedFee > REPOSITION_PILOT_FEE_MIN_USD || dist < 40);
    const state = emptyMissionsStateV2();
    const accepted = acceptContractPilotOffer(world, state, {
      npcFlightId: flight.id,
      airframeTypeId: npc!.airframeTypeId!,
      nowMs,
    });
    assert.equal(accepted.mission.contractPilot, true);
    assert.equal(accepted.mission.contractPilotReposition, true);
    assert.equal(accepted.mission.cargoKg, 0);
    assert.equal(accepted.liftedKg, 0);
    assert.equal(accepted.pilotFeeUsd, expectedFee);
    assert.ok(!world.npcFlights.some((f) => f.id === flight.id));
    assert.equal(npc!.status, 'idle');
  });

  it('caps concurrent open reposition offers', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-repo-cap' });
    tickEconomyN(world, 12);
    // Clear live traffic so ensureNpcFleet settle cannot auto-spawn repos.
    world.npcFlights = [];
    world.lots = world.lots.filter((l) => !l.id.startsWith('npc-repo-'));
    for (const npc of world.npcs) {
      npc.currentFlightId = undefined;
      npc.status = 'idle';
      npc.busyUntilMs = undefined;
      npc.busyUntilTick = undefined;
      npc.hoursSinceMx = 0;
    }
    const homologated = world.npcs.filter((n) => npcCanOfferContractPilot(n));
    const starters = homologated.filter((n) =>
      isStarterContractPilotClass(n.aircraftClassId),
    );
    const others = homologated.filter(
      (n) => !isStarterContractPilotClass(n.aircraftClassId),
    );
    assert.ok(starters.length >= MAX_OPEN_STARTER_REPOSITION_OFFERS);
    assert.ok(others.length >= MAX_OPEN_REPOSITION_OFFERS);
    const nowMs = world.lastBatchAtMs ?? Date.now();

    const fillBand = (
      pool: typeof homologated,
      limit: number,
    ): typeof homologated => {
      const used: typeof homologated = [];
      for (const npc of pool) {
        if (used.length >= limit) break;
        const away = findReachableAwayPad(world, npc);
        if (!away) continue;
        createNpcRepositionOffer(world, npc.id, away.icao, {
          nowMs,
          rng: () => 0.25,
        });
        used.push(npc);
      }
      return used;
    };
    const starterUsed = fillBand(starters, MAX_OPEN_STARTER_REPOSITION_OFFERS);
    const otherUsed = fillBand(others, MAX_OPEN_REPOSITION_OFFERS);
    assert.equal(starterUsed.length, MAX_OPEN_STARTER_REPOSITION_OFFERS);
    assert.equal(otherUsed.length, MAX_OPEN_REPOSITION_OFFERS);
    const open = world.npcFlights.filter(
      (f) => f.status === 'awaiting_pilot' && f.kind === 'reposition',
    );
    assert.equal(
      open.length,
      MAX_OPEN_STARTER_REPOSITION_OFFERS + MAX_OPEN_REPOSITION_OFFERS,
    );

    const extraStarter = starters.find(
      (n) =>
        !open.some((f) => f.npcId === n.id) &&
        Boolean(findReachableAwayPad(world, n)),
    );
    assert.ok(extraStarter);
    const awayStarter = findReachableAwayPad(world, extraStarter!);
    assert.ok(awayStarter);
    assert.throws(
      () =>
        createNpcRepositionOffer(world, extraStarter!.id, awayStarter!.icao, {
          nowMs,
          rng: () => 0.25,
        }),
      /Failed to create reposition offer/,
    );
    const extraOther = others.find(
      (n) =>
        !open.some((f) => f.npcId === n.id) &&
        Boolean(findReachableAwayPad(world, n)),
    );
    assert.ok(extraOther);
    const awayOther = findReachableAwayPad(world, extraOther!);
    assert.ok(awayOther);
    assert.throws(
      () =>
        createNpcRepositionOffer(world, extraOther!.id, awayOther!.icao, {
          nowMs,
          rng: () => 0.25,
        }),
      /Failed to create reposition offer/,
    );
  });

  it('marks starter turboprop crew offers beyond airframe range unflyable', () => {
    const lift = contractPilotLiftKg('inibuilds-ys-11', 'light_turboprop', 15_000, {
      distanceNm: 4852,
    });
    assert.equal(lift, 0);
    assert.equal(
      contractPilotHasFlyableAirframe(
        {
          aircraftClassId: 'light_turboprop',
          cargoKg: 15_000,
          payUsd: 82_184,
          originIcao: 'KLAX',
          destIcao: 'SCEL',
        },
        { distanceNm: 4852 },
      ),
      false,
    );
  });

  it('heals awaiting_pilot flights whose board lot was pruned', () => {
    const world = createSeedEconomyWorld({ seed: 'crew-heal-lot' });
    const nowMs = world.lastBatchAtMs ?? Date.now();
    const flight = createNpcRepositionOffer(world, 'npc-1', 'SBGR', {
      nowMs,
      rng: () => 0.2,
    });
    world.lots = world.lots.filter((l) => l.id !== flight.lotId);
    assert.equal(npcClaimForLot(world, flight.lotId, nowMs)?.crewNeeded, true);
    assert.equal(
      listMarketLots(world, { nowMs }).some(
        (row) => row.lot.id === flight.lotId && row.npcClaim?.crewNeeded,
      ),
      false,
    );
    assert.equal(healAwaitingPilotBoardLots(world, nowMs), 1);
    assert.ok(
      listMarketLots(world, { nowMs }).some(
        (row) => row.lot.id === flight.lotId && row.npcClaim?.crewNeeded,
      ),
    );
  });

  it('tops up the home-country starter crew floor while NPCs are in flight', () => {
    const world = createSeedEconomyWorld({ seed: 'crew-floor-topup' });
    world.homeCountryId = 'US';
    const nowMs = world.lastBatchAtMs ?? Date.now();
    for (const npc of world.npcs) {
      npc.status = 'busy';
      npc.currentFlightId = 'busy-placeholder';
    }
    const resting = world.npcs.find(
      (n) =>
        isStarterContractPilotClass(n.aircraftClassId) &&
        npcCanOfferContractPilot(n),
    );
    assert.ok(resting);
    resting!.status = 'resting';
    resting!.currentFlightId = undefined;
    world.npcFlights = world.npcFlights.filter(
      (f) => f.status !== 'awaiting_pilot',
    );
    assert.equal(
      countOpenContractPilotOffersInCountry(world, 'US', 'starter'),
      0,
    );
    const added = topUpStarterContractPilotFloor(world, nowMs);
    assert.ok(added > 0);
    assert.ok(
      countOpenContractPilotOffersInCountry(world, 'US', 'starter') > 0,
    );
    assert.ok(
      listMarketLots(world, { nowMs }).some((row) => row.npcClaim?.crewNeeded),
    );
  });
});
