import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isHeadlessPulseEnabled, emptyPulseChunkTiming } from './local-world-tick-service.ts';

describe('isHeadlessPulseEnabled', () => {
  it('defaults to on', () => {
    assert.equal(isHeadlessPulseEnabled({}), true);
    assert.equal(isHeadlessPulseEnabled({ CAREER_HEADLESS_PULSE: '1' }), true);
  });

  it('respects opt-out flags', () => {
    assert.equal(isHeadlessPulseEnabled({ CAREER_HEADLESS_PULSE: '0' }), false);
    assert.equal(
      isHeadlessPulseEnabled({ CAREER_HEADLESS_PULSE: 'false' }),
      false,
    );
    assert.equal(isHeadlessPulseEnabled({ CAREER_HEADLESS_PULSE: 'off' }), false);
  });
});

describe('emptyPulseChunkTiming', () => {
  it('zeros all phases', () => {
    assert.deepEqual(emptyPulseChunkTiming(), {
      lockWaitMs: 0,
      tickMs: 0,
      saveMs: 0,
      settleMs: 0,
      lots: 0,
    });
  });
});
