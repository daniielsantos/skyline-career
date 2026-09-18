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
        title:
          'Charter seat capacity on this cabin. Cargo kg is freight payload — this SKU has a single passenger config (no cargo glass switch).',
      },
    );
    const dual = formatMarketCharterSpec({
      id: 'light_ga',
      name: 'Titan',
      msrpUsd: 0,
      leaseMonthlyUsd: 0,
      maxCargoKg: 0,
      maxRangeNm: 0,
      passengerSeats: 8,
      dualLayout: true,
    });
    assert.equal(dual?.value, '8 · dual');
    assert.match(dual?.title ?? '', /not the Cargo kg payload line/i);
    assert.match(dual?.title ?? '', /passenger glass/i);
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
    const blocked = formatHangarCabinSpec(cargoBlocked);
    assert.equal(blocked?.value, 'cargo · needs pax');
    assert.match(blocked?.title ?? '', /cargo glass/i);
    assert.match(blocked?.title ?? '', /not just freight payload/i);
    const dualPax = formatHangarCabinSpec({
      activeRole: 'passenger',
      activeLabel: 'Passenger',
      passengerSeats: 9,
      dualLayout: true,
      charterNeedsPassenger: false,
    });
    assert.equal(dualPax?.value, '9 pax');
    assert.match(dualPax?.title ?? '', /cargo glass/i);
  });
});
