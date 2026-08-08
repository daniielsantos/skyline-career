/**
 * Soft-field bush strips — spokes outside the ferry graph (all career countries).
 * Market freights never form on bush ODs (payload rides on bush trips).
 * light_ga + no dealer ferry still apply at bush hubs.
 * US `bushTripOnly` locals: trip endpoints only — also blocked from Market/ferry/home.
 * Trip-only strips have frozen cargo economy (no warehouse demand) and stay off the Network map.
 */

import { BR_CAREER_HUBS } from './career-br-hubs.js';
import { CA_CAREER_HUBS } from './career-ca-hubs.js';
import { MX_CAREER_HUBS } from './career-mx-hubs.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';
import { countryIdFromRegion } from './career-partition.js';

export type BushCountryId = 'BR' | 'US' | 'CA' | 'MX';

/** Gateways that may trade with bush hubs (inbound supplies / outbound electronics). */
export const BUSH_GATEWAYS_BY_COUNTRY: Readonly<
  Record<BushCountryId, readonly string[]>
> = {
  BR: ['SBEG', 'SBSN', 'SBBE'],
  US: ['KSEA', 'KPDX', 'KDEN', 'KABQ', 'KPHX', 'KBOI'],
  CA: ['CYVR', 'CYYC', 'CYEG', 'CYMT', 'CYWG', 'CYYZ'],
  MX: ['MMCU', 'MMHO', 'MMMY', 'MMGL'],
} as const;

/** Flat list of all bush gateways (compat / tests). */
export const BUSH_GATEWAY_ICAOS: readonly string[] = Object.values(
  BUSH_GATEWAYS_BY_COUNTRY,
).flat();

type BushHubRef = { icao: string; region: string };

const ALL_BUSH_HUBS: readonly BushHubRef[] = [
  ...BR_CAREER_HUBS.filter((h) => h.bush === true),
  ...US_CAREER_HUBS.filter((h) => h.bush === true),
  ...CA_CAREER_HUBS.filter((h) => h.bush === true),
  ...MX_CAREER_HUBS.filter((h) => h.bush === true),
].map((h) => ({ icao: h.icao.toUpperCase(), region: h.region }));

const BUSH_SET: ReadonlySet<string> = new Set(
  ALL_BUSH_HUBS.map((h) => h.icao),
);

const BUSH_COUNTRY: ReadonlyMap<string, BushCountryId> = new Map(
  ALL_BUSH_HUBS.map((h) => {
    const id = countryIdFromRegion(h.region);
    if (id !== 'BR' && id !== 'US' && id !== 'CA' && id !== 'MX') {
      throw new Error(`Bush hub ${h.icao} has unsupported country ${id}`);
    }
    return [h.icao, id];
  }),
);

const GATEWAY_COUNTRY: ReadonlyMap<string, BushCountryId> = (() => {
  const m = new Map<string, BushCountryId>();
  for (const [country, icaos] of Object.entries(BUSH_GATEWAYS_BY_COUNTRY) as [
    BushCountryId,
    readonly string[],
  ][]) {
    for (const icao of icaos) m.set(icao.toUpperCase(), country);
  }
  return m;
})();

const GATEWAY_SET: ReadonlySet<string> = new Set(GATEWAY_COUNTRY.keys());

const BUSH_TRIP_ONLY_SET: ReadonlySet<string> = new Set(
  US_CAREER_HUBS.filter((h) => h.bushTripOnly === true).map((h) =>
    h.icao.toUpperCase(),
  ),
);

export function listBushIcaos(): string[] {
  return [...BUSH_SET].sort();
}

export function listBushTripOnlyIcaos(): string[] {
  return [...BUSH_TRIP_ONLY_SET].sort();
}

export function isBushHub(icao: string | null | undefined): boolean {
  if (!icao) return false;
  return BUSH_SET.has(icao.trim().toUpperCase());
}

/** FAA local / trip-only strip — not a soft-field `bush` hub. */
export function isBushTripOnlyHub(icao: string | null | undefined): boolean {
  if (!icao) return false;
  return BUSH_TRIP_ONLY_SET.has(icao.trim().toUpperCase());
}

/** Soft-field bush or trip-only strip — offline for Market / ferry / starter home. */
export function isOfflineNetworkHub(icao: string | null | undefined): boolean {
  return isBushHub(icao) || isBushTripOnlyHub(icao);
}

export function isBushGateway(icao: string | null | undefined): boolean {
  if (!icao) return false;
  return GATEWAY_SET.has(icao.trim().toUpperCase());
}

export function bushCountryForIcao(
  icao: string | null | undefined,
): BushCountryId | undefined {
  if (!icao) return undefined;
  return BUSH_COUNTRY.get(icao.trim().toUpperCase());
}

/**
 * Market / formLots gate: any OD that touches a bush hub is forbidden.
 * Non-bush pairs always pass. Bush payload moves only via bush trips.
 */
export function isBushFreightOdAllowed(
  originIcao: string,
  destIcao: string,
): boolean {
  const o = originIcao.trim().toUpperCase();
  const d = destIcao.trim().toUpperCase();
  if (BUSH_SET.has(o) || BUSH_SET.has(d)) return false;
  if (BUSH_TRIP_ONLY_SET.has(o) || BUSH_TRIP_ONLY_SET.has(d)) return false;
  return true;
}

/**
 * True when a bush-trip leg endpoint pair is legal (bush↔same-country gateway
 * or chained bush/gateway nodes). Not used by Market formLots.
 */
export function isBushTripOdAllowed(
  originIcao: string,
  destIcao: string,
  countryId: BushCountryId,
): boolean {
  const o = originIcao.trim().toUpperCase();
  const d = destIcao.trim().toUpperCase();
  const gateways = new Set(
    BUSH_GATEWAYS_BY_COUNTRY[countryId].map((g) => g.toUpperCase()),
  );
  const oOk =
    (BUSH_SET.has(o) && BUSH_COUNTRY.get(o) === countryId) || gateways.has(o);
  const dOk =
    (BUSH_SET.has(d) && BUSH_COUNTRY.get(d) === countryId) || gateways.has(d);
  return oOk && dOk && o !== d;
}

/** Player / NPC class gate for any OD that touches a bush hub. */
export function bushRequiresLightGa(
  originIcao: string,
  destIcao: string,
): boolean {
  return isBushHub(originIcao) || isBushHub(destIcao);
}

export function assertBushLightGa(
  originIcao: string,
  destIcao: string,
  aircraftClassId: string,
): void {
  if (!bushRequiresLightGa(originIcao, destIcao)) return;
  if (aircraftClassId !== 'light_ga') {
    throw new Error(
      `Bush strip ${originIcao}→${destIcao} requires light GA (got ${aircraftClassId})`,
    );
  }
}

/**
 * Instant ferry gate.
 * Soft-field bush: blocked either end (must fly bush trips).
 * Trip-only strips: ferry allowed both ways so light GA can reposition to a
 * bush-trip start (Accept requires parked GA there). Soft-field bush stays closed.
 */
export function assertFerryNotBush(
  originIcao: string,
  destIcao: string,
): void {
  const origin = originIcao.trim().toUpperCase();
  const dest = destIcao.trim().toUpperCase();
  if (isBushHub(origin) || isBushHub(dest)) {
    throw new Error(
      'Bush strips require a flown mission — ferry unavailable (Hangar: Plan empty flight)',
    );
  }
}

/** Pay multiplier for bush freight (applied in formLots). */
export function bushLotPayMult(
  originIcao: string,
  destIcao: string,
  commodityId: string,
): number {
  const fromBush = isBushHub(originIcao);
  const toBush = isBushHub(destIcao);
  if (!fromBush && !toBush) return 1;
  if (fromBush && commodityId === 'electronics') return 1.4;
  if (toBush && (commodityId === 'supplies' || commodityId === 'general')) {
    return 1.18;
  }
  if (fromBush || toBush) return 1.08;
  return 1;
}
