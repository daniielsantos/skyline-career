/**
 * Serialize short-lived SimBridge pipe clients (probe / preflight / watch start).
 * Concurrent open/close was thrashing SimBridgeHost (0xC00000B0 / PIPE CLOSED).
 */

let gate: Promise<void> = Promise.resolve();

export async function withSimBridgeExclusive<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = gate;
  gate = previous.then(() => next, () => next);
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
