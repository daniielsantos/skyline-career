import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptMission,
  assignAircraftToMission,
  cancelMission,
  createSeedEconomyWorld,
  departMission,
  emptyMissionsStateV2,
  leaveFreightAtHub,
  portYardHoldUsdPerDay,
  selectStarterHub,
  settleCompanyPassiveFeesForTickRange,
  settleFreightHoldFees,
  TICKS_PER_DAY,
  type MissionIntent,
} from './index.js';

const pilot = {
  pilotName: 'Ada Skyline',
  airframeTypeId: 'asobo-c172sp-cargo',
};

function airborneFreight(): {
  world: ReturnType<typeof createSeedEconomyWorld>;
  state: ReturnType<typeof emptyMissionsStateV2>;
  mission: MissionIntent;
} {
  const world = createSeedEconomyWorld({ seed: 'freight-hold' });
  const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', pilot);
  state.walletUsd = 100_000;
  world.lots.push({
    id: 'lot_hold_1',
    commodityId: 'general',
    originIcao: 'SBGR',
    destIcao: 'SBKP',
    quantityKg: 400,
    reservedKg: 0,
    createdAtTick: world.tick,
    expiresAtTick: world.tick + 500,
    payUsd: 900,
    urgency: 'normal',
    reason: 'test',
    status: 'available',
  });
  const accepted = acceptMission(world, {
    lotId: 'lot_hold_1',
    cargoKg: 200,
    aircraftClassId: 'light_ga',
    missionId: 'msn_hold_1',
  });
  accepted.aircraftId = state.fleet[0]!.id;
  assignAircraftToMission(state, state.fleet[0]!.id, accepted.id, 'SBGR');
  const departed = departMission(world, { ...accepted, status: 'dispatched' }, {
    fleet: state,
  });
  state.missions = [departed.mission];
  return { world, state, mission: departed.mission };
}

describe('leaveFreightAtHub', () => {
  it('refuses origin, destination, charter, and a Jet-A haul', () => {
    const { world, state, mission } = airborneFreight();
    assert.throws(
      () => leaveFreightAtHub(world, state, mission, { icao: 'SBGR' }),
      /intermediate hub/,
    );
    assert.throws(
      () => leaveFreightAtHub(world, state, mission, { icao: 'SBKP' }),
      /intermediate hub/,
    );
    assert.throws(
      () =>
        leaveFreightAtHub(
          world,
          state,
          { ...mission, missionType: 'charter', pax: 4 },
          { icao: 'SBGL' },
        ),
      /Charter/,
    );
    assert.throws(
      () =>
        leaveFreightAtHub(
          world,
          state,
          {
            ...mission,
            fuelHaul: {
              kind: 'reposition',
              portId: 'BRSSZ',
              kg: 80,
              fromTankKg: 80,
              boughtKg: 0,
              boughtUsd: 0,
            },
          },
          { icao: 'SBGL' },
        ),
      /Jet-A/,
    );
    assert.throws(
      () =>
        leaveFreightAtHub(
          world,
          state,
          { ...mission, emptyFlight: true },
          { icao: 'SBGL' },
        ),
      /Empty/,
    );
    assert.equal(mission.status, 'in_flight');
    assert.equal(state.fleet[0]!.locationIcao, 'SBGR');
  });

  it('moves origin, keeps dest and deadline, and parks the load on the hub', () => {
    const { world, state, mission } = airborneFreight();
    const wallet = state.walletUsd;
    const deadline = mission.deadlineTick;
    const dest = mission.destIcao;
    const lotId = mission.lots[0]!.shipmentLotId;
    const pay = mission.payUsd;
    const held = leaveFreightAtHub(world, state, mission, { icao: 'SBGL' });
    state.missions[0] = held;

    assert.equal(held.status, 'accepted');
    assert.equal(held.originIcao, 'SBGL');
    assert.equal(held.destIcao, dest);
    assert.equal(held.deadlineTick, deadline);
    assert.equal(held.payUsd, pay);
    assert.equal(held.lots[0]!.shipmentLotId, lotId);
    assert.equal(held.freightHold?.icao, 'SBGL');
    assert.equal(held.freightHold?.sinceTick, world.tick);
    assert.equal(held.departedAtTick, undefined);
    assert.equal(held.fuelUplift, undefined);
    assert.equal(state.walletUsd, wallet);
    assert.equal(
      (state.ledger ?? []).some((row) => row.kind === 'freight_payout'),
      false,
    );
    assert.equal(state.fleet[0]!.locationIcao, 'SBGL');
    assert.equal(state.fleet[0]!.status, 'assigned');
    assert.equal(state.fleet[0]!.assignedMissionId, held.id);
    assert.equal(state.pilotIcao, 'SBGL');
  });

  it('debits the yard rate after one economy day and stops on depart', () => {
    const { world, state, mission } = airborneFreight();
    const held = leaveFreightAtHub(world, state, mission, { icao: 'SBGL' });
    held.deadlineTick = world.tick + TICKS_PER_DAY * 10;
    state.missions = [held];
    const from = world.tick;
    const sameDay = settleFreightHoldFees(state, {
      fromTick: from,
      toTick: from + 4,
    });
    assert.equal(sameDay.debitUsd, 0);

    const to = from + TICKS_PER_DAY;
    const daily = portYardHoldUsdPerDay({
      kg: held.cargoKg,
      commodityId: held.commodityId,
      hubIcao: 'SBGL',
      state,
    });
    const wallet = state.walletUsd;
    const parked = state.fleet;
    state.fleet = [];
    settleCompanyPassiveFeesForTickRange(state, world, from, to);
    state.fleet = parked;
    assert.equal(state.walletUsd, wallet - daily);
    assert.equal(
      (state.ledger ?? []).some(
        (row) => row.kind === 'freight_hold' && row.amountUsd === -daily,
      ),
      true,
    );

    const departed = departMission(world, state.missions[0]!, { fleet: state });
    assert.equal(departed.mission.freightHold, undefined);
    assert.equal(departed.mission.status, 'in_flight');
    state.missions[0] = departed.mission;
    const afterDepart = settleFreightHoldFees(state, {
      fromTick: to,
      toTick: to + TICKS_PER_DAY,
    });
    assert.equal(afterDepart.debitUsd, 0);
  });

  it('stops the fee when the contract is cancelled', () => {
    const { world, state, mission } = airborneFreight();
    const held = leaveFreightAtHub(world, state, mission, { icao: 'SBGL' });
    const cancelled = cancelMission(world, held, { fleet: state });
    assert.equal(cancelled.freightHold, undefined);
    state.missions = [cancelled];
    const fee = settleFreightHoldFees(state, {
      fromTick: world.tick,
      toTick: world.tick + TICKS_PER_DAY,
    });
    assert.equal(fee.debitUsd, 0);
  });
});
