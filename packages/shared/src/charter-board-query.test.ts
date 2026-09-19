import assert from 'node:assert/strict';
import test from 'node:test';
import {
  charterBoardNeedsFitCompute,
  charterBoardNeedsFitSort,
  charterOfferMatchesDistanceMax,
  charterOfferMatchesPaxFilter,
  formatCharterBoardSorts,
  parseCharterBoardFitFilter,
  parseCharterBoardLaneFilter,
  parseCharterBoardPaxFilter,
  parseCharterBoardSorts,
  sortCharterBoardRows,
  withCharterFitSort,
  withCharterMetricPrimarySort,
  type CharterBoardSortable,
} from './charter-board-query.js';

function row(
  overrides: Partial<CharterBoardSortable> & { id: string },
): CharterBoardSortable {
  return {
    distanceNm: 500,
    paxCount: 4,
    baggageKg: 80,
    expiresAtTick: 100,
    payUsd: 5_000,
    netUsd: 4_000,
    fitCompatible: true,
    ...overrides,
  };
}

test('parseCharterBoardSorts ignores unknown keys and duplicates', () => {
  assert.deepEqual(
    parseCharterBoardSorts('distance:asc,pay:desc,nope:asc,pay:asc'),
    [
      { key: 'distance', direction: 'asc' },
      { key: 'pay', direction: 'desc' },
    ],
  );
  assert.equal(
    formatCharterBoardSorts(parseCharterBoardSorts('pax:desc,fit:asc')),
    'pax:desc,fit:asc',
  );
});

test('default sort is soonest expiry then highest pay', () => {
  const sorted = sortCharterBoardRows(
    [
      row({ id: 'b', expiresAtTick: 120, payUsd: 9_000 }),
      row({ id: 'a', expiresAtTick: 100, payUsd: 3_000 }),
      row({ id: 'c', expiresAtTick: 100, payUsd: 8_000 }),
    ],
    [],
  );
  assert.deepEqual(
    sorted.map((r) => r.id),
    ['c', 'a', 'b'],
  );
});

test('metric primary sort prefers high pay then flips then clears', () => {
  let sorts = withCharterMetricPrimarySort([], 'pay');
  assert.deepEqual(sorts, [{ key: 'pay', direction: 'desc' }]);
  sorts = withCharterMetricPrimarySort(sorts, 'pay');
  assert.deepEqual(sorts, [{ key: 'pay', direction: 'asc' }]);
  sorts = withCharterMetricPrimarySort(sorts, 'pay');
  assert.deepEqual(sorts, []);
});

test('fit sort cycles compatible-first then incompatible-first', () => {
  let sorts = withCharterFitSort([{ key: 'pay', direction: 'desc' }]);
  assert.deepEqual(sorts, [
    { key: 'fit', direction: 'asc' },
    { key: 'pay', direction: 'desc' },
  ]);
  sorts = withCharterFitSort(sorts);
  assert.equal(sorts[0]?.direction, 'desc');
  sorts = withCharterFitSort(sorts);
  assert.deepEqual(sorts, [{ key: 'pay', direction: 'desc' }]);
});

test('net and fit sorts require fit computation', () => {
  assert.equal(charterBoardNeedsFitSort([{ key: 'pay', direction: 'desc' }]), false);
  assert.equal(charterBoardNeedsFitSort([{ key: 'net', direction: 'desc' }]), true);
  assert.equal(charterBoardNeedsFitSort([{ key: 'fit', direction: 'asc' }]), true);
});

test('fit filter also requires fit computation', () => {
  assert.equal(charterBoardNeedsFitCompute([], undefined), false);
  assert.equal(charterBoardNeedsFitCompute([], 'open'), true);
  assert.equal(charterBoardNeedsFitCompute([], 'locked'), true);
});

test('parses charter lane, fit, and pax filters', () => {
  assert.equal(parseCharterBoardLaneFilter('intl'), 'intl');
  assert.equal(parseCharterBoardLaneFilter('pilot-domestic'), 'pilot-domestic');
  assert.equal(parseCharterBoardLaneFilter('pilot-intl'), 'pilot-intl');
  assert.equal(parseCharterBoardLaneFilter('bush'), undefined);
  assert.equal(parseCharterBoardFitFilter('open'), 'open');
  assert.equal(parseCharterBoardFitFilter('locked'), 'locked');
  assert.equal(parseCharterBoardFitFilter('any'), undefined);
  assert.equal(parseCharterBoardPaxFilter('light'), 'light');
  assert.equal(parseCharterBoardPaxFilter('med'), 'med');
  assert.equal(parseCharterBoardPaxFilter('narrow'), 'narrow');
  assert.equal(parseCharterBoardPaxFilter('any'), undefined);
  assert.equal(charterOfferMatchesPaxFilter(8, 'light'), true);
  assert.equal(charterOfferMatchesPaxFilter(8, 'med'), false);
  assert.equal(charterOfferMatchesPaxFilter(24, 'med'), true);
  assert.equal(charterOfferMatchesPaxFilter(80, 'narrow'), true);
  assert.equal(charterOfferMatchesPaxFilter(12, undefined), true);
  assert.equal(charterOfferMatchesDistanceMax(400, undefined), true);
  assert.equal(charterOfferMatchesDistanceMax(400, 500), true);
  assert.equal(charterOfferMatchesDistanceMax(600, 500), false);
  assert.equal(charterOfferMatchesDistanceMax(Number.NaN, 500), false);
});

test('sorts by net and fit when present', () => {
  const sorted = sortCharterBoardRows(
    [
      row({ id: 'no', netUsd: 1_000, fitCompatible: false }),
      row({ id: 'yes-hi', netUsd: 7_000, fitCompatible: true }),
      row({ id: 'yes-lo', netUsd: 2_000, fitCompatible: true }),
    ],
    [
      { key: 'fit', direction: 'asc' },
      { key: 'net', direction: 'desc' },
    ],
  );
  assert.deepEqual(
    sorted.map((r) => r.id),
    ['yes-hi', 'yes-lo', 'no'],
  );
});
