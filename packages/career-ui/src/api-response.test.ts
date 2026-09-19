import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseApiResponse } from './api-response.ts';

describe('parseApiResponse', () => {
  it('returns JSON payloads', async () => {
    const data = await parseApiResponse<{ ok: boolean }>(
      Response.json({ ok: true }),
    );
    assert.deepEqual(data, { ok: true });
  });

  it('preserves JSON API errors', async () => {
    await assert.rejects(
      () =>
        parseApiResponse(
          Response.json(
            { error: 'hub unavailable', code: 'hub_unavailable' },
            { status: 409 },
          ),
        ),
      /hub unavailable/,
    );
  });

  it('turns Cloudflare timeout HTML into an actionable error', async () => {
    await assert.rejects(
      () =>
        parseApiResponse(
          new Response('<!DOCTYPE html><title>524 timeout</title>', {
            status: 524,
            headers: { 'content-type': 'text/html' },
          }),
        ),
      /World API timed out \(HTTP 524\).*wait, then refresh/,
    );
  });

  it('formats client_update_required with min version', async () => {
    await assert.rejects(
      () =>
        parseApiResponse(
          Response.json(
            { error: 'client_update_required', minClientVersion: '0.3.105' },
            { status: 426 },
          ),
        ),
      /Update required · v0\.3\.105\+/,
    );
  });
});
