/**
 * Serialize short-lived SimBridge pipe clients (probe / preflight / watch start / inject).
 * Concurrent open/close was thrashing SimBridgeHost (0xC00000B0 / PIPE CLOSED).
 */

let gate: Promise<void> = Promise.resolve();

export async function withSimBridgeExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const release = await acquireSimBridgeExclusive();
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Hold the gate across a long inject without nesting the whole body in a callback. */
export async function acquireSimBridgeExclusive(): Promise<() => void> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = gate;
  gate = previous.then(
    () => next,
    () => next,
  );
  await previous;
  return release;
}
