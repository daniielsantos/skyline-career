import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptMission,
  createSeedEconomyWorld,
  listMarketLots,
  reserveShipmentLot,
  tickEconomyN,
} from '@msfs-compat/shared';
import { createPromiseLock } from './career-write-lock.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('createPromiseLock', () => {
  it('serializes concurrent writers so reservedKg cannot oversubscribe', async () => {
    const lock = createPromiseLock();
    const state = { quantityKg: 10_000, reservedKg: 0 };

    const book = async (kg: number) => {
      await lock.withLock(async () => {
        await delay(15);
        const avail = state.quantityKg - state.reservedKg;
        state.reservedKg += Math.min(kg, avail);
      });
    };

    await Promise.all([book(8_000), book(8_000)]);
    assert.equal(state.reservedKg, 10_000);
  });

  it('keeps player accept + NPC-style reserve consistent on one lot', async () => {
    const lock = createPromiseLock();
    const world = createSeedEconomyWorld({ seed: 'career-write-lock' });
    tickEconomyN(world, 48);
    const market = listMarketLots(world);
    assert.ok(market.length > 0);
    const lot = market[0]!.lot;
    const lotId = lot.id;
    const qty = lot.quantityKg;

    const player = lock.withLock(async () => {
      await delay(10);
      try {
        acceptMission(world, {
          lotId,
          cargoKg: Math.min(6_000, qty),
          aircraftClassId: 'narrow_freighter',
          missionId: 'msn_lock_player',
        });
      } catch {
        // Lot may already be fully reserved by the concurrent writer.
      }
    });

    const npc = lock.withLock(async () => {
      await delay(10);
      const live = world.lots.find((l) => l.id === lotId);
      assert.ok(live);
      const avail = Math.max(0, live.quantityKg - live.reservedKg);
      if (avail <= 0) return;
      try {
        reserveShipmentLot(world, lotId, Math.min(8_000, avail));
      } catch {
        // Contended after player accepted.
      }
    });

    await Promise.all([player, npc]);

    const live = world.lots.find((l) => l.id === lotId)!;
    assert.ok(live.reservedKg <= live.quantityKg);
    assert.ok(live.reservedKg > 0);
  });

  it('without a lock, interleaved awaits can oversubscribe (documents the race)', async () => {
    const state = { quantityKg: 10_000, reservedKg: 0 };

    const bookUnlocked = async (kg: number) => {
      const avail = state.quantityKg - state.reservedKg;
      await delay(15);
      state.reservedKg += Math.min(kg, avail);
    };

    await Promise.all([bookUnlocked(8_000), bookUnlocked(8_000)]);
    assert.equal(state.reservedKg, 16_000);
  });
});
