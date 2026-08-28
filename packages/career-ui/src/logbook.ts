import type { Mission } from './api';
import { aircraftClassLabel } from './AircraftCards';

export type LogbookFlightKind = 'Contract' | 'Ferry' | 'Normal';

/** Contract crew / empty reposition / player freight. */
export function logbookFlightKind(mission: Mission): LogbookFlightKind {
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

/** Settled payout when known; otherwise offered contract pay (active legs). */
export function logbookPayoutUsd(mission: Mission): number | null {
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
