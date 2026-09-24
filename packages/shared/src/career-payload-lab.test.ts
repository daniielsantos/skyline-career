import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2 } from './career-fleet.js';
import { charterBaggageKg } from './career-charter.js';
import {
  cancelMission,
  findPayloadLabMission,
  resolvePayloadLabCharterMaxPax,
  settleMission,
  startPayloadLabMission,
} from './career-mission.js';
import { findCareerPlayerAirframe } from './career-player-airframes.js';

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

  it('stamps pilot account for VA merge survival', () => {
    const world = createSeedEconomyWorld({ seed: 'lab3' });
    world.tick = 30;
    const state = emptyMissionsStateV2();
    const { mission } = startPayloadLabMission(world, state, {
      airframeTypeId: 'asobo-c172sp-cargo',
      cargoKg: 100,
      originIcao: 'SBSP',
      destIcao: 'SBRJ',
      pilotAccountId: 'acc_lab',
      pilotHomeCompanyId: 'co_home',
    });
    assert.equal(mission.pilotAccountId, 'acc_lab');
    assert.equal(mission.pilotHomeCompanyId, 'co_home');
    assert.equal(mission.vaFlight, undefined);
    assert.equal((world.inboundPending ?? []).length, 0);
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

  it('starts charter lab with pax + bags and cancels without a world offer', () => {
    const world = createSeedEconomyWorld({ seed: 'lab4' });
    world.tick = 40;
    const state = emptyMissionsStateV2();
    const falcon = findCareerPlayerAirframe('contrail-contrail-falcon-50');
    assert.ok(falcon);
    const maxPax = resolvePayloadLabCharterMaxPax(falcon!);
    assert.ok(maxPax >= 1);
    const pax = Math.min(4, maxPax);
    const { mission } = startPayloadLabMission(world, state, {
      airframeTypeId: 'contrail-contrail-falcon-50',
      missionKind: 'charter',
      pax,
      originIcao: 'SBGR',
      destIcao: 'SBSP',
    });
    assert.equal(mission.payloadLab, true);
    assert.equal(mission.missionType, 'charter');
    assert.equal(mission.pax, pax);
    assert.equal(mission.cargoKg, 0);
    assert.equal(mission.baggageKg, charterBaggageKg(pax));
    assert.equal(mission.charterOfferId, undefined);
    assert.equal((world.charterOffers ?? []).length, 0);
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
    assert.equal(cancelled.missionType, 'charter');
  });

  it('rejects charter lab when pax exceeds seats', () => {
    const world = createSeedEconomyWorld({ seed: 'lab5' });
    world.tick = 50;
    const state = emptyMissionsStateV2();
    const falcon = findCareerPlayerAirframe('contrail-contrail-falcon-50');
    assert.ok(falcon);
    const maxPax = resolvePayloadLabCharterMaxPax(falcon!);
    assert.throws(
      () =>
        startPayloadLabMission(world, state, {
          airframeTypeId: 'contrail-contrail-falcon-50',
          missionKind: 'charter',
          pax: maxPax + 1,
          originIcao: 'SBGR',
          destIcao: 'SBSP',
        }),
      /exceeds/i,
    );
  });
});
