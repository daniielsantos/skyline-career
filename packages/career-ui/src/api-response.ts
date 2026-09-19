const PROXY_TIMEOUT_STATUSES = new Set([502, 504, 522, 524]);

type ApiErrorPayload = {
  error?: unknown;
  code?: unknown;
  minClientVersion?: unknown;
};

/**
 * Parse the JSON contract without leaking proxy HTML into JSON.parse errors.
 * A timed-out write can still finish on the world host after the proxy closes.
 */
export async function parseApiResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: ApiErrorPayload;
  try {
    data = JSON.parse(text) as ApiErrorPayload;
  } catch {
    if (PROXY_TIMEOUT_STATUSES.has(res.status)) {
      throw new Error(
        `World API timed out (HTTP ${res.status}). The server may still be processing; wait, then refresh.`,
      );
    }
    throw new Error(
      `Career API returned a non-JSON response (HTTP ${res.status || 'unknown'}).`,
    );
  }
  if (!res.ok) {
    if (data.error === 'client_update_required') {
      const min =
        typeof data.minClientVersion === 'string' && data.minClientVersion.trim()
          ? data.minClientVersion.trim()
          : '';
      throw new Error(
        min
          ? `Update required · v${min}+ — open Settings → Updates`
          : 'Update required — open Settings → Updates',
      );
    }
    throw new Error(
      typeof data.error === 'string' && data.error.trim()
        ? data.error
        : `HTTP ${res.status}`,
    );
  }
  return data as T;
}
