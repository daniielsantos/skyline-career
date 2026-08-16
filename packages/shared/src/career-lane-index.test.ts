import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  tickEconomyN,
} from './career-economy.js';
import {
  buildLaneInboundIndex,
  laneInboundKg,
  laneInboundKgFromIndex,
  npcLaneAirborneKg,
  playerLaneInboundKg,
} from './career-npc.js';

describe('lane inbound index', () => {
  it('matches linear NPC+player inbound after a warm day', () => {
    const world = createSeedEconomyWorld({ seed: 'lane-index-eq' });
    tickEconomyN(world, 24, { advanceWallClock: false });

    const index = buildLaneInboundIndex(world);
    const seen = new Set<string>();
    for (const flight of world.npcFlights ?? []) {
      if (flight.status !== 'in_flight') continue;
      const key = `${flight.originIcao}|${flight.destIcao}|${flight.commodityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fromIndex = laneInboundKgFromIndex(
        index,
        flight.originIcao,
        flight.destIcao,
        flight.commodityId,
      );
      const linear =
        npcLaneAirborneKg(
          world,
          flight.originIcao,
          flight.destIcao,
          flight.commodityId,
        ) +
        playerLaneInboundKg(
          world,
          flight.originIcao,
          flight.destIcao,
          flight.commodityId,
        );
      assert.equal(fromIndex, linear, key);
      assert.equal(
        laneInboundKg(world, flight.originIcao, flight.destIcao, flight.commodityId),
        linear,
        `cached ${key}`,
      );
    }
    assert.ok(seen.size > 0, 'expected some in-flight NPC legs after 24 ticks');
  });
});
