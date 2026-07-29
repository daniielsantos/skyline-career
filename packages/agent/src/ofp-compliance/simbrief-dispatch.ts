/**
 * SimBrief Dispatch Redirect — prefill dispatch options, user generates in browser.
 * Docs: https://forum.navigraph.com/t/dispatch-redirect-guide/5299
 *
 * No API key required. Fuel stays AUTO (omit minfob / manual fuel fields).
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export const SIMBRIEF_DISPATCH_BASE = 'https://dispatch.simbrief.com/options/custom';

export interface SimBriefDispatchParams {
  /** ICAO type code or custom airframe Internal ID. */
  type: string;
  orig: string;
  dest: string;
  /** Passenger count. Pass explicitly (including 0 for freighter) to avoid AUTO load. */
  pax?: number;
  /**
   * Freight added, in **thousands** of the selected unit (SimBrief API convention).
   * e.g. 5.0 with units=KGS → 5000 kg.
   */
  cargo?: number;
  /**
   * Total manual payload, in **thousands** of the selected unit.
   * Usually omit this and let SimBrief derive payload from pax + cargo.
   */
  manualPayload?: number;
  units?: 'KGS' | 'LBS';
  /** Stable id so fetcher can pull this OFP later. */
  staticId?: string;
  airline?: string;
  fltnum?: string;
  route?: string;
  altn?: string;
  reg?: string;
  callsign?: string;
  date?: string;
  deph?: number;
  depm?: number;
  /** Extra acdata JSON (weights in thousands of lb per SimBrief docs). */
  acdata?: Record<string, string | number>;
}

export function makeStaticId(prefix = 'skyline'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
}

/**
 * Build a Dispatch Redirect URL with career params.
 * Omits undefined fields; always sets units default KGS.
 */
export function buildDispatchRedirectUrl(params: SimBriefDispatchParams): string {
  const qs = new URLSearchParams();
  qs.set('type', params.type.trim());
  qs.set('orig', params.orig.trim().toUpperCase());
  qs.set('dest', params.dest.trim().toUpperCase());
  qs.set('units', params.units === 'LBS' ? 'LBS' : 'KGS');

  if (params.staticId) {
    qs.set('static_id', params.staticId);
  }
  if (params.pax !== undefined && Number.isFinite(params.pax)) {
    qs.set('pax', String(Math.max(0, Math.round(params.pax))));
  }
  if (params.cargo !== undefined && Number.isFinite(params.cargo)) {
    qs.set('cargo', formatCargoThousands(params.cargo));
  }
  if (params.manualPayload !== undefined && Number.isFinite(params.manualPayload)) {
    qs.set('manualpayload', formatCargoThousands(params.manualPayload));
  }
  if (params.airline) {
    qs.set('airline', params.airline.trim());
  }
  if (params.fltnum) {
    qs.set('fltnum', params.fltnum.trim());
  }
  if (params.route) {
    qs.set('route', params.route.trim());
  }
  if (params.altn) {
    qs.set('altn', params.altn.trim().toUpperCase());
  }
  if (params.reg) {
    qs.set('reg', params.reg.trim());
  }
  if (params.callsign) {
    qs.set('callsign', params.callsign.trim());
  }
  if (params.date) {
    qs.set('date', params.date.trim());
  }
  if (params.deph !== undefined && Number.isFinite(params.deph)) {
    qs.set('deph', String(Math.trunc(params.deph)));
  }
  if (params.depm !== undefined && Number.isFinite(params.depm)) {
    qs.set('depm', String(Math.trunc(params.depm)));
  }
  if (params.acdata && Object.keys(params.acdata).length > 0) {
    qs.set('acdata', JSON.stringify(params.acdata));
  }

  return `${SIMBRIEF_DISPATCH_BASE}?${qs.toString()}`;
}

/** Format cargo as SimBrief thousands (preserve one decimal when needed). */
export function formatCargoThousands(cargoThousands: number): string {
  const n = Math.max(0, cargoThousands);
  if (Number.isInteger(n)) {
    return String(n);
  }
  return n.toFixed(3).replace(/\.?0+$/, '');
}

/**
 * Convert a freight weight in the same unit as `units` into SimBrief `cargo` thousands.
 * e.g. 4066 kg → 4.066
 */
export function cargoWeightToThousands(weight: number): number {
  return Math.max(0, weight) / 1000;
}

/** Open URL in the OS default browser (fire-and-forget). */
export function openDispatchInBrowser(url: string): void {
  const plat = platform();
  if (plat === 'win32') {
    // Do not use `cmd /c start`: cmd treats each `&` in the query string as a
    // command separator, so only the first parameter reaches the browser.
    spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }
  if (plat === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}
