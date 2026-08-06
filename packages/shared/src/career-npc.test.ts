import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  createNpcContractPilotOffer,
  acceptContractPilotOffer,
  contractPilotLiftKg,
  describeLotMarketPressure,
  drainNpcMroParts,
  ensureNpcAirframes,
  ensureNpcFleet,
  estimateNpcBlockHours,
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
  npcRegionBidCapacity,
  isNpcReadyToBid,
  routeDistanceNm,
  settleNpcOpsDue,
  tickEconomyN,
} from './career-economy.js';
import { cancelMission, getAircraftClass, settleMission } from './career-mission.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import type { NpcFlight } from './types/career-economy.js';

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
    assert.ok(heavy.every((n) => Boolean(n.airframeTypeId)));
    // No player SKUs yet — still abstract FSLTL codes.
    assert.ok(heavy.some((n) => !npcAirframeIsHomologated(n.airframeTypeId)));
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
    assert.equal(busyHours, flightHours + 1);
    // Fractional resolution (not whole-hour ceil) for a mid-range hop.
    const short = estimateNpcBlockHours(500, 'narrow_freighter');
    assert.ok(short.flightHours < 2);
    assert.ok(Number.isInteger(short.flightHours * 10));
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
    const flying = roster.find((r) => r.mission);
    if (flying?.mission) {
      assert.ok(flying.mission.originIcao);
      assert.ok(flying.mission.destIcao);
      assert.ok(flying.mission.cargoKg > 0);
      assert.ok(typeof flying.mission.arrivesAtMs === 'number');
    }
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
    const region = world.npcs[0]!.homeRegion;
    for (const npc of world.npcs.filter((n) => n.homeRegion === region)) {
      npc.status = 'resting';
      npc.restUntilMs = nowMs + 12 * 3_600_000;
      npc.currentFlightId = undefined;
    }
    const origin =
      world.airports.find((a) => a.region === region)?.icao ?? 'SBGR';
    const dest =
      world.airports.find((a) => a.icao !== origin)?.icao ?? 'SBGL';

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
      cargoKg: 14_000,
      payUsd: 1,
      aircraftClassId: 'narrow_freighter',
      departedAtTick: world.tick,
      arrivesAtTick: world.tick + 2,
      departedAtMs: nowMs,
      arrivesAtMs: nowMs + 2 * 3_600_000,
      status: 'in_flight',
    });
    const busy = describeLotMarketPressure(
      world,
      { originIcao: origin, destIcao: dest, commodityId: 'general' },
      nowMs,
    );
    assert.equal(busy.laneBusy, true);

    const regions = listRegionMarketPressure(world, nowMs);
    assert.ok(regions.some((r) => r.region === region && r.thinFleet && r.weather));
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

    assert.equal(npcLaneAirborneKg(world, 'SBGR', 'SBGL', 'electronics'), 14_000);
    assert.equal(npcLaneAirborneKg(world, null, 'SBGL', 'electronics'), 14_000);
    assert.equal(npcLaneAirborneKg(world, 'SBPA', 'SBGL', 'electronics'), 0);
    assert.ok(Math.abs(npcLaneSaturation(world, 'SBGR', 'SBGL', 'electronics') - 0.5) < 1e-9);

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
    assert.equal(playerLaneInboundKg(world, 'SBGR', 'SBGL', 'electronics'), 7_000);
    assert.equal(laneInboundKg(world, 'SBGR', 'SBGL', 'electronics'), 21_000);
    assert.ok(Math.abs(npcLaneSaturation(world, 'SBGR', 'SBGL', 'electronics') - 0.75) < 1e-9);

    flight.cargoKg = 28_000;
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

  it('rejects contract pilot offers on abstract (non-homologated) NPCs', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-crew-abstract' });
    tickEconomyN(world, 24);
    const npc = world.npcs.find(
      (n) =>
        n.aircraftClassId === 'narrow_freighter' &&
        !npcAirframeIsHomologated(n.airframeTypeId),
    );
    assert.ok(npc);
    const lot = world.lots.find(
      (l) =>
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 500,
    );
    assert.ok(lot);
    assert.throws(
      () => createNpcContractPilotOffer(world, npc!.id, lot!.id),
      /homologated/i,
    );
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
      flight.cargoKg,
      { distanceNm: dist },
    );
    assert.equal(accepted.liftedKg, expectedLift);
    assert.equal(accepted.remainderKg, flight.cargoKg - expectedLift);
    assert.equal(accepted.npcDepartedWithRemainder, expectedLift < flight.cargoKg);
    assert.equal(
      accepted.pilotFeeUsd,
      Math.max(
        50,
        Math.round(
          (flight.pilotFeeUsd ?? quoteContractPilotFeeUsd(flight.payUsd)) *
            (expectedLift / flight.cargoKg),
        ),
      ),
    );
    assert.equal(accepted.mission.operatorNpcName, npc!.name);
    assert.equal(state.missions.length, 1);
    if (expectedLift >= flight.cargoKg) {
      assert.ok(!world.npcFlights.some((f) => f.id === flight.id));
    } else {
      assert.ok(world.npcFlights.some((f) => f.id === flight.id && f.status === 'in_flight'));
    }
    assert.equal(lot!.reservedKg, reservedBefore);
    if (expectedLift >= flight.cargoKg) {
      assert.equal(npcClaimForLot(world, lot!.id, nowMs), undefined);
    }
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
    const lot = world.lots.find(
      (l) =>
        !heldLots.has(l.id) &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg - l.reservedKg >= 200 &&
        l.originIcao.toUpperCase() !== 'SBGR',
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
    assert.equal(structuralLift, offerKg);
    const routeLift = contractPilotLiftKg(typeId, 'light_turboprop', offerKg, {
      distanceNm: 913,
    });
    assert.ok(
      routeLift < offerKg,
      `expected route MTOW cap below ${offerKg}, got ${routeLift}`,
    );
    assert.ok(routeLift > 400);
    // Calibrated to SimBrief CYWG→CYYZ (~720 kg cargo / MTOW-limited).
    assert.ok(
      routeLift >= 600 && routeLift <= 900,
      `expected ~720 kg ballpark, got ${routeLift}`,
    );
  });

  it('partial lift leaves remainder with NPC who departs immediately', () => {
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
    assert.equal(accepted.npcDepartedWithRemainder, true);
    assert.equal(accepted.mission.cargoKg, accepted.liftedKg);
    assert.ok(accepted.pilotFeeUsd < originalFee);
    const rem = world.npcFlights.find((f) => f.id === flight.id);
    assert.ok(rem);
    assert.equal(rem!.status, 'in_flight');
    assert.equal(rem!.cargoKg, accepted.remainderKg);
    assert.equal(npc!.currentFlightId, flight.id);
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
      rng: () => 0.2,
    });
    const state = emptyMissionsStateV2();
    const accepted = acceptContractPilotOffer(world, state, {
      lotId: lot!.id,
      airframeTypeId: npc!.airframeTypeId!,
      nowMs,
    });
    const reservedAtAccept = lot!.reservedKg;
    const cancelled = cancelMission(world, accepted.mission);
    assert.equal(cancelled.status, 'cancelled');
    assert.ok(lot!.reservedKg < reservedAtAccept);
  });
});
