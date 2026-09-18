import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatHangarCabinSpec,
  formatMarketCharterSpec,
  type AircraftCatalogEntry,
  type HangarCabinStatus,
} from './AircraftCards.tsx';

describe('aircraft cabin card copy', () => {
  it('formats Market charter seats and dual-layout hint', () => {
    assert.equal(formatMarketCharterSpec(undefined), null);
    assert.equal(
      formatMarketCharterSpec({
        id: 'light_ga',
        name: 'x',
        msrpUsd: 0,
        leaseMonthlyUsd: 0,
        maxCargoKg: 0,
        maxRangeNm: 0,
        passengerSeats: 0,
      } satisfies AircraftCatalogEntry),
      null,
    );
    assert.deepEqual(
      formatMarketCharterSpec({
        id: 'light_ga',
        name: 'Duke',
        msrpUsd: 0,
        leaseMonthlyUsd: 0,
        maxCargoKg: 0,
        maxRangeNm: 0,
        passengerSeats: 4,
      }),
      {
        value: '4',
        title: 'Passenger seats available for Charter',
      },
    );
    assert.equal(
      formatMarketCharterSpec({
        id: 'light_ga',
        name: 'Titan',
        msrpUsd: 0,
        leaseMonthlyUsd: 0,
        maxCargoKg: 0,
        maxRangeNm: 0,
        passengerSeats: 8,
        dualLayout: true,
      })?.value,
      '8 · dual',
    );
  });

  it('formats Hangar active cabin and cargo charter block', () => {
    assert.equal(formatHangarCabinSpec(undefined), null);
    const cargoBlocked: HangarCabinStatus = {
      activeRole: 'cargo',
      activeLabel: 'Cargo',
      passengerSeats: 9,
      dualLayout: true,
      charterNeedsPassenger: true,
    };
    assert.equal(
      formatHangarCabinSpec(cargoBlocked)?.value,
      'cargo · needs pax',
    );
    assert.equal(
      formatHangarCabinSpec({
        activeRole: 'passenger',
        activeLabel: 'Passenger',
        passengerSeats: 9,
        dualLayout: true,
        charterNeedsPassenger: false,
      })?.value,
      '9 pax',
    );
  });
});
