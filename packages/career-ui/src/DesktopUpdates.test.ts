import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DESKTOP_UPDATE_POLL_MS,
  clampDesktopUpdateProgressPct,
  desktopUpdateHeaderLabel,
  isNewerDesktopVersion,
  type DesktopUpdateState,
} from './DesktopUpdates.tsx';

function state(
  partial: Partial<DesktopUpdateState>,
): DesktopUpdateState {
  return {
    status: 'idle',
    installedVersion: '0.3.78',
    remoteVersion: null,
    progressPct: 0,
    error: null,
    busy: false,
    ...partial,
  };
}

describe('desktopUpdateHeaderLabel', () => {
  it('hides when idle or up to date', () => {
    assert.equal(desktopUpdateHeaderLabel(state({ status: 'idle' })), null);
    assert.equal(desktopUpdateHeaderLabel(state({ status: 'uptodate' })), null);
    assert.equal(desktopUpdateHeaderLabel(state({ status: 'checking' })), null);
  });

  it('shows update / progress / install labels', () => {
    assert.equal(
      desktopUpdateHeaderLabel(
        state({ status: 'available', remoteVersion: '0.3.79' }),
      ),
      'Update 0.3.79',
    );
    assert.equal(
      desktopUpdateHeaderLabel(
        state({
          status: 'downloading',
          remoteVersion: '0.3.79',
          progressPct: 42.4,
        }),
      ),
      'Downloading 42%',
    );
    assert.equal(
      desktopUpdateHeaderLabel(
        state({ status: 'ready', remoteVersion: '0.3.79' }),
      ),
      'Install 0.3.79',
    );
  });

  it('uses a long poll interval (30 minutes)', () => {
    assert.equal(DESKTOP_UPDATE_POLL_MS, 30 * 60 * 1000);
  });

  it('shows force-min label when updater is idle', () => {
    assert.equal(
      desktopUpdateHeaderLabel(state({ status: 'idle' }), {
        forceMinClientVersion: '0.3.155',
      }),
      'Update 0.3.155',
    );
    assert.equal(
      desktopUpdateHeaderLabel(
        state({ status: 'available', remoteVersion: '0.3.156' }),
        { forceMinClientVersion: '0.3.155' },
      ),
      'Update 0.3.156',
    );
  });
});

describe('clampDesktopUpdateProgressPct', () => {
  it('never decreases within a download session', () => {
    assert.equal(clampDesktopUpdateProgressPct(40, 25), 40);
    assert.equal(clampDesktopUpdateProgressPct(40, 55), 55);
    assert.equal(clampDesktopUpdateProgressPct(0, 12), 12);
  });

  it('clamps to 0..100', () => {
    assert.equal(clampDesktopUpdateProgressPct(0, -5), 0);
    assert.equal(clampDesktopUpdateProgressPct(90, 140), 100);
    assert.equal(clampDesktopUpdateProgressPct(10, Number.NaN), 10);
  });
});

describe('isNewerDesktopVersion', () => {
  it('compares patch versions', () => {
    assert.equal(isNewerDesktopVersion('0.3.79', '0.3.78'), true);
    assert.equal(isNewerDesktopVersion('0.3.78', '0.3.78'), false);
    assert.equal(isNewerDesktopVersion('0.3.78', '0.3.79'), false);
  });
});
