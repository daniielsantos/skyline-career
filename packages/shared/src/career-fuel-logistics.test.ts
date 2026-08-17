import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  FUEL_HUB_ICAOS,
  FUEL_TRUCK_CAPACITY_KG,
  FUEL_TRUCK_FLEET_SIZE,
  getFuelTruckCapacityKg,
  listAirportFuelInbound,
  migrateEconomyWorld,
  MS_PER_TICK,
  settleFuelHaulsDue,
  tickEconomyN,
  tickFuelLogistics,
} from './career-economy.js';

describe('fuel truck logistics', () => {
  it('seeds tanker fleet with realistic class caps (≤ 32 t)', () => {
    const world = createSeedEconomyWorld({ seed: 'fuel-trucks-seed' });
    assert.equal(world.fuelTrucks?.length, FUEL_TRUCK_FLEET_SIZE);
    assert.equal(world.fuelHauls?.length, 0);
    assert.equal(getFuelTruckCapacityKg('rigid_tanker'), 12_000);
    assert.equal(getFuelTruckCapacityKg('semi_tanker'), 24_000);
    assert.equal(getFuelTruckCapacityKg('btrain_tanker'), 32_000);
    assert.ok(
      Object.values(FUEL_TRUCK_CAPACITY_KG).every((kg) => kg <= 32_000),
    );
    assert.equal(
      world.fuelTrucks!.filter((t) => t.truckClassId === 'rigid_tanker').length,
      195,
    );
    assert.equal(
      world.fuelTrucks!.filter((t) => t.truckClassId === 'semi_tanker').length,
      315,
    );
    assert.equal(
      world.fuelTrucks!.filter((t) => t.truckClassId === 'btrain_tanker').length,
      210,
    );
  });

  it('migrates legacy saves without fuelTrucks', () => {
    const seeded = createSeedEconomyWorld({ seed: 'fuel-trucks-migrate' });
    const raw = {
      version: 3 as const,
      seed: 'fuel-trucks-migrate',
      tick: 10,
      lastSyncedAtMs: Date.now(),
      airports: seeded.airports,
      lots: [],
      events: [],
      npcs: seeded.npcs,
      npcFlights: [],
    };
    const migrated = migrateEconomyWorld(raw);
    assert.equal(migrated.fuelTrucks?.length, FUEL_TRUCK_FLEET_SIZE);
    assert.ok(Array.isArray(migrated.fuelHauls));
  });

  it('dispatches hub→spoke haul, respects caps and hub reserve, then delivers', () => {
    const world = createSeedEconomyWorld({ seed: 'fuel-trucks-haul' });
    const hub = world.airports.find((a) => a.icao === 'SBEG')!;
    const spoke = world.airports.find((a) => a.icao === 'SBPV')!;
    assert.ok(FUEL_HUB_ICAOS.has(hub.icao));
    assert.ok(!FUEL_HUB_ICAOS.has(spoke.icao));

    hub.inventory.fuel!.stockKg = hub.inventory.fuel!.capacityKg;
    spoke.inventory.fuel!.stockKg = 0;

    // Drain other non-hubs so dispatch prefers SBPV, and keep other hubs full.
    for (const ap of world.airports) {
      if (ap.icao === 'SBPV' || ap.icao === 'SBEG') continue;
      if (FUEL_HUB_ICAOS.has(ap.icao)) {
        ap.inventory.fuel!.stockKg = ap.inventory.fuel!.capacityKg;
      } else {
        ap.inventory.fuel!.stockKg = Math.round(ap.inventory.fuel!.capacityKg * 0.5);
      }
    }

    const hubBefore = hub.inventory.fuel!.stockKg;
    const hubReserve = Math.round(hub.inventory.fuel!.capacityKg * 0.25);
    const batchNowMs = world.lastBatchAtMs + MS_PER_TICK;
    world.tick += 1;
    const rng = () => 0.1;
    const { dispatched } = tickFuelLogistics(world, rng, { batchNowMs });
    assert.ok(dispatched >= 1, 'expected at least one fuel haul');

    const haul = world.fuelHauls!.find((h) => h.status === 'enroute');
    assert.ok(haul, 'expected an enroute haul');
    assert.ok(haul!.cargoKg <= 32_000);
    assert.ok(haul!.cargoKg >= 4_000);
    assert.ok(FUEL_HUB_ICAOS.has(haul!.originIcao));
    assert.ok(!FUEL_HUB_ICAOS.has(haul!.destIcao));

    const origin = world.airports.find((a) => a.icao === haul!.originIcao)!;
    assert.ok(origin.inventory.fuel!.stockKg >= hubReserve - 1);
    assert.ok(origin.inventory.fuel!.stockKg < hubBefore);

    if (haul!.destIcao === 'SBPV') {
      const inbound = listAirportFuelInbound(world, 'SBPV', batchNowMs);
      assert.ok(inbound.some((h) => h.id === haul!.id));
    }

    const destIcao = haul!.destIcao;
    const cargoKg = haul!.cargoKg;
    const spokeBefore = world.airports.find((a) => a.icao === destIcao)!
      .inventory.fuel!.stockKg;
    const destCap = world.airports.find((a) => a.icao === destIcao)!
      .inventory.fuel!.capacityKg;
    const settleAt = haul!.arrivesAtMs + 1;
    const { settledHauls } = settleFuelHaulsDue(world, settleAt);
    assert.ok(settledHauls >= 1);
    assert.equal(haul!.status, 'completed');

    const spokeAfter = world.airports.find((a) => a.icao === destIcao)!
      .inventory.fuel!.stockKg;
    assert.ok(spokeAfter > spokeBefore);
    // Delivery was sized toward ~55% fill; allow a second concurrent inbound.
    assert.ok(spokeAfter / destCap <= 0.9);
    assert.ok(cargoKg <= getFuelTruckCapacityKg(
      world.fuelTrucks!.find((t) => t.id === haul!.truckId)!.truckClassId,
    ));
  });

  it('recovers a dry spoke over time via road logistics', () => {
    const world = createSeedEconomyWorld({ seed: 'fuel-trucks-recover' });
    const spoke = world.airports.find((a) => a.icao === 'SBPV')!;
    spoke.inventory.fuel!.stockKg = 0;
    for (const ap of world.airports) {
      if (FUEL_HUB_ICAOS.has(ap.icao)) {
        ap.inventory.fuel!.stockKg = ap.inventory.fuel!.capacityKg;
      }
    }

    // ~36 wall-hours at 15-min batches
    tickEconomyN(world, 36 * 4, { advanceWallClock: true });
    const fill =
      spoke.inventory.fuel!.stockKg / spoke.inventory.fuel!.capacityKg;
    assert.ok(
      fill > 0.05,
      `expected SBPV fuel to recover above 5%, got ${(fill * 100).toFixed(1)}%`,
    );
  });
});
