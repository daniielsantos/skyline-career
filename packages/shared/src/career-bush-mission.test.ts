import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  abandonBushTrip,
  acceptBushTrip,
  isBushTripActive,
} from './career-bush-mission.js';
import {
  getBushTrip,
  isBushTripPlayable,
  listPlayableBushTrips,
} from './career-bush-trips.js';
import {
  emptyMissionsStateV2,
  selectStarterHub,
} from './career-fleet.js';
import { listStarterCareerPlayerAirframes } from './career-player-airframes.js';

describe('bush trip accept / abandon', () => {
  it('lists BR + three US trips as playable', () => {
    const trip = getBushTrip('br-rio-negro-tapuruquara');
    assert.ok(trip);
    assert.equal(isBushTripPlayable(trip!), true);
    assert.equal(listPlayableBushTrips().length, 4);
    assert.ok(listPlayableBushTrips().some((t) => t.id === 'us-appalachian-summits'));
  });

  it('accepts with light_ga parked at start and abandons without pay', () => {
    const starter = listStarterCareerPlayerAirframes()[0]!;
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBEG', {
      pilotName: 'Bush Pilot',
      airframeTypeId: starter.typeId,
    });
    const aircraftId = state.fleet[0]!.id;
    assert.equal(state.fleet[0]!.aircraftClassId, 'light_ga');
    assert.equal(state.fleet[0]!.locationIcao, 'SBEG');

    const accepted = acceptBushTrip(state, {
      tripId: 'br-rio-negro-tapuruquara',
      aircraftId,
      tick: 10,
    });
    assert.equal(accepted.active.status, 'accepted');
    assert.equal(accepted.active.legIndex, 0);
    assert.equal(state.fleet[0]!.status, 'assigned');
    assert.equal(state.fleet[0]!.assignedMissionId, 'bush:br-rio-negro-tapuruquara');
    assert.ok(isBushTripActive(state));

    assert.throws(
      () =>
        acceptBushTrip(state, {
          tripId: 'br-rio-negro-tapuruquara',
          aircraftId,
          tick: 11,
        }),
      /already active/i,
    );

    const walletBefore = state.walletUsd;
    const abandoned = abandonBushTrip(state, { tick: 12 });
    assert.equal(abandoned.active.status, 'cancelled');
    assert.equal(state.walletUsd, walletBefore);
    assert.equal(state.fleet[0]!.status, 'parked');
    assert.equal(state.fleet[0]!.assignedMissionId, undefined);
    assert.equal(isBushTripActive(state), undefined);
  });

  it('rejects accept when aircraft is not at trip start', () => {
    const starter = listStarterCareerPlayerAirframes()[0]!;
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'Wrong Hub',
      airframeTypeId: starter.typeId,
    });
    assert.throws(
      () =>
        acceptBushTrip(state, {
          tripId: 'br-rio-negro-tapuruquara',
          aircraftId: state.fleet[0]!.id,
          tick: 1,
        }),
      /not SBEG|ferry first/i,
    );
  });

  it('accepts validated US Appalachian trip when light_ga is at 26A', () => {
    const starter = listStarterCareerPlayerAirframes()[0]!;
    // Home must be a network hub; reposition fleet to the trip-only start.
    const state = selectStarterHub(emptyMissionsStateV2(), 'KRMG', {
      pilotName: 'US Tour',
      airframeTypeId: starter.typeId,
    });
    state.fleet[0]!.locationIcao = '26A';
    state.pilotIcao = '26A';
    const accepted = acceptBushTrip(state, {
      tripId: 'us-appalachian-summits',
      aircraftId: state.fleet[0]!.id,
      tick: 1,
    });
    assert.equal(accepted.active.tripId, 'us-appalachian-summits');
    assert.equal(accepted.active.status, 'accepted');
  });
});
