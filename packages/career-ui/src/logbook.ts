import type { Mission } from './api';
import { aircraftClassLabel } from './AircraftCards';

export type LogbookFlightKind = 'Contract' | 'Ferry' | 'Charter' | 'Normal';

/** Contract crew / empty reposition / player freight. */
export function logbookFlightKind(mission: Mission): LogbookFlightKind {
  if (mission.missionType === 'charter') return 'Charter';
  if (
    mission.emptyFlight ||
    mission.crewDeadhead ||
    mission.contractPilotReposition
  ) {
    return 'Ferry';
  }
  if (mission.contractPilot) return 'Contract';
  return 'Normal';
}

export function logbookStatusLabel(status: string): string {
  if (status === 'in_flight') return 'In flight';
  if (status === 'dispatched') return 'Dispatched';
  if (status === 'accepted') return 'Accepted';
  if (status === 'settled') return 'Settled';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'failed') return 'Failed';
  return status.replace(/_/g, ' ');
}

/**
 * Hangar / catalog airframe name. Never SimBrief ICAO — C172/BE36/C208 are
 * shared by several addons, including ones not homologated on that OFP type.
 *
 * Prefer API `airframeLabel` (withMissionClientView). Some write paths used to
 * return raw missions and wipe the label — fall back to typeId before class.
 */
export function logbookAircraftLabel(
  mission: Mission,
  opts?: {
    fleetLabel?: string | null;
  },
): string {
  const catalog = mission.airframeLabel?.trim();
  if (catalog) return catalog;
  const fleet = opts?.fleetLabel?.trim();
  if (fleet) return fleet;
  const fromType = labelFromAirframeTypeId(mission.airframeTypeId);
  if (fromType) return fromType;
  return aircraftClassLabel(mission.aircraftClassId);
}

/** Browser-safe last resort when API omitted airframeLabel. */
export function labelFromAirframeTypeId(
  airframeTypeId: string | null | undefined,
): string | null {
  const raw = airframeTypeId?.trim();
  if (!raw) return null;
  const parts = raw.split('-').filter(Boolean);
  if (parts.length === 0) return null;
  const head = parts[0]!.toLowerCase();
  if (TYPE_ID_PUBLISHER_PREFIXES.has(head)) parts.shift();
  if (parts.length === 0) return null;
  return parts
    .map((part) => {
      if (/^\d/.test(part) || /[a-z]+\d|\d+[a-z]/i.test(part)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

const TYPE_ID_PUBLISHER_PREFIXES = new Set([
  'microsoft',
  'asobo',
  'blacksquare',
  'blackbox',
  'blackbird',
  'workingtitle',
  'justflight',
  'inibuilds',
  'flysimware',
  'flightfx',
  'fsreborn',
  'nextgensim',
  'leonardo',
  'carenado',
  'fenix',
  'pmdg',
  'toliss',
  'tfdi',
  'skyward',
  'a2a',
  'sws',
]);

export function logbookDistanceNm(mission: Mission): number | null {
  const fromApi = mission.distanceNm;
  if (typeof fromApi === 'number' && Number.isFinite(fromApi) && fromApi > 0) {
    return Math.round(fromApi);
  }
  const fromOfp = mission.lastOfpCheck?.briefing?.distanceNm;
  if (typeof fromOfp === 'number' && Number.isFinite(fromOfp) && fromOfp > 0) {
    return Math.round(fromOfp);
  }
  return null;
}

export function logbookCargoLabel(
  mission: Mission,
  formatMass: (kg: number) => string,
): string {
  if (mission.missionType === 'charter') {
    return `${mission.pax ?? 0} pax · ${formatMass(mission.baggageKg ?? 0)} baggage`;
  }
  if (mission.cargoKg <= 0 || logbookFlightKind(mission) === 'Ferry') {
    return 'Empty';
  }
  const commodity = humanizeCommodityId(mission.commodityId);
  return commodity
    ? `${formatMass(mission.cargoKg)} ${commodity}`
    : formatMass(mission.cargoKg);
}

function humanizeCommodityId(id: string | undefined): string {
  if (!id) return '';
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Settled payout when known; otherwise offered contract pay (active legs).
 * Prefer {@link Mission.pilotPayoutUsd} (member cut / IH fee) over route gross. */
export function logbookPayoutUsd(mission: Mission): number | null {
  if (mission.status === 'cancelled' || mission.status === 'failed') {
    return null;
  }
  if (
    typeof mission.pilotPayoutUsd === 'number' &&
    Number.isFinite(mission.pilotPayoutUsd)
  ) {
    return mission.pilotPayoutUsd;
  }
  if (typeof mission.payoutUsd === 'number' && Number.isFinite(mission.payoutUsd)) {
    return mission.payoutUsd;
  }
  if (typeof mission.payUsd === 'number' && Number.isFinite(mission.payUsd)) {
    return mission.payUsd;
  }
  return null;
}

/** True when the shown pay is the pilot home cut (below route gross). */
export function logbookPayoutIsPilotCut(mission: Mission): boolean {
  if (
    typeof mission.pilotPayoutUsd !== 'number' ||
    !Number.isFinite(mission.pilotPayoutUsd)
  ) {
    return false;
  }
  if (
    typeof mission.payoutUsd !== 'number' ||
    !Number.isFinite(mission.payoutUsd)
  ) {
    return false;
  }
  return mission.pilotPayoutUsd < mission.payoutUsd - 0.5;
}

/** VA aircraft / VA ops (listed company or Internal Haul). */
export function logbookIsVaFlight(mission: Mission): boolean {
  return (
    mission.vaFlight === true ||
    (mission.warehouseBridge === true && mission.internalHaul === true)
  );
}

/**
 * Union home + VA tenant mission lists for Logbook (unique by id).
 * Later list wins on id collision so VA enrichment (`vaFlight`) can override.
 */
export function mergeLogbookMissions(
  primary: readonly Mission[],
  secondary: readonly Mission[],
): Mission[] {
  const byId = new Map<string, Mission>();
  for (const mission of primary) {
    const id = mission.id?.trim();
    if (id) byId.set(id, mission);
  }
  for (const mission of secondary) {
    const id = mission.id?.trim();
    if (id) byId.set(id, mission);
  }
  return [...byId.values()];
}

/**
 * VA company missions file is shared — Logbook must only show legs this pilot flew.
 * Prefer {@link Mission.pilotAccountId}; fall back to {@link Mission.pilotHomeCompanyId}.
 * Fully unstamped legs: optional legacy include (VA owner only).
 */
export function filterVaMissionsForPilot(
  missions: readonly Mission[],
  opts: {
    viewerAccountId: string;
    viewerHomeCompanyId?: string | null;
    includeUnstampedLegacy?: boolean;
  },
): Mission[] {
  const accountId = opts.viewerAccountId.trim();
  if (!accountId) return [];
  const homeId = opts.viewerHomeCompanyId?.trim() || '';
  return missions.filter((mission) => {
    const pilot = mission.pilotAccountId?.trim();
    if (pilot) return pilot === accountId;
    const home = mission.pilotHomeCompanyId?.trim();
    if (home && homeId) return home === homeId;
    return opts.includeUnstampedLegacy === true;
  });
}

/** Roster display name for a VA company logbook row. */
export function vaLogbookPilotLabel(
  mission: Mission,
  namesByAccountId: Readonly<Record<string, string>>,
): string {
  const id = mission.pilotAccountId?.trim();
  if (id) {
    const named = namesByAccountId[id]?.trim();
    if (named) return named;
    return id;
  }
  return 'Unknown pilot';
}

/** Company Logbook pay — route gross, not the member cut. */
export function logbookCompanyPayoutUsd(mission: Mission): number | null {
  if (mission.status === 'cancelled' || mission.status === 'failed') {
    return null;
  }
  if (typeof mission.payoutUsd === 'number' && Number.isFinite(mission.payoutUsd)) {
    return mission.payoutUsd;
  }
  if (typeof mission.payUsd === 'number' && Number.isFinite(mission.payUsd)) {
    return mission.payUsd;
  }
  return null;
}

const HOURS_PER_TICK = 0.25;
const HOURS_PER_DAY = 24;

/** Economy day/time from a tick (same mold as the World topbar clock). */
export function formatEconomyClock(continuousTicks: number): string {
  const totalMinutes = Math.max(
    0,
    Math.floor(continuousTicks * HOURS_PER_TICK * 60),
  );
  const day = Math.floor(totalMinutes / (HOURS_PER_DAY * 60)) + 1;
  const rem = totalMinutes % (HOURS_PER_DAY * 60);
  const hour = Math.floor(rem / 60);
  const minute = rem % 60;
  return `Day ${day} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatFlightDurationMs(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Block / airborne time for the logbook.
 * Prefer settled Watch duration; else planned route; else OFP block; else tick span.
 */
export function logbookFlightDurationLabel(mission: Mission): string | null {
  const settled = mission.settledFlightDurationMs;
  if (typeof settled === 'number' && Number.isFinite(settled) && settled > 0) {
    return formatFlightDurationMs(settled);
  }
  const planned = mission.expectedRouteMs;
  if (typeof planned === 'number' && Number.isFinite(planned) && planned > 0) {
    const label = formatFlightDurationMs(planned);
    return mission.status === 'settled' || mission.status === 'failed'
      ? label
      : `~${label}`;
  }
  const ofpBlock = mission.lastOfpCheck?.briefing?.blockTime?.trim();
  if (ofpBlock) return ofpBlock;
  if (
    typeof mission.departedAtTick === 'number' &&
    typeof mission.settledAtTick === 'number' &&
    mission.settledAtTick > mission.departedAtTick
  ) {
    const ticks = mission.settledAtTick - mission.departedAtTick;
    return formatFlightDurationMs(ticks * 15 * 60 * 1000);
  }
  return null;
}

/**
 * When the flight happened in world time (settle → depart → accept).
 */
export function logbookFlightWhenLabel(mission: Mission): string | null {
  const tick =
    (typeof mission.settledAtTick === 'number' && Number.isFinite(mission.settledAtTick)
      ? mission.settledAtTick
      : undefined) ??
    (typeof mission.departedAtTick === 'number' && Number.isFinite(mission.departedAtTick)
      ? mission.departedAtTick
      : undefined) ??
    (typeof mission.acceptedAtTick === 'number' && Number.isFinite(mission.acceptedAtTick)
      ? mission.acceptedAtTick
      : undefined);
  if (tick == null) return null;
  return formatEconomyClock(tick);
}
