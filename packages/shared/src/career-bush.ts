/**
 * Legacy bush / bush-trip helpers — feature removed 2026-09-03.
 * Soft-field strips are normal spokes; FAA trip-only locals dropped from catalog.
 * Stubs kept so call sites compile until fully deleted.
 */

export type BushCountryId = 'BR' | 'US' | 'CA' | 'MX';

/** @deprecated Empty — bush gateways retired with bush trips. */
export const BUSH_GATEWAYS_BY_COUNTRY: Readonly<
  Record<BushCountryId, readonly string[]>
> = {
  BR: [],
  US: [],
  CA: [],
  MX: [],
} as const;

/** @deprecated */
export const BUSH_GATEWAY_ICAOS: readonly string[] = [];

export function listBushIcaos(): string[] {
  return [];
}

export function listBushTripOnlyIcaos(): string[] {
  return [];
}

export function isBushHub(_icao: string | null | undefined): boolean {
  return false;
}

export function isBushTripOnlyHub(_icao: string | null | undefined): boolean {
  return false;
}

export function isBushOrTripOnlyHub(_icao: string | null | undefined): boolean {
  return false;
}

/** Soft-field / trip-only were offline for Market; always false now. */
export function isOfflineNetworkHub(_icao: string | null | undefined): boolean {
  return false;
}

export function bushCountryOf(_icao: string | null | undefined): BushCountryId | null {
  return null;
}

/** @deprecated alias */
export function bushCountryForIcao(
  icao: string | null | undefined,
): BushCountryId | undefined {
  return bushCountryOf(icao) ?? undefined;
}

/** Always allow — bush OD restrictions removed. */
export function isBushFreightOdAllowed(
  _originIcao: string,
  _destIcao: string,
): boolean {
  return true;
}

export function bushRequiresLightGa(
  _originIcao: string,
  _destIcao: string,
): boolean {
  return false;
}

export function assertBushLightGa(
  _originIcao: string,
  _destIcao: string,
  _aircraftClassId: string,
): void {
  /* no-op */
}

export function assertFerryNotBush(
  _originIcao: string,
  _destIcao?: string,
): void {
  /* no-op */
}

export function bushLotPayMult(
  _originIcao: string,
  _destIcao: string,
  _commodityId: string,
): number {
  return 1;
}

export function isBushGateway(_icao: string | null | undefined): boolean {
  return false;
}
