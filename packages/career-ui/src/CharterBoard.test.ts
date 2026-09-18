import assert from 'node:assert/strict';
import test from 'node:test';
import {
  charterExpiryLabel,
  charterFitLabel,
  charterNetLabel,
  resolveBaseCharterOrigin,
} from './CharterBoard';
import {
  formatCharterBoardSorts,
  withCharterFitSort,
  withCharterMetricPrimarySort,
} from './charter-board-sort';
import type { CharterOfferView } from './api';

function offer(overrides: Partial<CharterOfferView> = {}): CharterOfferView {
  return {
    id: 'charter-1',
    originIcao: 'SBSP',
    destIcao: 'SBRJ',
    originName: 'Congonhas',
    destName: 'Santos Dumont',
    paxCount: 6,
    baggageKg: 90,
    payUsd: 4_000,
    basePayUsd: 3_500,
    urgency: 'normal',
    reason: 'Charter transfer',
    createdAtTick: 100,
    expiresAtTick: 108,
    ticksRemaining: 8,
    distanceNm: 196,
    international: false,
    status: 'available',
    ...overrides,
  };
}

test('formats charter expiry from economy ticks', () => {
  assert.equal(charterExpiryLabel(2), '30 min');
  assert.equal(charterExpiryLabel(8), '2.0 h');
  assert.equal(charterExpiryLabel(96), '1 d');
});

test('uses typed dispatcher origin; empty means any (no Base lock)', () => {
  assert.equal(resolveBaseCharterOrigin('', 'sbsp'), undefined);
  assert.equal(resolveBaseCharterOrigin(' sbrj ', 'SBSP'), 'SBRJ');
});

test('summarizes compatible ferry requirement without seat fluff', () => {
  assert.equal(
    charterFitLabel(
      offer({
        fit: {
          aircraftId: 'acf-1',
          aircraftLabel: 'Citation',
          compatible: true,
          seatCapacity: 8,
          inRange: true,
          baggageOk: true,
          fuelFeasible: true,
          ferryRequired: true,
          ferryNm: 142,
          netUsd: 2_900,
          reasons: [],
        },
      }),
    ),
    'Ferry 142 nm',
  );
  assert.equal(
    charterFitLabel(
      offer({
        fit: {
          aircraftId: 'acf-1',
          aircraftLabel: 'Citation',
          compatible: true,
          seatCapacity: 8,
          inRange: true,
          baggageOk: true,
          fuelFeasible: true,
          ferryRequired: false,
          ferryNm: 0,
          netUsd: 3_100,
          reasons: [],
        },
      }),
    ),
    'At origin',
  );
});

test('hides incompatible fit text from the cell label', () => {
  assert.equal(
    charterFitLabel(
      offer({
        fit: {
          aircraftId: 'acf-1',
          aircraftLabel: 'Baron',
          compatible: false,
          seatCapacity: 4,
          inRange: true,
          baggageOk: true,
          fuelFeasible: true,
          ferryRequired: false,
          ferryNm: 0,
          netUsd: 0,
          reasons: ['Needs 6 passenger seats'],
        },
      }),
    ),
    '',
  );
});

test('charter net cell survives null/NaN fit.netUsd from the wire', () => {
  const money = (n: number) => `$${n}`;
  assert.equal(charterNetLabel(offer(), money), '—');
  assert.equal(
    charterNetLabel(
      offer({
        fit: {
          aircraftId: 'acf-1',
          aircraftLabel: 'Citation',
          compatible: true,
          seatCapacity: 8,
          inRange: true,
          baggageOk: true,
          fuelFeasible: true,
          ferryRequired: false,
          ferryNm: 0,
          netUsd: null as unknown as number,
          reasons: [],
        },
      }),
      money,
    ),
    '—',
  );
  assert.equal(
    charterNetLabel(
      offer({
        fit: {
          aircraftId: 'acf-1',
          aircraftLabel: 'Citation',
          compatible: true,
          seatCapacity: 8,
          inRange: true,
          baggageOk: true,
          fuelFeasible: true,
          ferryRequired: false,
          ferryNm: 0,
          netUsd: Number.NaN,
          reasons: [],
        },
      }),
      money,
    ),
    '—',
  );
  assert.equal(
    charterNetLabel(
      offer({
        fit: {
          aircraftId: 'acf-1',
          aircraftLabel: 'Citation',
          compatible: true,
          seatCapacity: 8,
          inRange: true,
          baggageOk: true,
          fuelFeasible: true,
          ferryRequired: false,
          ferryNm: 0,
          netUsd: 2_900,
          reasons: [],
        },
      }),
      money,
    ),
    '$2900',
  );
});

test('formats multi-level charter sorts for the API', () => {
  assert.equal(
    formatCharterBoardSorts([
      { key: 'pay', direction: 'desc' },
      { key: 'distance', direction: 'asc' },
    ]),
    'pay:desc,distance:asc',
  );
});

test('cycles metric and fit sort headers like freights', () => {
  let sorts = withCharterMetricPrimarySort([], 'distance');
  assert.deepEqual(sorts, [{ key: 'distance', direction: 'asc' }]);
  sorts = withCharterMetricPrimarySort(sorts, 'pay');
  assert.deepEqual(sorts, [
    { key: 'pay', direction: 'desc' },
    { key: 'distance', direction: 'asc' },
  ]);
  sorts = withCharterFitSort(sorts);
  assert.equal(sorts[0]?.key, 'fit');
  assert.equal(formatCharterBoardSorts(sorts), 'fit:asc,pay:desc,distance:asc');
});
