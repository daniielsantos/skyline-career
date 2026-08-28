import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import {
  cancelMission,
  findPayloadLabMission,
  settleMission,
  startPayloadLabMission,
} from './career-mission.js';

describe('payload lab mission', () => {
  it('starts a hangar-free lab flight and replaces a prior lab', () => {
    const world = createSeedEconomyWorld({ seed: 'lab1' });
    world.tick = 10;
    const state = emptyMissionsStateV2();
    const first = startPayloadLabMission(world, state, {
      airframeTypeId: 'asobo-c172sp-cargo',
      cargoKg: 200,
      originIcao: 'SBSP',
      destIcao: 'SBRJ',
    });
    assert.equal(first.mission.payloadLab, true);
    assert.equal(first.mission.contractPilot, true);
    assert.equal(first.mission.cargoKg, 200);
    assert.ok(!first.mission.aircraftId);

    const second = startPayloadLabMission(world, state, {
      airframeTypeId: 'blacksquare-bonanza-professional',
      cargoKg: 300,
      originIcao: 'SBSP',
      destIcao: 'SBGR',
    });
    assert.deepEqual(second.replacedLabIds, [first.mission.id]);
    assert.equal(findPayloadLabMission(state.missions)?.id, second.mission.id);
  });

  it('refuses settle and allows cancel', () => {
    const world = createSeedEconomyWorld({ seed: 'lab2' });
    world.tick = 20;
    const state = emptyMissionsStateV2();
    const { mission } = startPayloadLabMission(world, state, {
      airframeTypeId: 'asobo-c172sp-cargo',
      cargoKg: 150,
      originIcao: 'SBSP',
      destIcao: 'SBRJ',
    });
    assert.throws(
      () =>
        settleMission(
          world,
          { ...mission, status: 'dispatched' },
          { fleet: state },
        ),
      /cannot settle/i,
    );
    const cancelled = cancelMission(world, mission, { fleet: state });
    assert.equal(cancelled.status, 'cancelled');
  });
});
