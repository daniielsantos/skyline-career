import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  describeLotMarketPressure,
  drainNpcMroParts,
  ensureNpcAirframes,
  ensureNpcFleet,
  estimateNpcBlockHours,
  listActiveNpcFreights,
  listNpcFleetStatus,
  listRegionMarketPressure,
  migrateEconomyWorld,
  hoursToTicks,
  NPC_FLEET_SIZE,
  NPC_MX_INTERVAL_HOURS,
  NPC_MX_PARTS_KG,
  npcLaneAirborneKg,
  npcMaxCargoKg,
  playerLaneInboundKg,
  laneInboundKg,
  npcLaneSaturation,
  npcRegionBidCapacity,
  routeDistanceNm,
  settleNpcOpsDue,
  tickEconomyN,
} from './career-economy.js';
import { getAircraftClass } from './career-mission.js';
import type { NpcFlight } from './types/career-economy.js';

describe('NPC freighter fleet', () => {
  it('seeds jets plus medium piston, light jet, Caravan and Bonanza GA freighters', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-seed' });
    assert.equal(world.npcs.length, NPC_FLEET_SIZE);
    assert.equal(world.npcFlights.length, 0);
    const narrow = world.npcs.filter((n) => n.aircraftClassId === 'narrow_freighter');
    const wide = world.npcs.filter((n) => n.aircraftClassId === 'wide_freighter');
    const mediumPiston = world.npcs.filter((n) => n.aircraftClassId === 'medium_piston');
    const lightJet = world.npcs.filter((n) => n.aircraftClassId === 'light_jet');
    const caravan = world.npcs.filter((n) => n.aircraftClassId === 'light_turboprop');
    const bonanza = world.npcs.filter((n) => n.aircraftClassId === 'light_ga');
    assert.equal(narrow.length, 14);
    assert.equal(wide.length, 10);
    assert.equal(mediumPiston.length, 4);
    assert.equal(lightJet.length, 4);
    assert.equal(caravan.length, 10);
    assert.equal(bonanza.length, 6);
    assert.ok(world.npcs.every((n) => n.status === 'idle'));
    assert.ok(world.npcs.every((n) => n.reliability > 0 && n.aggressiveness > 0));
  });

  it('assigns abstract airframe variants (FSLTL-derived) on seed', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-airframes' });
    assert.ok(world.npcs.every((n) => Boolean(n.airframeTypeId)));
    const types = new Set(world.npcs.map((n) => n.airframeTypeId));
    assert.ok(types.size >= 8, `expected variety, got ${[...types].join(',')}`);
    const withCargoCap = world.npcs.filter(
      (n) => typeof n.maxCargoKg === 'number' && n.maxCargoKg > 0,
    );
    assert.ok(withCargoCap.length >= 4);
    for (const npc of withCargoCap) {
      assert.ok(npcMaxCargoKg(npc) <= getAircraftClass(npc.aircraftClassId).maxCargoKg);
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
    assert.equal(jetOnly.length, 24);
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
      10,
    );
    assert.equal(
      migrated.npcs.filter((n) => n.aircraftClassId === 'medium_piston').length,
      4,
    );
    assert.equal(
      migrated.npcs.filter((n) => n.aircraftClassId === 'light_jet').length,
      4,
    );
    assert.equal(
      migrated.npcs.filter((n) => n.aircraftClassId === 'light_ga').length,
      6,
    );
    assert.equal(migrated.npcs.length, NPC_FLEET_SIZE);
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
    assert.equal(migrated.npcs.length, NPC_FLEET_SIZE);
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
    assert.equal(migrated.npcs.length, NPC_FLEET_SIZE);
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
    assert.equal(roster.length, NPC_FLEET_SIZE);
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
    npc.dutyHoursAccum = 9.5;
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

  it('forces rest after a long single leg even under cumulative duty cap', () => {
    const world = createSeedEconomyWorld({ seed: 'npc-rest-longleg' });
    const npc = world.npcs[0]!;
    const nowMs = world.lastBatchAtMs;

    npc.status = 'busy';
    npc.currentFlightId = undefined;
    npc.busyUntilMs = nowMs - 1;
    npc.dutyHoursAccum = 6.5;
    npc.lastLegDutyHours = 6.5;

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
});
