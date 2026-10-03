import { fetchPorts, type PortsSnapshot } from './api';

const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const FRESH_MS = 20_000;

type Entry = { snap: PortsSnapshot; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<PortsSnapshot>>();
let styleWarmed = false;

function warmMapStyle(): void {
  if (styleWarmed || typeof fetch !== 'function') return;
  styleWarmed = true;
  void fetch(OPENFREEMAP_DARK).catch(() => undefined);
}

export function peekPortsDesk(
  companyId: string | null | undefined,
): PortsSnapshot | null {
  const id = companyId?.trim();
  if (!id) return null;
  return cache.get(id)?.snap ?? null;
}

export function rememberPortsDesk(
  companyId: string | null | undefined,
  snap: PortsSnapshot,
): void {
  const id = companyId?.trim();
  if (!id) return;
  cache.set(id, { snap, at: Date.now() });
}

export function portsDeskIsFresh(
  companyId: string | null | undefined,
): boolean {
  const id = companyId?.trim();
  if (!id) return false;
  const row = cache.get(id);
  return Boolean(row && Date.now() - row.at < FRESH_MS);
}

/** Network snapshot for the Ports tab. Shares one request per company. */
export function prefetchPortsDesk(companyId: string): Promise<PortsSnapshot> {
  const id = companyId.trim();
  warmMapStyle();
  const pending = inflight.get(id);
  if (pending) return pending;
  const task = fetchPorts({
    companyId: id,
    soft: true,
    scope: 'network',
  })
    .then((snap) => {
      cache.set(id, { snap, at: Date.now() });
      return snap;
    })
    .finally(() => {
      inflight.delete(id);
    });
  inflight.set(id, task);
  return task;
}
