import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  displayAmountToStoredKg,
  displayToKg,
  formatMassPreferExact,
  kgToDisplay,
} from './weight-units.js';

// Local mirror — T2 cap used in ports UI round-trip checks.
const T2_KG = 4_536;

describe('displayAmountToStoredKg', () => {
  it('imperial Max snaps to full kg (no ~2 lb dust)', () => {
    const displayMax = Math.floor(kgToDisplay(T2_KG, 'imperial'));
    const naive = Math.floor(displayToKg(displayMax, 'imperial'));
    assert.ok(naive < T2_KG, 'naive floor leaves dust');
    assert.equal(
      displayAmountToStoredKg(displayMax, 'imperial', T2_KG),
      T2_KG,
    );
  });

  it('imperial partial amount still floors normally', () => {
    assert.equal(
      displayAmountToStoredKg(1_000, 'imperial', T2_KG),
      Math.floor(displayToKg(1_000, 'imperial')),
    );
  });

  it('snaps to ops cap when display matches ops', () => {
    const ops = 1_211;
    const opsDisp = Math.floor(kgToDisplay(ops, 'imperial'));
    assert.equal(
      displayAmountToStoredKg(opsDisp, 'imperial', T2_KG, [ops]),
      ops,
    );
  });

  it('metric Max is identity', () => {
    assert.equal(displayAmountToStoredKg(2_268, 'metric', 2_268), 2_268);
  });
});

describe('formatMassPreferExact', () => {
  it('shows lb for dust that would be 0.0 klb', () => {
    assert.equal(formatMassPreferExact(1, 'imperial'), '2 lb');
    assert.match(formatMassPreferExact(2_268, 'imperial'), /klb/);
  });
});
