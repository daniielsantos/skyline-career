/**
 * Promise lock for career serialization.
 * Non-reentrant: callers under the lock must use unlocked load/save helpers.
 *
 * Acquire **world then company**. Never take world while holding company.
 */
export type PromiseLock = {
  withLock: <T>(fn: () => Promise<T> | T) => Promise<T>;
};

export function createPromiseLock(): PromiseLock {
  let tail: Promise<void> = Promise.resolve();
  return {
    withLock<T>(fn: () => Promise<T> | T): Promise<T> {
      const run = tail.then(
        () => fn(),
        () => fn(),
      );
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}
