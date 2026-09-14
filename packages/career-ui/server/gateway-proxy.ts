/**
 * Forward non-sim requests from the desktop gateway to the world API.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { worldAuthFromIncoming } from './world-api-client.js';

export type GatewayProxyOpts = {
  worldBaseUrl: string;
  fetchImpl?: typeof fetch;
};

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

export async function proxyToWorldApi(
  req: IncomingMessage,
  res: ServerResponse,
  opts: GatewayProxyOpts,
): Promise<void> {
  const base = opts.worldBaseUrl.replace(/\/+$/, '');
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const target = `${base}${url.pathname}${url.search}`;
  const method = (req.method ?? 'GET').toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await readRawBody(req);

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue;
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  // Ensure company/auth survive even if stripped oddly.
  const auth = worldAuthFromIncoming(req);
  if (auth.authorization) headers.authorization = auth.authorization;
  if (auth.companyId) headers['x-skyline-company-id'] = auth.companyId;

  const fetchImpl = opts.fetchImpl ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetchImpl(target, {
      method,
      headers,
      body: body && body.length > 0 ? new Uint8Array(body) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: `World API unreachable: ${message}`,
        code: 'world_unreachable',
      }),
    );
    return;
  }

  const outHeaders: Record<string, string> = {
    'access-control-allow-origin': '*',
  };
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    if (key.toLowerCase() === 'access-control-allow-origin') return;
    outHeaders[key] = value;
  });
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, outHeaders);
  res.end(buf);
}
