import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createCruiseSampleState,
  cruiseSampleStatus,
  mergeAirframePerfOverride,
  pushCruiseTick,
  type CruiseTick,
} from './cruise-sample.js';

function tick(
  atMs: number,
  overrides: Partial<CruiseTick> = {},
): CruiseTick {
  return {
    atMs,
    onGround: false,
    vsFpm: 20,
    tasKt: 180,
    fuelFlowKgPerHour: 160,
    altFt: 8_000,
    ...overrides,
  };
}

describe('pushCruiseTick', () => {
  it('stays idle until a stable tick arrives', () => {
    let state = createCruiseSampleState();
    const ground = pushCruiseTick(state, tick(0, { onGround: true }));
    assert.equal(ground.state.window.length, 0);
    assert.equal(cruiseSampleStatus(ground.state).phase, 'idle');

    const climb = pushCruiseTick(
      ground.state,
      tick(5_000, { vsFpm: 900 }),
    );
    assert.equal(climb.state.window.length, 0);
  });

  it('collects then locks after minStableMs of stable cruise', () => {
    let state = createCruiseSampleState();
    const opts = { minStableMs: 60_000 };
    for (let i = 0; i <= 12; i += 1) {
      const pushed = pushCruiseTick(state, tick(i * 5_000), opts);
      state = pushed.state;
    }
    const status = cruiseSampleStatus(state, opts);
    assert.equal(status.phase, 'locked');
    assert.equal(status.elapsedMs, 60_000);
    assert.equal(status.requiredMs, 60_000);
    assert.ok(state.committed);
    assert.equal(state.committed.cruiseSpeedKt, 180);
    assert.equal(state.committed.cruiseFuelFlowKgPerHour, 160);
    assert.equal(state.committed.fuelBurnKgPerNm, 0.889);
  });

  it('keeps locked elapsed capped at requiredMs after long cruise', () => {
    let state = createCruiseSampleState();
    const opts = { minStableMs: 60_000 };
    for (let i = 0; i <= 40; i += 1) {
      state = pushCruiseTick(state, tick(i * 5_000), opts).state;
    }
    const status = cruiseSampleStatus(state, opts);
    assert.equal(status.phase, 'locked');
    assert.equal(status.elapsedMs, 60_000);
    assert.ok(
      (state.window[state.window.length - 1]!.atMs - state.window[0]!.atMs) >
        60_000,
    );
  });
  it('clears the window when VS exceeds the gate', () => {
    let state = createCruiseSampleState();
    const opts = { minStableMs: 60_000 };
    for (let i = 0; i < 5; i += 1) {
      state = pushCruiseTick(state, tick(i * 5_000), opts).state;
    }
    assert.equal(cruiseSampleStatus(state, opts).phase, 'collecting');
    state = pushCruiseTick(
      state,
      tick(30_000, { vsFpm: 900 }),
      opts,
    ).state;
    assert.equal(state.window.length, 0);
    assert.equal(cruiseSampleStatus(state, opts).phase, 'idle');
  });

  it('rejects a window with large TAS spread', () => {
    let state = createCruiseSampleState();
    const opts = { minStableMs: 30_000, maxTasSpread: 0.05 };
    state = pushCruiseTick(state, tick(0, { tasKt: 160 }), opts).state;
    state = pushCruiseTick(state, tick(10_000, { tasKt: 200 }), opts).state;
    // Unstable pair collapses toward the latest tick only.
    assert.ok(state.window.length <= 1);
    assert.equal(state.committed, undefined);
  });

  it('keeps progress when a tick is missing fuel flow', () => {
    let state = createCruiseSampleState();
    const opts = { minStableMs: 60_000 };
    for (let i = 0; i < 5; i += 1) {
      state = pushCruiseTick(state, tick(i * 5_000), opts).state;
    }
    assert.equal(state.window.length, 5);
    state = pushCruiseTick(
      state,
      tick(25_000, { fuelFlowKgPerHour: undefined }),
      opts,
    ).state;
    assert.equal(state.window.length, 5);
    assert.equal(cruiseSampleStatus(state, opts).phase, 'collecting');
  });

  it('ignores abrupt fuel-flow spikes without clearing the window', () => {
    let state = createCruiseSampleState();
    const opts = { minStableMs: 60_000 };
    for (let i = 0; i < 5; i += 1) {
      state = pushCruiseTick(
        state,
        tick(i * 5_000, { fuelFlowKgPerHour: 58.7 }),
        opts,
      ).state;
    }
    assert.equal(state.window.length, 5);
    state = pushCruiseTick(
      state,
      tick(25_000, { fuelFlowKgPerHour: 451.8 }),
      opts,
    ).state;
    assert.equal(state.window.length, 5);
    assert.ok(
      state.window.every((t) => Math.abs((t.fuelFlowKgPerHour ?? 0) - 58.7) < 0.1),
    );
  });
});

describe('mergeAirframePerfOverride', () => {
  it('uses the first sample fully then EMA-merges', () => {
    const first = mergeAirframePerfOverride(undefined, {
      cruiseSpeedKt: 180,
      cruiseFuelFlowKgPerHour: 160,
      fuelBurnKgPerNm: 0.889,
      sampleCount: 12,
      durationSec: 60,
      committedAtMs: 1_000,
    });
    assert.equal(first.cruiseSpeedKt, 180);
    assert.equal(first.cruiseFuelFlowKgPerHour, 160);
    assert.equal(first.sampleCount, 1);

    const second = mergeAirframePerfOverride(
      first,
      {
        cruiseSpeedKt: 190,
        cruiseFuelFlowKgPerHour: 170,
        fuelBurnKgPerNm: 0.895,
        sampleCount: 12,
        durationSec: 60,
        committedAtMs: 2_000,
      },
      0.3,
    );
    assert.equal(second.cruiseSpeedKt, Math.round(180 * 0.7 + 190 * 0.3));
    assert.equal(second.sampleCount, 2);
    assert.ok(second.cruiseFuelFlowKgPerHour != null);
    assert.ok(
      Math.abs(second.cruiseFuelFlowKgPerHour - (160 * 0.7 + 170 * 0.3)) < 0.05,
    );
  });
});
