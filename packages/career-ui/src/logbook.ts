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

/** Prefer concrete model (OFP ICAO / catalog label), not just class. */
export function logbookAircraftLabel(
  mission: Mission,
  opts?: {
    fleetLabel?: string | null;
  },
): string {
  const catalog = mission.airframeLabel?.trim();
  if (catalog) return catalog;
  const ofpIcao = mission.lastOfpCheck?.briefing?.aircraftIcao?.trim();
  if (ofpIcao) return ofpIcao.toUpperCase();
  const fleet = opts?.fleetLabel?.trim();
  if (fleet) return fleet;
  return aircraftClassLabel(mission.aircraftClassId);
}

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
