/**
 * MSFS 2024 can leave IS PAUSED sticky after ESC → Resume while the sim is
 * live. Watch already overrides via Absolute Time; inject gating must too or
 * Load Plan fails with SIM_PAUSED on an unpaused cockpit.
 */
import type { SimBridge, SimSnapshot } from '../types.js';

async function readAbsoluteTimeSec(bridge: SimBridge): Promise<number | null> {
  try {
    if (typeof bridge.readSimVars === 'function') {
      const [t] = await bridge.readSimVars([
        { name: 'ABSOLUTE TIME', unit: 'Seconds' },
      ]);
      return typeof t === 'number' && Number.isFinite(t) ? t : null;
    }
    const t = await bridge.readSimVar({
      name: 'ABSOLUTE TIME',
      unit: 'Seconds',
    });
    return typeof t === 'number' && Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * If snapshot.paused but Absolute Time advances across a short probe, treat
 * as live for gating (sticky pause). True ESC pause keeps Absolute Time still.
 */
export async function clearStickyPausedForGating(
  bridge: SimBridge,
  snapshot: SimSnapshot,
  opts?: { probeMs?: number; minDtSec?: number },
): Promise<{ snapshot: SimSnapshot; stickyCleared: boolean }> {
  if (!snapshot.paused) {
    return { snapshot, stickyCleared: false };
  }
  const probeMs = opts?.probeMs ?? 450;
  const minDtSec = opts?.minDtSec ?? 0.2;
  const t0 = await readAbsoluteTimeSec(bridge);
  if (t0 == null) {
    return { snapshot, stickyCleared: false };
  }
  await bridge.delay(probeMs);
  const t1 = await readAbsoluteTimeSec(bridge);
  if (t1 == null || t1 - t0 < minDtSec) {
    return { snapshot, stickyCleared: false };
  }
  return {
    snapshot: { ...snapshot, paused: false },
    stickyCleared: true,
  };
}
