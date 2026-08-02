/**
 * Shared OFP-inject activity flag.
 * Kept in a tiny module so Watch / probe can pause without circular imports.
 */

let ofpLoadActiveCount = 0;
let ofpLoadLock: Promise<void> = Promise.resolve();

export function beginOfpLoadActive(): void {
  ofpLoadActiveCount += 1;
}

export function endOfpLoadActive(): void {
  ofpLoadActiveCount = Math.max(0, ofpLoadActiveCount - 1);
}

export function isOfpLoadActive(): boolean {
  return ofpLoadActiveCount > 0;
}

/** Ensure only one OFP inject runs at a time (UI polling must not start a second). */
export async function withOfpLoadExclusive<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = ofpLoadLock;
  ofpLoadLock = previous.then(() => gate);
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
