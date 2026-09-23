import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cgEnvelopeScale } from './LoadSchematic.tsx';

describe('cgEnvelopeScale', () => {
  it('keeps Accu-Sim negative MAC on the rail (not clamped to 0–100)', () => {
    const scale = cgEnvelopeScale(-15, 15, -3.2);
    assert.ok(scale.scaleMin < -3.2);
    assert.ok(scale.scaleMax > 15);
    assert.ok(scale.scaleMin < -15);
  });

  it('still spans a simvar 0–100 envelope', () => {
    const scale = cgEnvelopeScale(0, 100, 31);
    assert.ok(scale.scaleMin < 0.1);
    assert.ok(scale.scaleMax > 99.9);
  });
});
