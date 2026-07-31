import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  continuousEconomyHours,
  corridorWeight,
  createSeedEconomyWorld,
  DEAD_LOT_RETENTION_TICKS,
  ensureCareerHubCoverage,
  ensureEconomyCaughtUp,
  escalateIdleLots,
  hubTierOf,
  HUB_TIER_PROFILE,
  idleLotPayMult,
  IDLE_LOT_PAY_MAX_MULT,
  laneDemandShock,
  laneLotCaps,
  listActiveEconomyEvents,
  listMarketLots,
  localPriceMultiplier,
  migrateEconomyWorld,
  MS_PER_TICK,
  npcLaneSaturation,
  npcRegionBidCapacity,
  pruneDeadLots,
  routeDistanceNm,
  tickEconomyN,
} from './career-economy.js';
import type {
  CareerEconomyWorld,
  CommodityId,
  EconomyEvent,
  NpcFlight,
  ShipmentLot,
} from './types/career-economy.js';

describe('career-economy seed', () => {
  it('creates 28 Brazilian hubs across N/NE/CO/SE/S and 5 commodities of inventory', () => {
    const world = createSeedEconomyWorld({ seed: 'test-a' });
    assert.equal(world.version, 3);
    assert.ok(typeof world.lastBatchAtMs === 'number');
    assert.ok(Array.isArray(world.events));
    assert.equal(world.airports.length, 28);
    assert.ok(world.airports.every((airport) => airport.icao.startsWith('SB')));
    assert.deepEqual(
      new Set(world.airports.map((airport) => airport.region)),
      new Set(['BR-S', 'BR-SE', 'BR-NE', 'BR-N', 'BR-CO']),
    );
    assert.equal(world.tick, 0);
    assert.equal(world.lots.length, 0);
    assert.equal(world.npcs.length, 17);
    assert.equal(world.npcFlights.length, 0);
    for (const ap of world.airports) {
      assert.ok(ap.inventory.electronics);
      assert.ok(ap.inventory.perishables);
      assert.ok(ap.inventory.machinery);
      assert.ok(ap.inventory.general);
      assert.ok(ap.inventory.fuel);
      assert.ok(ap.baseProduction?.electronics !== undefined);
      assert.ok(ap.baseProduction?.fuel !== undefined);
      assert.ok(Number.isFinite(ap.lat));
      assert.ok(Number.isFinite(ap.lon));
      assert.ok(ap.hubTier === 'major' || ap.hubTier === 'regional' || ap.hubTier === 'spoke');
    }
  });

  it('scales major cargo hubs larger than spokes', () => {
    const world = createSeedEconomyWorld({ seed: 'tier-scale' });
    const gru = world.airports.find((a) => a.icao === 'SBGR')!;
    const manaus = world.airports.find((a) => a.icao === 'SBEG')!;
    const ps = world.airports.find((a) => a.icao === 'SBPS')!;
    assert.equal(hubTierOf(gru), 'major');
    assert.equal(hubTierOf(manaus), 'major');
    assert.equal(hubTierOf(ps), 'spoke');
    assert.ok(
      (gru.inventory.general?.capacityKg ?? 0) >
        (ps.inventory.general?.capacityKg ?? 0) * 3,
      'GRU warehouse should dwarf Porto Seguro',
    );
    assert.deepEqual(laneLotCaps('major', 'major'), {
      maxLots: HUB_TIER_PROFILE.major.maxLots,
      maxLarge: HUB_TIER_PROFILE.major.maxLarge,
      maxSmall: HUB_TIER_PROFILE.major.maxSmall,
    });
    assert.deepEqual(laneLotCaps('spoke', 'spoke'), {
      maxLots: 2,
      maxLarge: 1,
      maxSmall: 2,
    });
  });
});

describe('localPriceMultiplier', () => {
  it('raises price when stock is low', () => {
    const low = localPriceMultiplier({ stockKg: 5_000, capacityKg: 100_000 });
    const high = localPriceMultiplier({ stockKg: 95_000, capacityKg: 100_000 });
    assert.ok(low > high);
    assert.ok(low > 1);
    assert.ok(high < 1);
  });
});

describe('routeDistanceNm', () => {
  it('calculates route distance from seeded airport coordinates', () => {
    const world = createSeedEconomyWorld({ seed: 'distance-test' });
    const distance = routeDistanceNm(world, 'SBGR', 'SBGL');
    assert.ok(distance !== undefined);
    assert.ok(distance > 150 && distance < 250, `got ${distance} nm`);
  });

  it('resolves long-haul GRU–Manaus distance', () => {
    const world = createSeedEconomyWorld({ seed: 'distance-manaus' });
    const distance = routeDistanceNm(world, 'SBGR', 'SBEG');
    assert.ok(distance !== undefined);
    assert.ok(distance > 1_200 && distance < 1_600, `got ${distance} nm`);
  });
});

describe('cargo corridors', () => {
  it('weights historic GRU↔Manaus as a strong domestic axis', () => {
    assert.ok(corridorWeight('SBGR', 'SBEG') >= 2.2);
    assert.equal(corridorWeight('SBGR', 'SBEG'), corridorWeight('SBEG', 'SBGR'));
    assert.equal(corridorWeight('SBGR', 'SBPS'), 1);
  });

  it('biases lot formation toward curated corridor ODs', () => {
    const world = createSeedEconomyWorld({ seed: 'corridor-market' });
    // Count formation shape without NPC skim (competitors prefer corridor pay).
    world.npcs = [];
    world.npcFlights = [];
    tickEconomyN(world, 48);
    let onCorridor = 0;
    let offCorridor = 0;
    for (const lot of world.lots) {
      if (lot.status === 'expired' || lot.status === 'delivered') continue;
      if (corridorWeight(lot.originIcao, lot.destIcao) > 1) {
        onCorridor += 1;
      } else {
        offCorridor += 1;
      }
    }
    assert.ok(onCorridor + offCorridor > 0, 'expected formed lots');
    assert.ok(
      onCorridor > offCorridor,
      `expected corridor-heavy formation (on=${onCorridor}, off=${offCorridor})`,
    );
    assert.ok(
      world.lots.some(
        (lot) =>
          lot.status !== 'expired' &&
          lot.status !== 'delivered' &&
          corridorWeight(lot.originIcao, lot.destIcao) >= 2,
      ),
      'expected at least one strong-corridor lot (e.g. GRU↔Manaus class)',
    );
  });
});

describe('demand shocks', () => {
  it('raises lane freight pay and urgency under festival demand at dest', () => {
    const world = createSeedEconomyWorld({ seed: 'shock-fest' });
    const event: EconomyEvent = {
      id: 'evt_fest',
      kind: 'festival_demand',
      region: 'BR-SE',
      commodityId: 'general',
      startsAtTick: 0,
      endsAtTick: 48,
      label: 'Festival demand for general in BR-SE',
    };
    world.events = [event];
    const shock = laneDemandShock(world, {
      originRegion: 'BR-S',
      destRegion: 'BR-SE',
      commodityId: 'general',
    });
    assert.ok(shock.payMult > 1.1);
    assert.equal(shock.forceUrgent, true);
    assert.ok(shock.labels.includes('Festival'));
  });

  it('spawns regional events over time and surfaces them on market lots', () => {
    const world = createSeedEconomyWorld({ seed: 'shock-spawn' });
    world.npcs = [];
    world.npcFlights = [];
    world.lastBatchAtMs = 1;
    tickEconomyN(world, 120, { fromBatchAtMs: 1 });
    const active = listActiveEconomyEvents(world);
    assert.ok(active.length >= 1, 'expected at least one active demand shock');
    // Inject a known dest shock so a formed lot can show the chip path.
    const destRegion = world.airports.find((a) => a.icao === 'SBGL')?.region ?? 'BR-SE';
    world.events.push({
      id: 'evt_force',
      kind: 'labor_strike',
      region: destRegion,
      commodityId: 'general',
      startsAtTick: world.tick,
      endsAtTick: world.tick + 24,
      label: `Labor strike in ${destRegion}`,
    });
    const origin = world.airports.find((a) => a.icao === 'SBGR')!;
    const dest = world.airports.find((a) => a.icao === 'SBGL')!;
    world.lots.push({
      id: 'lot_shock',
      commodityId: 'general',
      originIcao: origin.icao,
      destIcao: dest.icao,
      quantityKg: 4_000,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 18,
      payUsd: 2_000,
      basePayUsd: 2_000,
      urgency: 'normal',
      reason: 'test',
      status: 'available',
    });
    const row = listMarketLots(world).find((r) => r.lot.id === 'lot_shock');
    assert.ok(row?.pressure?.demandShock);
    assert.ok((row?.pressure?.shockPayMult ?? 1) > 1);
    assert.ok(row?.pressure?.shockLabels?.includes('Strike'));
  });
});

describe('idle lot escalation', () => {
  function makeIdleLot(overrides: Partial<ShipmentLot> = {}): ShipmentLot {
    return {
      id: 'lot_idle',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 5_000,
      reservedKg: 0,
      createdAtTick: 0,
      expiresAtTick: 20,
      payUsd: 1_000,
      basePayUsd: 1_000,
      urgency: 'normal',
      reason: 'test idle lot',
      status: 'available',
      ...overrides,
    };
  }

  it('holds formation pay for the first quarter of lot life', () => {
    const lot = makeIdleLot();
    assert.equal(idleLotPayMult(lot, 0), 1);
    assert.equal(idleLotPayMult(lot, 5), 1);
  });

  it('ramps pay toward the max multiplier by expiry', () => {
    const lot = makeIdleLot();
    assert.ok(idleLotPayMult(lot, 12) > 1);
    assert.equal(idleLotPayMult(lot, 20), IDLE_LOT_PAY_MAX_MULT);
    const world = createSeedEconomyWorld({ seed: 'idle-ramp' });
    world.npcs = [];
    world.npcFlights = [];
    world.lots = [makeIdleLot()];
    world.tick = 20;
    escalateIdleLots(world);
    assert.equal(world.lots[0]!.payUsd, Math.round(1_000 * IDLE_LOT_PAY_MAX_MULT));
    assert.equal(world.lots[0]!.urgency, 'urgent');
  });

  it('stamps basePayUsd on legacy lots and escalates from it on ticks', () => {
    const world = createSeedEconomyWorld({ seed: 'idle-legacy' });
    world.npcs = [];
    world.npcFlights = [];
    world.lots = [makeIdleLot({ basePayUsd: undefined, payUsd: 800 })];
    world.tick = 0;
    world.lastBatchAtMs = 1;
    tickEconomyN(world, 12, { fromBatchAtMs: 1 });
    const lot = world.lots.find((l) => l.id === 'lot_idle');
    assert.ok(lot);
    assert.equal(lot.basePayUsd, 800);
    assert.ok(lot.payUsd > 800, `expected escalated pay, got ${lot.payUsd}`);
    const row = listMarketLots(world).find((r) => r.lot.id === 'lot_idle');
    assert.ok(row?.pressure?.idleEscalated);
    assert.ok((row?.pressure?.idlePayMult ?? 1) > 1);
  });
});

describe('tickEconomyN market formation', () => {
  it('forms shipment lots with surplus→shortage reasons after ticks', () => {
    const world = createSeedEconomyWorld({ seed: 'test-lanes' });
    tickEconomyN(world, 24);
    const market = listMarketLots(world);
    assert.ok(market.length > 0, 'expected market lots after ticks');

    for (const row of market.slice(0, 5)) {
      assert.ok(row.lot.originIcao !== row.lot.destIcao);
      assert.ok(row.availableKg > 0);
      assert.ok(row.lot.payUsd > 0);
      assert.match(row.lot.reason, /surplus|shortage/i);
      assert.ok(
        row.originFillPct + 0.05 >= row.destFillPct,
        `${row.lot.reason} originFill=${row.originFillPct} destFill=${row.destFillPct}`,
      );
    }
  });

  it('concentrates market activity on major hubs over spokes', () => {
    const world = createSeedEconomyWorld({ seed: 'tier-market' });
    tickEconomyN(world, 48);
    const mentions: Record<string, number> = {};
    for (const row of listMarketLots(world)) {
      mentions[row.lot.originIcao] = (mentions[row.lot.originIcao] ?? 0) + 1;
      mentions[row.lot.destIcao] = (mentions[row.lot.destIcao] ?? 0) + 1;
    }
    const majorAvg =
      ['SBGR', 'SBKP', 'SBGL']
        .map((icao) => mentions[icao] ?? 0)
        .reduce((a, b) => a + b, 0) / 3;
    const spokeAvg =
      ['SBPS', 'SBAR', 'SBJP', 'SBMO']
        .map((icao) => mentions[icao] ?? 0)
        .reduce((a, b) => a + b, 0) / 4;
    assert.ok(
      majorAvg > spokeAvg * 1.4,
      `majors should dominate board (majorAvg=${majorAvg}, spokeAvg=${spokeAvg})`,
    );
  });

  it('keeps lots stable across identical seeds', () => {
    const a = createSeedEconomyWorld({ seed: 'same' });
    const b = createSeedEconomyWorld({ seed: 'same' });
    a.lastBatchAtMs = 1;
    b.lastBatchAtMs = 1;
    tickEconomyN(a, 10, { fromBatchAtMs: 1 });
    tickEconomyN(b, 10, { fromBatchAtMs: 1 });
    assert.equal(a.lots.length, b.lots.length);
    assert.deepEqual(
      a.lots.map((l) => [l.commodityId, l.originIcao, l.destIcao, l.quantityKg]),
      b.lots.map((l) => [l.commodityId, l.originIcao, l.destIcao, l.quantityKg]),
    );
  });
  it('spawns small LTL lots (400–2000 kg) alongside larger freight', () => {
    const world = createSeedEconomyWorld({ seed: 'ltl-lots' });
    tickEconomyN(world, 48);
    const market = listMarketLots(world);
    assert.ok(market.length > 0);
    const small = market.filter(
      (row) =>
        row.lot.quantityKg >= 400 &&
        row.lot.quantityKg <= 2_000 &&
        /LTL/i.test(row.lot.reason),
    );
    const large = market.filter((row) => row.lot.quantityKg >= 4_000);
    assert.ok(small.length > 0, 'expected LTL lots for light turboprop fills');
    assert.ok(large.length > 0, 'expected large lots to remain');
    for (const row of small) {
      assert.ok(row.lot.quantityKg <= 2_000);
      assert.ok(row.lot.quantityKg >= 400);
    }
  });

  it('pays more on origin-region lots when home NPC fleet is resting', () => {
    const region = 'BR-SE';

    function warmAndFreeze(resting: boolean) {
      const world = createSeedEconomyWorld({ seed: 'capacity-pay-boost' });
      world.lastBatchAtMs = 1;
      tickEconomyN(world, 36, { fromBatchAtMs: 1 });
      const nowMs = world.lastBatchAtMs;
      world.npcFlights = [];
      for (const npc of world.npcs) {
        npc.currentFlightId = undefined;
        npc.busyUntilMs = undefined;
        if (npc.homeRegion === region) {
          if (resting) {
            npc.status = 'resting';
            npc.restUntilMs = nowMs + 48 * MS_PER_TICK;
            npc.dutyHoursAccum = 10;
          } else {
            npc.status = 'idle';
            npc.restUntilMs = undefined;
            npc.dutyHoursAccum = 0;
          }
        } else {
          npc.status = 'idle';
          npc.restUntilMs = undefined;
        }
      }
      // Free lane caps so the probe tick can form comparable SE-origin lots.
      world.lots = world.lots.filter((l) => l.status !== 'available');
      const beforeTick = world.tick;
      tickEconomyN(world, 1, { fromBatchAtMs: nowMs });
      const originIcaos = new Set(
        world.airports.filter((a) => a.region === region).map((a) => a.icao),
      );
      const fresh = world.lots.filter(
        (l) =>
          l.createdAtTick > beforeTick &&
          originIcaos.has(l.originIcao) &&
          l.quantityKg > 0,
      );
      const payPerKg =
        fresh.length === 0
          ? 0
          : fresh.reduce((s, l) => s + l.payUsd / l.quantityKg, 0) / fresh.length;
      return { fresh, payPerKg, capacity: npcRegionBidCapacity(world, region, world.lastBatchAtMs) };
    }

    const idle = warmAndFreeze(false);
    const rest = warmAndFreeze(true);
    assert.ok(idle.fresh.length > 0, 'expected new SE-origin lots with idle fleet');
    assert.ok(rest.fresh.length > 0, 'expected new SE-origin lots with resting fleet');
    assert.ok(idle.capacity > rest.capacity);
    assert.ok(
      rest.payPerKg > idle.payPerKg,
      `resting pay/kg ${rest.payPerKg} should exceed idle ${idle.payPerKg}`,
    );
  });

  it('softens urgency when NPC inbound covers dest shortage', () => {
    function prepare(withInbound: boolean): CareerEconomyWorld {
      const world = createSeedEconomyWorld({ seed: 'lane-urgency-shadow' });
      world.lastBatchAtMs = 1_000_000;
      world.lots = [];
      world.npcFlights = [];
      world.events = [];
      for (const npc of world.npcs) {
        npc.status = 'idle';
        npc.aggressiveness = 0;
        npc.currentFlightId = undefined;
        npc.busyUntilMs = undefined;
        npc.restUntilMs = undefined;
      }
      for (const ap of world.airports) {
        for (const id of ['electronics', 'machinery', 'general', 'perishables'] as CommodityId[]) {
          const pile = ap.inventory[id]!;
          pile.stockKg = pile.capacityKg * 0.5;
        }
      }
      const origin = world.airports.find((a) => a.icao === 'SBGR')!;
      const dest = world.airports.find((a) => a.icao === 'SBGL')!;
      origin.inventory.electronics!.stockKg =
        origin.inventory.electronics!.capacityKg * 0.75;
      dest.inventory.electronics!.stockKg =
        dest.inventory.electronics!.capacityKg * 0.25;
      if (withInbound) {
        const flight: NpcFlight = {
          id: 'npcf-inbound-cover',
          npcId: world.npcs[0]!.id,
          lotId: 'lot_inbound',
          originIcao: 'SBPA',
          destIcao: 'SBGL',
          commodityId: 'electronics',
          cargoKg: 25_000,
          payUsd: 1,
          aircraftClassId: 'wide_freighter',
          departedAtTick: world.tick,
          arrivesAtTick: world.tick + 3,
          departedAtMs: world.lastBatchAtMs,
          arrivesAtMs: world.lastBatchAtMs + 3 * MS_PER_TICK,
          status: 'in_flight',
        };
        world.npcFlights.push(flight);
      }
      return world;
    }

    const bare = prepare(false);
    const covered = prepare(true);
    const t0 = bare.tick;
    tickEconomyN(bare, 1, { fromBatchAtMs: bare.lastBatchAtMs });
    tickEconomyN(covered, 1, { fromBatchAtMs: covered.lastBatchAtMs });

    const bareLots = bare.lots.filter(
      (l) =>
        l.createdAtTick > t0 &&
        l.destIcao === 'SBGL' &&
        l.commodityId === 'electronics',
    );
    const coveredLots = covered.lots.filter(
      (l) =>
        l.createdAtTick > t0 &&
        l.destIcao === 'SBGL' &&
        l.commodityId === 'electronics',
    );
    assert.ok(bareLots.length > 0, 'expected electronics lots into SBGL');
    assert.ok(
      bareLots.some((l) => l.urgency === 'urgent'),
      'low fill + no inbound should mark urgent',
    );
    assert.ok(coveredLots.length > 0, 'expected lots even with inbound cover');
    assert.ok(
      coveredLots.every((l) => l.urgency === 'normal'),
      'inbound cover should clear urgent on non-perishable lots',
    );
  });

  it('softens urgency when player inbound covers dest shortage', () => {
    function prepare(withPlayerInbound: boolean): CareerEconomyWorld {
      const world = createSeedEconomyWorld({ seed: 'player-inbound-shadow' });
      world.lastBatchAtMs = 1_000_000;
      world.lots = [];
      world.npcFlights = [];
      world.inboundPending = [];
      world.events = [];
      for (const npc of world.npcs) {
        npc.status = 'idle';
        npc.aggressiveness = 0;
        npc.currentFlightId = undefined;
        npc.busyUntilMs = undefined;
        npc.restUntilMs = undefined;
      }
      for (const ap of world.airports) {
        for (const id of ['electronics', 'machinery', 'general', 'perishables'] as CommodityId[]) {
          const pile = ap.inventory[id]!;
          pile.stockKg = pile.capacityKg * 0.5;
        }
      }
      const origin = world.airports.find((a) => a.icao === 'SBGR')!;
      const dest = world.airports.find((a) => a.icao === 'SBGL')!;
      origin.inventory.electronics!.stockKg =
        origin.inventory.electronics!.capacityKg * 0.75;
      dest.inventory.electronics!.stockKg =
        dest.inventory.electronics!.capacityKg * 0.25;
      if (withPlayerInbound) {
        world.inboundPending = [
          {
            id: 'msn_player:lot_x',
            missionId: 'msn_player',
            originIcao: 'SBPA',
            destIcao: 'SBGL',
            commodityId: 'electronics',
            cargoKg: 25_000,
            expiresAtTick: world.tick + 12,
            source: 'player',
          },
        ];
      }
      return world;
    }

    const bare = prepare(false);
    const covered = prepare(true);
    const t0 = bare.tick;
    tickEconomyN(bare, 1, { fromBatchAtMs: bare.lastBatchAtMs });
    tickEconomyN(covered, 1, { fromBatchAtMs: covered.lastBatchAtMs });

    const bareLots = bare.lots.filter(
      (l) =>
        l.createdAtTick > t0 &&
        l.destIcao === 'SBGL' &&
        l.commodityId === 'electronics',
    );
    const coveredLots = covered.lots.filter(
      (l) =>
        l.createdAtTick > t0 &&
        l.destIcao === 'SBGL' &&
        l.commodityId === 'electronics',
    );
    assert.ok(bareLots.some((l) => l.urgency === 'urgent'));
    assert.ok(coveredLots.length > 0);
    assert.ok(
      coveredLots.every((l) => l.urgency === 'normal'),
      'player inbound should clear urgent like NPC airborne',
    );
  });

  it('blocks new lots on a fully saturated OD lane and pays more when partially saturated', () => {
    function prepare(airborneKg: number): CareerEconomyWorld {
      const world = createSeedEconomyWorld({ seed: 'lane-sat-form' });
      world.lastBatchAtMs = 2_000_000;
      world.lots = [];
      world.npcFlights = [];
      world.events = [];
      for (const npc of world.npcs) {
        npc.status = 'idle';
        npc.aggressiveness = 0;
        npc.currentFlightId = undefined;
      }
      for (const ap of world.airports) {
        for (const id of ['electronics', 'machinery', 'general', 'perishables'] as CommodityId[]) {
          const pile = ap.inventory[id]!;
          pile.stockKg = pile.capacityKg * 0.5;
        }
      }
      const origin = world.airports.find((a) => a.icao === 'SBGR')!;
      const dest = world.airports.find((a) => a.icao === 'SBGL')!;
      origin.inventory.general!.stockKg = origin.inventory.general!.capacityKg * 0.8;
      dest.inventory.general!.stockKg = dest.inventory.general!.capacityKg * 0.3;
      if (airborneKg > 0) {
        world.npcFlights.push({
          id: 'npcf-sat',
          npcId: world.npcs[0]!.id,
          lotId: 'lot_sat',
          originIcao: 'SBGR',
          destIcao: 'SBGL',
          commodityId: 'general',
          cargoKg: airborneKg,
          payUsd: 1,
          aircraftClassId: 'wide_freighter',
          departedAtTick: world.tick,
          arrivesAtTick: world.tick + 2,
          departedAtMs: world.lastBatchAtMs,
          arrivesAtMs: world.lastBatchAtMs + 2 * MS_PER_TICK,
          status: 'in_flight',
        });
      }
      return world;
    }

    const clear = prepare(0);
    const full = prepare(28_000);
    const partial = prepare(14_000);
    assert.equal(npcLaneSaturation(full, 'SBGR', 'SBGL', 'general'), 1);
    assert.ok(npcLaneSaturation(partial, 'SBGR', 'SBGL', 'general') >= 0.35);

    const t0 = clear.tick;
    tickEconomyN(clear, 1, { fromBatchAtMs: clear.lastBatchAtMs });
    tickEconomyN(full, 1, { fromBatchAtMs: full.lastBatchAtMs });
    tickEconomyN(partial, 1, { fromBatchAtMs: partial.lastBatchAtMs });

    const lane = (w: CareerEconomyWorld) =>
      w.lots.filter(
        (l) =>
          l.createdAtTick > t0 &&
          l.originIcao === 'SBGR' &&
          l.destIcao === 'SBGL' &&
          l.commodityId === 'general',
      );

    assert.ok(lane(clear).length > 0, 'unsaturated lane should form lots');
    assert.equal(lane(full).length, 0, 'fully saturated lane should skip formation');
    assert.ok(lane(partial).length > 0, 'partial saturation may still form');

    const pay = (lots: ReturnType<typeof lane>) =>
      lots.reduce((s, l) => s + l.payUsd / l.quantityKg, 0) / lots.length;
    assert.ok(
      pay(lane(partial)) > pay(lane(clear)),
      'partial saturation should raise pay/kg vs clear lane',
    );
  });
});

describe('migrateEconomyWorld / ensureEconomyCaughtUp', () => {
  it('adds missing BR-N / BR-CO hubs to a truncated legacy airport list', () => {
    const full = createSeedEconomyWorld({ seed: 'hub-coverage' });
    const truncated = {
      version: 3 as const,
      seed: 'hub-coverage',
      tick: 5,
      lastBatchAtMs: full.lastBatchAtMs,
      airports: full.airports.filter(
        (a) => a.region === 'BR-SE' || a.region === 'BR-S' || a.region === 'BR-NE',
      ),
      lots: [],
      events: [],
      npcs: full.npcs,
      npcFlights: [],
    };
    assert.equal(truncated.airports.length, 20);
    const migrated = migrateEconomyWorld(truncated);
    assert.equal(migrated.airports.length, 28);
    assert.ok(migrated.airports.some((a) => a.icao === 'SBEG'));
    assert.ok(migrated.airports.some((a) => a.icao === 'SBBR'));
    const again = createSeedEconomyWorld({ seed: 'hub-coverage-idem' });
    assert.equal(ensureCareerHubCoverage(again), false);
  });

  it('migrates v1 without retroactive catch-up', () => {
    const v1 = {
      version: 1 as const,
      seed: 'legacy',
      tick: 12,
      airports: createSeedEconomyWorld({ seed: 'legacy' }).airports,
      lots: [],
    };
    const now = 1_700_000_000_000;
    const migrated = migrateEconomyWorld(v1, { nowMs: now });
    assert.equal(migrated.version, 3);
    assert.equal(migrated.tick, 12);
    assert.equal(migrated.lastBatchAtMs, now);
    assert.ok(migrated.airports[0]?.baseProduction);
  });

  it('migrates v2 tick timestamps to wall-clock ms', () => {
    const seeded = createSeedEconomyWorld({ seed: 'v2-ms' });
    const anchor = 1_700_000_000_000;
    const raw = {
      version: 2 as const,
      seed: 'v2-ms',
      tick: 100,
      lastSyncedAtMs: anchor,
      airports: seeded.airports,
      lots: [],
      events: [],
      npcs: seeded.npcs,
      npcFlights: [
        {
          id: 'f1',
          npcId: seeded.npcs[0]!.id,
          lotId: 'lot1',
          originIcao: 'SBGR',
          destIcao: 'SBGL',
          commodityId: 'general' as const,
          cargoKg: 5_000,
          payUsd: 1000,
          aircraftClassId: 'narrow_freighter' as const,
          departedAtTick: 98,
          arrivesAtTick: 102,
          status: 'in_flight' as const,
        },
      ],
    };
    const migrated = migrateEconomyWorld(raw, { nowMs: anchor });
    assert.equal(migrated.version, 3);
    assert.equal(migrated.lastBatchAtMs, anchor);
    const flight = migrated.npcFlights[0]!;
    assert.equal(flight.departedAtMs, anchor - 2 * MS_PER_TICK);
    assert.equal(flight.arrivesAtMs, anchor + 2 * MS_PER_TICK);
  });

  it('catches up whole hours 1:1 and preserves partial hour', () => {
    const world = createSeedEconomyWorld({ seed: 'catch-up' });
    const start = 1_700_000_000_000;
    world.lastBatchAtMs = start;
    world.tick = 0;
    const threeHoursPlus = start + 3 * MS_PER_TICK + 1_800_000; // +3h 30m
    const { advancedTicks } = ensureEconomyCaughtUp(world, threeHoursPlus);
    assert.equal(advancedTicks, 3);
    assert.equal(world.tick, 3);
    assert.equal(world.lastBatchAtMs, threeHoursPlus - 1_800_000);
  });

  it('returns 0 when less than one hour elapsed', () => {
    const world = createSeedEconomyWorld({ seed: 'partial' });
    const start = 1_700_000_000_000;
    world.lastBatchAtMs = start;
    const before = world.tick;
    const { advancedTicks } = ensureEconomyCaughtUp(world, start + 59 * 60 * 1000);
    assert.equal(advancedTicks, 0);
    assert.equal(world.tick, before);
  });

  it('exposes continuous fractional hours between batches', () => {
    const world = createSeedEconomyWorld({ seed: 'frac' });
    const start = 1_700_000_000_000;
    world.lastBatchAtMs = start;
    world.tick = 10;
    const half = continuousEconomyHours(world, start + MS_PER_TICK / 2);
    assert.ok(Math.abs(half - 10.5) < 1e-9);
  });
});

describe('pruneDeadLots', () => {
  it('keeps live lots and drops expired/delivered outside the retention window', () => {
    const world = createSeedEconomyWorld({ seed: 'prune-lots' });
    world.tick = 100;
    world.lots = [
      {
        id: 'live',
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        quantityKg: 1_000,
        reservedKg: 0,
        createdAtTick: 90,
        expiresAtTick: 120,
        payUsd: 100,
        urgency: 'normal',
        reason: 'live',
        status: 'available',
      },
      {
        id: 'transit',
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBPA',
        quantityKg: 500,
        reservedKg: 500,
        createdAtTick: 10,
        expiresAtTick: 20,
        payUsd: 50,
        urgency: 'normal',
        reason: 'transit',
        status: 'in_transit',
      },
      {
        id: 'recent-expired',
        commodityId: 'electronics',
        originIcao: 'SBGL',
        destIcao: 'SBRJ',
        quantityKg: 200,
        reservedKg: 0,
        createdAtTick: 90,
        expiresAtTick: world.tick - 2,
        payUsd: 10,
        urgency: 'normal',
        reason: 'recent',
        status: 'expired',
      },
      {
        id: 'old-expired',
        commodityId: 'electronics',
        originIcao: 'SBGL',
        destIcao: 'SBRJ',
        quantityKg: 200,
        reservedKg: 0,
        createdAtTick: 1,
        expiresAtTick: world.tick - (DEAD_LOT_RETENTION_TICKS + 5),
        payUsd: 10,
        urgency: 'normal',
        reason: 'old',
        status: 'expired',
      },
      {
        id: 'old-delivered',
        commodityId: 'machinery',
        originIcao: 'SBPA',
        destIcao: 'SBGR',
        quantityKg: 800,
        reservedKg: 0,
        createdAtTick: 1,
        expiresAtTick: world.tick - (DEAD_LOT_RETENTION_TICKS + 1),
        payUsd: 20,
        urgency: 'urgent',
        reason: 'delivered',
        status: 'delivered',
      },
    ];

    const { removed, kept } = pruneDeadLots(world);
    assert.equal(removed, 2);
    assert.equal(kept, 3);
    assert.deepEqual(
      world.lots.map((l) => l.id).sort(),
      ['live', 'recent-expired', 'transit'],
    );
  });

  it('prunes bloated saves on migrate', () => {
    const seeded = createSeedEconomyWorld({ seed: 'prune-migrate' });
    seeded.tick = 200;
    const junk = Array.from({ length: 50 }, (_, i) => ({
      id: `junk_${i}`,
      commodityId: 'general' as const,
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 100,
      reservedKg: 0,
      createdAtTick: 1,
      expiresAtTick: 10,
      payUsd: 1,
      urgency: 'normal' as const,
      reason: 'junk',
      status: 'expired' as const,
    }));
    const raw = {
      version: 3 as const,
      seed: seeded.seed,
      tick: seeded.tick,
      lastBatchAtMs: seeded.lastBatchAtMs,
      airports: seeded.airports,
      lots: junk,
      events: [],
      npcs: seeded.npcs,
      npcFlights: [],
    };
    const migrated = migrateEconomyWorld(raw);
    assert.equal(migrated.lots.length, 0);
  });
});
