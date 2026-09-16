/** PostgreSQL failures that are safe to retry during process startup. */
export function isTransientPostgresStartupError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: string;
    message?: string;
    errno?: string;
  };
  const code = String(e.code ?? e.errno ?? '');
  if (
    code === '40P01' ||
    code === '57P03' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === '08001' ||
    code === '08006'
  ) {
    return true;
  }
  const msg = String(e.message ?? err);
  return /deadlock detected|not yet accepting connections|recovery state has not been yet reached|Connection refused|connect ECONNREFUSED|the database system is starting up|too many clients/i.test(
    msg,
  );
}

export async function withPostgresReadyRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: {
    attempts: number;
    delayMs: number;
    log: (line: string) => void;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientPostgresStartupError(err) || attempt >= opts.attempts) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      opts.log(
        `${label}: postgres startup retry (${attempt}/${opts.attempts}) — ${msg}`,
      );
      await sleep(opts.delayMs);
    }
  }
  throw lastErr;
}
