import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTourPaxByLeg,
  splitTourRouteStops,
} from './tour-route-format.ts';

test('splitTourRouteStops splits unicode and ascii arrows', () => {
  assert.deepEqual(splitTourRouteStops('SBUL→SBKG→SBRF'), [
    'SBUL',
    'SBKG',
    'SBRF',
  ]);
  assert.deepEqual(splitTourRouteStops('SBPS -> SBSP -> SBGO'), [
    'SBPS',
    'SBSP',
    'SBGO',
  ]);
});

test('formatTourPaxByLeg shows per-leg sizes instead of summing', () => {
  assert.equal(
    formatTourPaxByLeg([{ groupSize: 12 }, { groupSize: 11 }]),
    '12 · 11',
  );
  assert.equal(formatTourPaxByLeg([{ groupSize: 8 }]), '8');
});
