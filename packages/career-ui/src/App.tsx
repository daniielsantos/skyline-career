import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAirport,
  fetchCargoLimit,
  fetchMarket,
  fetchMissions,
  fetchNpcFleet,
  fetchRouteLots,
  fetchState,
  fetchWatchStatus,
  fetchSimBridgeStatus,
  postCancel,
  postConfirmOfp,
  postDepart,
  postDispatch,
  postFuelPurchase,
  postFuelQuote,
  postInitBrazil,
  postLoadOfp,
  postPreflight,
  postSettle,
  postSelectHub,
  postAcquireAircraft,
  postFerry,
  postStagingCommit,
  postTick,
  postWatchStart,
  postWatchStop,
  type AircraftClass,
  type AirportLot,
  type AirportMovement,
  type AirportView,
  type EconomyEvent,
  type MarketLot,
  type MissionFuelQuote,
  type Mission,
  type NpcActivity,
  type NpcFleetMember,
  type PlayerAircraft,
  type RegionPressure,
  type SimBridgeStatus,
  type WatchStatus,
} from './api';
import {
  pathForLocation,
  readCareerLocation,
  writeCareerLocation,
  type CareerTab,
} from './routes';
import { useConfirm } from './ConfirmDialog';
import {
  displayToKg,
  formatMass,
  formatMassExact,
  formatWeightText,
  KG_TO_LB,
  kgToDisplay,
  loadWeightSystem,
  massUnitLabel,
  massUnitLong,
  saveWeightSystem,
  type WeightSystem,
} from './weight-units';

type Tab = CareerTab;
type TerminalSection = 'inventory' | 'contracts' | 'movements';
type MarketSortKey = 'distance' | 'cargo' | 'load' | 'expires' | 'pay';
type SortDirection = 'asc' | 'desc';

const MARKET_PAGE_SIZE = 10;
const MAX_STAGING_LOTS = 5;
const SIMBRIEF_USER_KEY = 'skyline.simbriefUser';
/** Career economy: 1 tick = 1 simulated hour. */
const HOURS_PER_TICK = 1;
const HOURS_PER_DAY = 24;
const MS_PER_TICK_DEFAULT = 3_600_000;

type StagingLine = {
  lot: MarketLot;
  cargoKg: number;
};

type StagingDraft = {
  originIcao: string;
  destIcao: string;
  originName: string;
  destName: string;
  aircraft: AircraftClass;
  aircraftId?: string;
  intoMissionId?: string;
  /** When true, commit replaces the full manifest instead of appending. */
  replaceManifest?: boolean;
  lines: StagingLine[];
};

function lotQuantityKg(lot: MarketLot): number {
  const qty = Number(lot.quantityKg);
  if (Number.isFinite(qty) && qty > 0) return qty;
  return Math.max(1, lot.availableKg);
}

function proRataPayUsd(lot: MarketLot, cargoKg: number): number {
  return Math.max(1, Math.round((cargoKg / lotQuantityKg(lot)) * lot.payUsd));
}

function defaultStagingKg(maxKg: number): number {
  if (maxKg <= 0) return 0;
  const half = Math.floor(maxKg / 200) * 100;
  return Math.min(maxKg, Math.max(Math.min(100, maxKg), half || Math.min(100, maxKg)));
}

function formatTonnes(kg: number, system?: WeightSystem): string {
  return formatMass(kg, system ?? activeWeightSystem);
}

/** Updated by App so module-level formatters respect Settings. */
let activeWeightSystem: WeightSystem = loadWeightSystem();

function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

function aircraftClassLabel(id: string): string {
  if (id === 'wide_freighter') return 'Wide';
  if (id === 'light_turboprop') return 'Caravan';
  if (id === 'light_ga') return 'Bonanza';
  if (id === 'narrow_freighter') return 'Narrow';
  return id.replace(/_/g, ' ');
}

function regionLabel(region: string): string {
  switch (region) {
    case 'BR-S':
      return 'Brazil — South';
    case 'BR-SE':
      return 'Brazil — Southeast';
    case 'BR-NE':
      return 'Brazil — Northeast';
    case 'BR-N':
      return 'Brazil — North';
    case 'BR-CW':
    case 'BR-CO':
      return 'Brazil — Central-West';
    default:
      return region;
  }
}

function RegionPressureChips(props: {
  regions: RegionPressure[];
  className?: string;
}) {
  const thin = props.regions.filter((r) => r.thinFleet);
  const wx = props.regions.filter(
    (r) => r.weather === 'marginal' || r.weather === 'poor',
  );
  if (thin.length === 0 && wx.length === 0) return null;
  return (
    <div className={props.className ?? 'pressure-chips'}>
      {thin.map((r) => (
        <span
          key={`thin-${r.region}`}
          className="tag pressure"
          title={`${regionLabel(r.region)}: ${r.ready}/${r.total} ready to bid · ${r.resting} resting — thinner local fleet tends to raise outbound freights`}
        >
          {r.region} thin fleet
        </span>
      ))}
      {wx.map((r) => (
        <span
          key={`wx-${r.region}`}
          className={`tag weather ${r.weather}`}
          title={`${regionLabel(r.region)}: simulated ${r.weather} weather today — freights pay more / expire sooner; local NPCs bid less`}
        >
          {r.region} {r.weather}
        </span>
      ))}
    </div>
  );
}

function fallbackMaxCargoKg(aircraft: AircraftClass): number {
  if (aircraft === 'wide_freighter') return 90_000;
  if (aircraft === 'light_turboprop') return 1_704;
  if (aircraft === 'light_ga') return 450;
  return 18_137;
}

function aircraftMaxRangeNm(aircraft: AircraftClass): number {
  if (aircraft === 'wide_freighter') return 6_000;
  if (aircraft === 'light_turboprop') return 900;
  if (aircraft === 'light_ga') return 800;
  return 2_500;
}

function estimateFuelUpliftKg(aircraft: AircraftClass, distanceNm: number): number {
  const taxi =
    aircraft === 'wide_freighter'
      ? 900
      : aircraft === 'light_turboprop'
        ? 40
        : aircraft === 'light_ga'
          ? 20
          : 400;
  const burn =
    aircraft === 'wide_freighter'
      ? 12
      : aircraft === 'light_turboprop'
        ? 0.8
        : aircraft === 'light_ga'
          ? 0.35
          : 5;
  return Math.max(taxi, Math.round(taxi + burn * Math.max(0, distanceNm)));
}

function isActiveMissionStatus(status: string): boolean {
  return status === 'accepted' || status === 'dispatched' || status === 'in_flight';
}

function findActiveMission(missions: Mission[]): Mission | undefined {
  const active = missions.filter((m) => isActiveMissionStatus(m.status));
  if (active.length === 0) return undefined;
  return active.reduce((best, mission) =>
    (mission.acceptedAtTick ?? 0) >= (best.acceptedAtTick ?? 0) ? mission : best,
  );
}

function preferredLoadMethod(
  mission: Mission,
): 'native-simbrief' | 'direct-injection' {
  if (mission.loadMethod === 'native-simbrief' || mission.loadMethod === 'direct-injection') {
    return mission.loadMethod;
  }
  return mission.aircraftClassId === 'light_turboprop' ||
    mission.aircraftClassId === 'light_ga'
    ? 'direct-injection'
    : 'native-simbrief';
}

function missionInjectCapable(mission: Mission): boolean {
  if (typeof mission.injectCapable === 'boolean') return mission.injectCapable;
  return preferredLoadMethod(mission) === 'direct-injection';
}

/** Format a duration; shows minutes when under 2 hours. */
function formatDuration(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(Math.abs(hours) * 60 * HOURS_PER_TICK));
  if (totalMinutes < 120) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h <= 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < HOURS_PER_DAY) {
    return `${totalHours}h`;
  }
  const days = Math.floor(totalHours / HOURS_PER_DAY);
  const rem = totalHours % HOURS_PER_DAY;
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}

/** Continuous clock from fractional economy hours: Day 1 · 14:37 */
function formatClock(continuousHours: number): string {
  const totalMinutes = Math.max(0, Math.floor(continuousHours * 60));
  const day = Math.floor(totalMinutes / (HOURS_PER_DAY * 60)) + 1;
  const rem = totalMinutes % (HOURS_PER_DAY * 60);
  const hour = Math.floor(rem / 60);
  const minute = rem % 60;
  return `Day ${day} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatExpiry(opts: {
  expiresAtTick: number;
  ticksRemaining?: number;
  currentTick: number;
  continuousHours: number;
}): string {
  const remaining =
    opts.ticksRemaining ?? Math.max(0, opts.expiresAtTick - opts.currentTick);
  if (opts.currentTick >= opts.expiresAtTick) {
    return `Expired (${formatClock(opts.expiresAtTick)})`;
  }
  // Soft continuous remaining within the current hour.
  const frac = opts.continuousHours - opts.currentTick;
  const continuousRemaining = Math.max(0, remaining - Math.min(1, Math.max(0, frac)));
  return `Expires in ${formatDuration(continuousRemaining)} · ${formatClock(opts.expiresAtTick)}`;
}

function formatDeadline(deadlineTick: number, continuousHours: number): string {
  const delta = deadlineTick - continuousHours;
  if (delta < 0) {
    return `Overdue by ${formatDuration(Math.abs(delta))} · was ${formatClock(deadlineTick)}`;
  }
  if (delta < 1 / 60) {
    return `Due now (${formatClock(deadlineTick)})`;
  }
  return `Due in ${formatDuration(delta)} · ${formatClock(deadlineTick)}`;
}

function liveProgress(opts: {
  departedAtMs?: number;
  arrivesAtMs?: number;
  nowMs: number;
  fallbackPct?: number;
}): number {
  if (
    typeof opts.departedAtMs === 'number' &&
    typeof opts.arrivesAtMs === 'number' &&
    opts.arrivesAtMs > opts.departedAtMs
  ) {
    const duration = opts.arrivesAtMs - opts.departedAtMs;
    const flown = Math.min(duration, Math.max(0, opts.nowMs - opts.departedAtMs));
    return Math.min(100, Math.round((flown / duration) * 100));
  }
  return opts.fallbackPct ?? 0;
}

function liveEtaHours(opts: {
  arrivesAtMs?: number;
  nowMs: number;
  fallbackHours?: number;
}): number {
  if (typeof opts.arrivesAtMs === 'number') {
    return Math.max(0, (opts.arrivesAtMs - opts.nowMs) / MS_PER_TICK_DEFAULT);
  }
  return opts.fallbackHours ?? 0;
}

function livePhase(
  etaHours: number,
  fallback?: string,
): 'enroute' | 'arriving' | string {
  if (etaHours <= 1) return 'arriving';
  if (fallback === 'boarding' || fallback === 'turnaround' || fallback === 'idle') {
    return fallback;
  }
  return 'enroute';
}

function loadSimbriefUser(): string {
  try {
    return localStorage.getItem(SIMBRIEF_USER_KEY) ?? '';
  } catch {
    return '';
  }
}

function IcaoLink(props: {
  icao: string;
  onOpen: (icao: string) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icao-link"
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        props.onOpen(props.icao);
      }}
      title={`Open ${props.icao} terminal`}
    >
      {props.icao}
    </button>
  );
}

function LotExpiry(props: {
  lot: MarketLot | AirportLot;
  tick: number;
  continuousHours: number;
}) {
  const remaining =
    'ticksRemaining' in props.lot && props.lot.ticksRemaining !== undefined
      ? props.lot.ticksRemaining
      : Math.max(0, props.lot.expiresAtTick - props.tick);
  const overdue = props.tick >= props.lot.expiresAtTick;
  return (
    <span className={overdue ? 'expiry overdue' : remaining <= 6 ? 'expiry soon' : 'expiry'}>
      {formatExpiry({
        expiresAtTick: props.lot.expiresAtTick,
        ticksRemaining: remaining,
        currentTick: props.tick,
        continuousHours: props.continuousHours,
      })}
    </span>
  );
}

function NpcTakenBadge(props: {
  claim?: { npcName: string; cargoKg: number; etaHours: number; arrivesAtMs?: number } | null;
  nowMs: number;
  weightSystem?: WeightSystem;
}) {
  if (!props.claim) return null;
  const eta = liveEtaHours({
    arrivesAtMs: props.claim.arrivesAtMs,
    nowMs: props.nowMs,
    fallbackHours: props.claim.etaHours,
  });
  return (
    <span
      className="npc-badge"
      title={`${formatTonnes(props.claim.cargoKg, props.weightSystem)} reserved by NPC`}
    >
      Taken by {props.claim.npcName} · ETA {formatDuration(eta)}
    </span>
  );
}

function ProgressTrack(props: { pct: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, props.pct));
  return (
    <div className="progress-track" title={props.label ?? `${pct}%`}>
      <span style={{ width: `${pct}%` }} />
      <em>{pct}%</em>
    </div>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'arriving':
      return 'Arriving';
    case 'enroute':
      return 'En route';
    case 'turnaround':
      return 'Turnaround';
    case 'resting':
      return 'Resting';
    case 'boarding':
      return 'Boarding';
    case 'idle':
      return 'Idle';
    default:
      return phase;
  }
}

function NpcActivityList(props: {
  rows: NpcActivity[];
  onOpen: (icao: string) => void;
  busy?: boolean;
  empty?: string;
  nowMs: number;
  weightSystem?: WeightSystem;
}) {
  if (props.rows.length === 0) {
    return props.empty ? <p className="empty">{props.empty}</p> : null;
  }
  return (
    <ul className="contract-list npc-list">
      {props.rows.map((row) => {
        const eta = liveEtaHours({
          arrivesAtMs: row.arrivesAtMs,
          nowMs: props.nowMs,
          fallbackHours: row.etaHours,
        });
        const pct = liveProgress({
          departedAtMs: row.departedAtMs,
          arrivesAtMs: row.arrivesAtMs,
          nowMs: props.nowMs,
          fallbackPct: row.progressPct,
        });
        const phase = livePhase(eta, row.phase);
        return (
          <li key={row.id}>
            <div className="route">
              <IcaoLink icao={row.originIcao} onOpen={props.onOpen} disabled={props.busy} />
              <span className="arrow">→</span>
              <IcaoLink icao={row.destIcao} onOpen={props.onOpen} disabled={props.busy} />
              {row.urgency === 'urgent' ? <span className="tag">Urgent</span> : null}
              <span className={`phase-tag phase-${phase}`}>{phaseLabel(phase)}</span>
            </div>
            <p>
              {row.npcName} · {row.commodityName} ·{' '}
              {formatTonnes(row.cargoKg, props.weightSystem)} · ETA{' '}
              {formatDuration(eta)}
            </p>
            <ProgressTrack pct={pct} label={`${row.flightHours ?? '?'}h block`} />
            <small>
              {row.aircraftLabel ?? row.aircraftClassId}
              {row.homeRegion ? ` · home ${row.homeRegion}` : ''} ·{' '}
              {Math.round(row.distanceNm).toLocaleString()} nm · {formatMoney(row.payUsd)}
            </small>
          </li>
        );
      })}
    </ul>
  );
}

function MovementBoard(props: {
  title: string;
  rows: AirportMovement[];
  onOpen: (icao: string) => void;
  busy?: boolean;
  empty: string;
  mode: 'arrivals' | 'departures';
  nowMs: number;
  weightSystem?: WeightSystem;
}) {
  return (
    <div className="movement-board">
      <h3>{props.title}</h3>
      {props.rows.length === 0 ? (
        <p className="empty">{props.empty}</p>
      ) : (
        <ul className="movement-list">
          {props.rows.map((row) => {
            const other = props.mode === 'arrivals' ? row.originIcao : row.destIcao;
            const eta = liveEtaHours({
              arrivesAtMs: row.arrivesAtMs,
              nowMs: props.nowMs,
              fallbackHours: row.etaHours,
            });
            const pct = liveProgress({
              departedAtMs: row.departedAtMs,
              arrivesAtMs: row.arrivesAtMs,
              nowMs: props.nowMs,
              fallbackPct: row.progressPct,
            });
            const phase =
              row.phase === 'boarding' || row.phase === 'turnaround'
                ? row.phase
                : livePhase(eta, row.phase);
            return (
              <li key={`${row.kind}-${row.id}`} className={`movement movement-${row.kind}`}>
                <div className="movement-head">
                  <strong>{row.operatorName}</strong>
                  <span className={`phase-tag phase-${phase}`}>{phaseLabel(phase)}</span>
                  {row.kind === 'player' ? <span className="tag you">You</span> : null}
                  {row.urgency === 'urgent' ? <span className="tag">Urgent</span> : null}
                </div>
                <div className="route">
                  {props.mode === 'arrivals' ? (
                    <>
                      <span className="muted">from</span>
                      <IcaoLink icao={other} onOpen={props.onOpen} disabled={props.busy} />
                    </>
                  ) : (
                    <>
                      <span className="muted">to</span>
                      <IcaoLink icao={other} onOpen={props.onOpen} disabled={props.busy} />
                    </>
                  )}
                </div>
                <p>
                  {row.commodityName} · {formatTonnes(row.cargoKg, props.weightSystem)}
                  {props.mode === 'arrivals'
                    ? ` · ETA ${formatDuration(eta)}`
                    : row.phase === 'boarding'
                      ? ' · not departed'
                      : ` · ${pct}% outbound`}
                </p>
                <ProgressTrack pct={pct} />
                <small>
                  {row.aircraftLabel ?? row.aircraftClassId}
                  {row.distanceNm !== undefined
                    ? ` · ${Math.round(row.distanceNm).toLocaleString()} nm`
                    : ''}
                  {typeof row.arrivesAtMs === 'number'
                    ? ` · ETA ${formatDuration(eta)}`
                    : ''}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FleetRoster(props: {
  fleet: NpcFleetMember[];
  onOpen: (icao: string) => void;
  busy?: boolean;
  nowMs: number;
  weightSystem?: WeightSystem;
}) {
  if (props.fleet.length === 0) {
    return <p className="empty">No NPC fleet seeded yet — Reset Brazil or wait for migration.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="fleet-table">
        <thead>
          <tr>
            <th>Operator</th>
            <th>Aircraft</th>
            <th>Home</th>
            <th>Status</th>
            <th>Mission</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          {props.fleet.map((npc) => {
            const mission = npc.mission;
            const eta = mission
              ? liveEtaHours({
                  arrivesAtMs: mission.arrivesAtMs,
                  nowMs: props.nowMs,
                  fallbackHours: mission.etaHours,
                })
              : 0;
            const pct = mission
              ? liveProgress({
                  departedAtMs: mission.departedAtMs,
                  arrivesAtMs: mission.arrivesAtMs,
                  nowMs: props.nowMs,
                  fallbackPct: mission.progressPct,
                })
              : 0;
            const turnaroundLeft =
              npc.phase === 'turnaround' && typeof npc.busyUntilMs === 'number'
                ? Math.max(0, (npc.busyUntilMs - props.nowMs) / MS_PER_TICK_DEFAULT)
                : npc.turnaroundHoursLeft;
            const restLeft =
              npc.phase === 'resting' && typeof npc.restUntilMs === 'number'
                ? Math.max(0, (npc.restUntilMs - props.nowMs) / MS_PER_TICK_DEFAULT)
                : npc.restHoursLeft;
            const phase =
              mission != null
                ? livePhase(eta, mission.phase)
                : npc.phase === 'turnaround' && (turnaroundLeft ?? 0) <= 0
                  ? 'idle'
                  : npc.phase === 'resting' && (restLeft ?? 0) <= 0
                    ? 'idle'
                    : npc.phase;
            return (
              <tr key={npc.id} className={`fleet-row phase-${phase}`}>
                <td>
                  <strong>{npc.name}</strong>
                  <small>
                    rel {(npc.reliability * 100).toFixed(0)}% · agg{' '}
                    {(npc.aggressiveness * 100).toFixed(0)}%
                  </small>
                </td>
                <td>
                  {aircraftClassLabel(npc.aircraftClassId)}
                  <small>{npc.aircraftLabel}</small>
                </td>
                <td title={regionLabel(npc.homeRegion)}>{npc.homeRegion}</td>
                <td>
                  <span
                    className={`phase-tag phase-${phase}`}
                    title={
                      phase === 'resting'
                        ? `Crew rest after duty day${
                            typeof npc.dutyHoursAccum === 'number'
                              ? ` · ${npc.dutyHoursAccum.toFixed(1)}h duty`
                              : ''
                          } · back in ${formatDuration(restLeft ?? 0)}`
                        : phase === 'turnaround'
                          ? `Ground turnaround · free in ${formatDuration(turnaroundLeft ?? 0)}`
                          : undefined
                    }
                  >
                    {phaseLabel(phase)}
                  </span>
                  {phase === 'turnaround' && turnaroundLeft !== undefined ? (
                    <small>free in {formatDuration(turnaroundLeft)}</small>
                  ) : null}
                  {phase === 'resting' && restLeft !== undefined ? (
                    <small>back in {formatDuration(restLeft)}</small>
                  ) : null}
                </td>
                <td>
                  {mission ? (
                    <>
                      <div className="route">
                        <IcaoLink
                          icao={mission.originIcao}
                          onOpen={props.onOpen}
                          disabled={props.busy}
                        />
                        <span className="arrow">→</span>
                        <IcaoLink
                          icao={mission.destIcao}
                          onOpen={props.onOpen}
                          disabled={props.busy}
                        />
                        {mission.urgency === 'urgent' ? (
                          <span className="tag">Urgent</span>
                        ) : null}
                      </div>
                      <small>
                        {mission.commodityName} ·{' '}
                        {formatTonnes(mission.cargoKg, props.weightSystem)} · ETA{' '}
                        {formatDuration(eta)} · {formatMoney(mission.payUsd)}
                      </small>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {mission ? <ProgressTrack pct={pct} /> : <span className="muted">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function App() {
  const { confirm, confirmDialog } = useConfirm();
  const initialLocation = readCareerLocation();
  const [tab, setTab] = useState<Tab>(initialLocation.tab);
  const [airportIcao, setAirportIcao] = useState<string | null>(
    initialLocation.airportIcao,
  );
  const [airportView, setAirportView] = useState<AirportView | null>(null);
  const [terminalSection, setTerminalSection] =
    useState<TerminalSection>('inventory');
  const [preferredAircraft, setPreferredAircraft] =
    useState<AircraftClass>('narrow_freighter');
  const [tick, setTick] = useState(0);
  const [lastBatchAtMs, setLastBatchAtMs] = useState(Date.now());
  const [msPerTick, setMsPerTick] = useState(MS_PER_TICK_DEFAULT);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [displayNowMs, setDisplayNowMs] = useState(Date.now());
  const [wallet, setWallet] = useState(0);
  const [lots, setLots] = useState<MarketLot[]>([]);
  const [marketEvents, setMarketEvents] = useState<EconomyEvent[]>([]);
  const [npcActivity, setNpcActivity] = useState<NpcActivity[]>([]);
  const [npcBusy, setNpcBusy] = useState(0);
  const [npcFleet, setNpcFleet] = useState<NpcFleetMember[]>([]);
  const [npcSummary, setNpcSummary] = useState({
    airborne: 0,
    turnaround: 0,
    resting: 0,
    idle: 0,
  });
  const [regionPressure, setRegionPressure] = useState<RegionPressure[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'ok' | 'warn' | 'fail'>('ok');
  const [simbriefUser, setSimbriefUser] = useState(loadSimbriefUser);
  const [weightSystem, setWeightSystem] = useState<WeightSystem>(loadWeightSystem);
  const [ofpAutoStatus, setOfpAutoStatus] =
    useState<'idle' | 'waiting' | 'checking'>('idle');
  const [loadOfpAutoStatus, setLoadOfpAutoStatus] = useState<
    'idle' | 'waiting' | 'loading' | 'done' | 'failed'
  >('idle');
  const [loadOfpAutoError, setLoadOfpAutoError] = useState<string | null>(null);
  const [loadOfpRetryToken, setLoadOfpRetryToken] = useState(0);
  const [preferManualLoad, setPreferManualLoad] = useState(false);
  const autoLoadedOfpKeyRef = useRef<string | null>(null);
  const [missionFuelQuote, setMissionFuelQuote] = useState<{
    quote: MissionFuelQuote;
    walletUsd: number;
    walletAfterUsd: number;
  } | null>(null);
  const [missionFuelQuoteStatus, setMissionFuelQuoteStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [missionFuelQuoteError, setMissionFuelQuoteError] = useState<string | null>(
    null,
  );
  const [missionFuelQuoteRetryToken, setMissionFuelQuoteRetryToken] = useState(0);
  const [watchAutoStatus, setWatchAutoStatus] = useState<
    'idle' | 'waiting' | 'connecting' | 'blocked'
  >('idle');
  const [watchAutoPaused, setWatchAutoPaused] = useState(false);
  const [maxCargoKg, setMaxCargoKg] = useState<number | null>(null);
  const [structuralMaxCargoKg, setStructuralMaxCargoKg] =
    useState<number | null>(null);
  const [estimatedBlockFuelKg, setEstimatedBlockFuelKg] =
    useState<number | null>(null);
  const [routeFuelCapacityKg, setRouteFuelCapacityKg] =
    useState<number | null>(null);
  const [routeFuelDeficitKg, setRouteFuelDeficitKg] =
    useState<number | null>(null);
  const [routeFuelFeasible, setRouteFuelFeasible] =
    useState<boolean | null>(null);
  const [maxCargoSource, setMaxCargoSource] = useState<string | null>(null);
  const [airframeLabel, setAirframeLabel] = useState<string | null>(null);
  const [watch, setWatch] = useState<WatchStatus | null>(null);
  const [simBridge, setSimBridge] = useState<SimBridgeStatus | null>(null);
  const [marketPage, setMarketPage] = useState(1);
  const [routeFilter, setRouteFilter] = useState('');
  const [distanceMaxNm, setDistanceMaxNm] = useState('');
  const [cargoFilter, setCargoFilter] = useState('');
  const [loadMaxKg, setLoadMaxKg] = useState('');
  const [expiresWithinHours, setExpiresWithinHours] = useState('');
  const [minimumPayUsd, setMinimumPayUsd] = useState('');
  const [marketSort, setMarketSort] = useState<{
    key: MarketSortKey;
    direction: SortDirection;
  } | null>(null);
  const [staging, setStaging] = useState<StagingDraft | null>(null);
  const [stagingRouteLots, setStagingRouteLots] = useState<MarketLot[]>([]);
  const [stagingRouteLotsLoading, setStagingRouteLotsLoading] = useState(false);
  const [stagingRouteLotsError, setStagingRouteLotsError] = useState<string | null>(null);
  const [hubSelected, setHubSelected] = useState(true);
  const [fleet, setFleet] = useState<PlayerAircraft[]>([]);
  const [hubOptions, setHubOptions] = useState<string[]>([]);
  const [ferryDest, setFerryDest] = useState('');
  const [pilotName, setPilotName] = useState('');
  const [homeHubIcao, setHomeHubIcao] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupHub, setSignupHub] = useState('');

  useEffect(() => {
    const loc = { tab, airportIcao };
    const canonical = pathForLocation(loc);
    if (window.location.pathname !== canonical) {
      writeCareerLocation(loc, { replace: true });
    }
    // Mount-only canonicalize of `/` and unknown paths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onPopState() {
      const loc = readCareerLocation();
      setTab(loc.tab);
      if (loc.airportIcao) {
        void (async () => {
          try {
            const view = await fetchAirport(loc.airportIcao!);
            setAirportView(view);
            setAirportIcao(loc.airportIcao);
            setTerminalSection('inventory');
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setAirportIcao(null);
            setAirportView(null);
            writeCareerLocation({ tab: loc.tab, airportIcao: null }, { replace: true });
          }
        })();
      } else {
        setAirportIcao(null);
        setAirportView(null);
        setTerminalSection('inventory');
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!initialLocation.airportIcao) return;
    let cancelled = false;
    void (async () => {
      try {
        const view = await fetchAirport(initialLocation.airportIcao!);
        if (!cancelled) {
          setAirportView(view);
          setTerminalSection('inventory');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setAirportIcao(null);
          writeCareerLocation({ tab: initialLocation.tab, airportIcao: null }, {
            replace: true,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    const [state, market, missionState, npcState] = await Promise.all([
      fetchState(),
      fetchMarket(),
      fetchMissions(),
      fetchNpcFleet(),
    ]);
    const clientNow = Date.now();
    const serverNow = state.serverNowMs ?? clientNow;
    setServerOffsetMs(serverNow - clientNow);
    setTick(state.tick);
    setLastBatchAtMs(state.lastBatchAtMs ?? serverNow);
    setMsPerTick(state.msPerTick ?? MS_PER_TICK_DEFAULT);
    setDisplayNowMs(serverNow);
    setWallet(missionState.walletUsd);
    setLots(market.lots);
    setMarketEvents(market.events ?? []);
    setNpcActivity(npcState.activity.length ? npcState.activity : market.npcActivity ?? []);
    setNpcBusy(npcState.busy);
    setNpcFleet(npcState.fleet);
    setNpcSummary({
      airborne: npcState.airborne,
      turnaround: npcState.turnaround,
      resting: npcState.resting ?? 0,
      idle: npcState.idle,
    });
    setRegionPressure(
      npcState.regionPressure?.length
        ? npcState.regionPressure
        : market.regionPressure ?? [],
    );
    setMissions(missionState.missions.slice().reverse());
    setHubSelected(Boolean(state.hubSelected) && (state.fleet?.length ?? 0) > 0);
    setFleet(state.fleet ?? []);
    setHubOptions(state.hubs ?? []);
    setPilotName(state.pilotName ?? '');
    setHomeHubIcao(state.homeHubIcao ?? '');
    if (!(state.hubSelected && (state.fleet?.length ?? 0) > 0)) {
      setSignupHub((prev) => prev || state.hubs?.[0] || 'SBGR');
    }
    if (airportIcao) {
      const view = await fetchAirport(airportIcao);
      setAirportView(view);
    }
  }, [airportIcao]);

  const refreshCargoLimit = useCallback(
    async (aircraftClass: AircraftClass, distanceNm?: number) => {
      try {
        const limit = await fetchCargoLimit(aircraftClass, distanceNm);
        setStructuralMaxCargoKg(limit.maxCargoKg);
        setMaxCargoKg(limit.operationalMaxCargoKg);
        setEstimatedBlockFuelKg(limit.estimatedBlockFuelKg ?? null);
        setRouteFuelCapacityKg(limit.fuelCapacityKg ?? null);
        setRouteFuelDeficitKg(limit.fuelDeficitKg ?? null);
        setRouteFuelFeasible(limit.fuelFeasible ?? null);
        setMaxCargoSource(limit.maxCargoSource);
        setAirframeLabel(limit.airframeLabel);
      } catch {
        const fallback = fallbackMaxCargoKg(aircraftClass);
        setStructuralMaxCargoKg(fallback);
        setMaxCargoKg(fallback);
        setEstimatedBlockFuelKg(null);
        setRouteFuelCapacityKg(null);
        setRouteFuelDeficitKg(null);
        setRouteFuelFeasible(null);
        setMaxCargoSource('class-fallback');
        setAirframeLabel(null);
      }
    },
    [],
  );

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

  useEffect(() => {
    if (!staging) {
      setMaxCargoKg(null);
      setStructuralMaxCargoKg(null);
      setEstimatedBlockFuelKg(null);
      setRouteFuelCapacityKg(null);
      setRouteFuelDeficitKg(null);
      setRouteFuelFeasible(null);
      setMaxCargoSource(null);
      setAirframeLabel(null);
      return;
    }
    void refreshCargoLimit(
      staging.aircraft,
      stagingRouteDistanceNm(staging),
    );
  }, [
    staging?.aircraft,
    staging?.originIcao,
    staging?.destIcao,
    staging?.lines[0]?.lot.distanceNm,
    refreshCargoLimit,
  ]);

  // After live SimBrief cargo limit arrives, clamp staged kg to the new capacity.
  useEffect(() => {
    if (!staging || maxCargoKg === null) return;
    setStaging((current) => {
      if (!current || current.aircraft !== staging.aircraft) return current;
      const clamped = clampDraftToCapacity(current);
      const changed = clamped.lines.some(
        (line, index) => line.cargoKg !== current.lines[index]?.cargoKg,
      );
      return changed ? clamped : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reclamp when capacity payload changes
  }, [maxCargoKg]);

  // Self-heal manifests created by the old replacement bug while they are open.
  useEffect(() => {
    if (!staging?.replaceManifest) return;
    setStaging((current) => {
      if (!current?.replaceManifest) return current;
      const merged = new Map<string, StagingLine>();
      let changed = false;
      for (const line of current.lines) {
        if (line.cargoKg <= 0) {
          changed = true;
          continue;
        }
        const existing = merged.get(line.lot.id);
        if (!existing) {
          merged.set(line.lot.id, line);
          continue;
        }
        changed = true;
        merged.set(line.lot.id, {
          lot: {
            ...line.lot,
            availableKg: Math.max(
              existing.lot.availableKg,
              line.lot.availableKg,
            ),
          },
          cargoKg: existing.cargoKg + line.cargoKg,
        });
      }
      const lines = [...merged.values()];
      return changed && lines.length > 0 ? { ...current, lines } : current;
    });
  }, [staging?.replaceManifest, staging?.lines]);

  // Smooth local clock / ETA / progress between authoritative polls.
  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayNowMs(Date.now() + serverOffsetMs);
    }, 1_000);
    return () => window.clearInterval(id);
  }, [serverOffsetMs]);

  // Live board: soft-refresh while watching fleet or a terminal.
  useEffect(() => {
    if (tab !== 'fleet' && !airportIcao) return;
    const id = window.setInterval(() => {
      void refresh().catch(() => {
        /* ignore background refresh errors */
      });
    }, 15_000);
    return () => window.clearInterval(id);
  }, [tab, airportIcao, refresh]);

  // Poll MSFS watch session while active (or briefly after settle to catch final status).
  useEffect(() => {
    let cancelled = false;
    async function pollWatch() {
      try {
        const status = await fetchWatchStatus();
        if (cancelled) return;
        setWatch((prev) => {
          const justSettled =
            Boolean(prev?.running) &&
            !status.running &&
            Boolean(status.settlement) &&
            Boolean(status.missionId);
          if (justSettled && status.settlement && status.missionId) {
            queueMicrotask(() => {
              setToastKind('ok');
              setToast(
                `Settled ${status.missionId} · paid ${formatMoney(status.settlement!.payoutUsd)}` +
                  (status.settlement!.onTime
                    ? ''
                    : ` · late ${status.settlement!.lateTicks}h (−${formatMoney(status.settlement!.penaltyUsd)})`) +
                  (status.settlement!.residualFuelKg !== null
                    ? ` · fuel remaining ${formatTonnes(status.settlement!.residualFuelKg)}`
                    : ' · fuel remaining estimated'),
              );
              if (typeof status.walletUsd === 'number') {
                setWallet(status.walletUsd);
              }
              void refresh().catch(() => {
                /* ignore */
              });
            });
          }
          return status;
        });
      } catch {
        /* ignore watch poll errors */
      }
    }
    void pollWatch();
    const id = window.setInterval(() => {
      void pollWatch();
    }, watch?.running ? (watch.onGround === false ? 5_000 : 2_000) : 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [watch?.running, watch?.onGround, refresh]);

  // Independent SimBridge probe — does not require Watch to be running.
  useEffect(() => {
    let cancelled = false;
    async function pollBridge() {
      try {
        const status = await fetchSimBridgeStatus();
        if (!cancelled) setSimBridge(status);
      } catch {
        if (!cancelled) {
          setSimBridge({
            connected: false,
            mode: null,
            aircraftTitle: null,
            onGround: null,
            enginesRunning: null,
            parkingBrake: null,
            phase: null,
            source: 'probe',
            error: 'SimBridge status unavailable',
            checkedAtIso: new Date().toISOString(),
          });
        }
      }
    }
    void pollBridge();
    const id = window.setInterval(() => {
      void pollBridge();
    }, watch?.running ? (watch.onGround === false ? 10_000 : 5_000) : 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [watch?.running, watch?.onGround]);

  const continuousHours = useMemo(() => {
    const frac = Math.max(0, displayNowMs - lastBatchAtMs) / msPerTick;
    return tick + frac;
  }, [displayNowMs, lastBatchAtMs, msPerTick, tick]);

  useEffect(() => {
    try {
      localStorage.setItem(SIMBRIEF_USER_KEY, simbriefUser.trim());
    } catch {
      /* ignore */
    }
  }, [simbriefUser]);

  useEffect(() => {
    activeWeightSystem = weightSystem;
    saveWeightSystem(weightSystem);
  }, [weightSystem]);

  const activeCount = useMemo(
    () => missions.filter((m) => isActiveMissionStatus(m.status)).length,
    [missions],
  );
  const activeMission = useMemo(() => findActiveMission(missions), [missions]);

  // Staging needs the complete route inventory. The global Market payload is capped
  // at 200 rows and may omit valid same-route lots shown by the Terminal.
  useEffect(() => {
    if (!staging) {
      setStagingRouteLots([]);
      setStagingRouteLotsLoading(false);
      setStagingRouteLotsError(null);
      return;
    }

    let cancelled = false;
    setStagingRouteLots([]);
    setStagingRouteLotsLoading(true);
    setStagingRouteLotsError(null);
    void fetchRouteLots(staging.originIcao, staging.destIcao)
      .then((result) => {
        if (!cancelled) setStagingRouteLots(result.lots);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStagingRouteLotsError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setStagingRouteLotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [staging?.originIcao, staging?.destIcao, tick]);

  useEffect(() => {
    const username = simbriefUser.trim();
    const eligible =
      tab === 'staging' &&
      !airportIcao &&
      activeMission?.status === 'dispatched' &&
      Boolean(activeMission.staticId) &&
      (!activeMission.lastOfpCheck ||
        activeMission.lastOfpCheck.verdict === 'fail') &&
      Boolean(username);

    if (!eligible || !activeMission) {
      setOfpAutoStatus('idle');
      return;
    }

    let cancelled = false;
    let stopped = false;
    let inFlight = false;
    setOfpAutoStatus('waiting');

    async function pollOfp() {
      if (cancelled || stopped || inFlight || !activeMission) return;
      inFlight = true;
      setOfpAutoStatus('checking');
      try {
        const result = await postConfirmOfp({
          missionId: activeMission.id,
          simbriefUser: username,
        });
        if (cancelled) return;
        setMissions((current) =>
          current.map((mission) =>
            mission.id === result.mission.id ? result.mission : mission,
          ),
        );
        if (
          result.check.verdict === 'pass' ||
          result.check.verdict === 'warn'
        ) {
          stopped = true;
          setToastKind(result.check.verdict === 'pass' ? 'ok' : 'warn');
          setToast(
            `OFP confirmed automatically · ${result.check.verdict.toUpperCase()}`,
          );
          setOfpAutoStatus('idle');
        } else {
          if (!activeMission.lastOfpCheck) {
            setToastKind('fail');
            setToast('OFP does not match yet · waiting for the updated plan');
          }
          setOfpAutoStatus('waiting');
        }
      } catch {
        if (!cancelled) {
          setOfpAutoStatus('waiting');
        }
      } finally {
        inFlight = false;
      }
    }

    void pollOfp();
    const id = window.setInterval(() => {
      void pollOfp();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    activeMission?.id,
    activeMission?.status,
    activeMission?.staticId,
    activeMission?.lastOfpCheck?.verdict,
    airportIcao,
    simbriefUser,
    tab,
  ]);

  // Compare persisted fleet fuel against confirmed OFP block fuel. A zero-cost
  // authorization is automatic; a positive shortfall requires user purchase.
  useEffect(() => {
    const mission = activeMission;
    const ofp = mission?.lastOfpCheck;
    const eligible =
      tab === 'staging' &&
      !airportIcao &&
      mission?.status === 'dispatched' &&
      Boolean(ofp?.ofpId) &&
      (ofp?.verdict === 'pass' || ofp?.verdict === 'warn') &&
      typeof ofp?.plannedBlockFuelKg === 'number' &&
      ofp.plannedBlockFuelKg > 0;

    if (!eligible || !mission || !ofp?.ofpId) {
      setMissionFuelQuote(null);
      setMissionFuelQuoteStatus('idle');
      setMissionFuelQuoteError(null);
      return;
    }
    if (mission.fuelAuthorizedOfpId === ofp.ofpId) {
      setMissionFuelQuote(null);
      setMissionFuelQuoteStatus('ready');
      setMissionFuelQuoteError(null);
      return;
    }

    let cancelled = false;
    setMissionFuelQuoteStatus('loading');
    setMissionFuelQuoteError(null);
    void (async () => {
      try {
        const result = await postFuelQuote(mission.id);
        if (cancelled) return;
        if (result.quote.shortfallKg <= 0) {
          await postFuelPurchase(mission.id);
          if (cancelled) return;
          setMissionFuelQuote(null);
          setMissionFuelQuoteStatus('ready');
          setToastKind('ok');
          setToast('Persisted aircraft fuel covers the OFP · continuing automatically');
          await refresh();
          return;
        }
        setMissionFuelQuote(result);
        setMissionFuelQuoteStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setMissionFuelQuote(null);
          setMissionFuelQuoteStatus('error');
          setMissionFuelQuoteError(
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeMission?.id,
    activeMission?.status,
    activeMission?.fuelAuthorizedOfpId,
    activeMission?.lastOfpCheck?.ofpId,
    activeMission?.lastOfpCheck?.plannedBlockFuelKg,
    activeMission?.lastOfpCheck?.verdict,
    airportIcao,
    missionFuelQuoteRetryToken,
    refresh,
    tab,
  ]);

  // Auto-load OFP into the aircraft after confirm (pass/warn), then Preflight runs server-side.
  useEffect(() => {
    const username = simbriefUser.trim();
    const ofp = activeMission?.lastOfpCheck;
    const ofpOk = ofp?.verdict === 'pass' || ofp?.verdict === 'warn';
    const ofpKey =
      activeMission && ofp
        ? `${activeMission.id}:${ofp.ofpId ?? ''}:${ofp.staticId ?? activeMission.staticId ?? ''}:${ofp.checkedAtIso}`
        : null;
    const fuelAuthorized =
      Boolean(ofp?.ofpId) &&
      activeMission?.fuelAuthorizedOfpId === ofp?.ofpId;
    const alreadyVerified =
      fuelAuthorized &&
      Boolean(ofp) &&
      Boolean(activeMission?.lastPreflightCheck?.loadVerification?.ready) &&
      Boolean(activeMission?.lastPreflightCheck?.checkedAtIso) &&
      Boolean(ofp?.checkedAtIso) &&
      Date.parse(activeMission!.lastPreflightCheck!.checkedAtIso) >=
        Date.parse(ofp!.checkedAtIso);
    const editingManifest = Boolean(staging?.replaceManifest);
    const canAutoInject =
      Boolean(activeMission) &&
      preferredLoadMethod(activeMission!) === 'direct-injection' &&
      missionInjectCapable(activeMission!) &&
      !preferManualLoad;
    const eligible =
      tab === 'staging' &&
      !airportIcao &&
      Boolean(activeMission) &&
      ['dispatched', 'in_flight'].includes(activeMission?.status ?? '') &&
      ofpOk &&
      Boolean(username) &&
      Boolean(ofpKey) &&
      fuelAuthorized &&
      canAutoInject &&
      !editingManifest &&
      !watchAutoPaused &&
      !alreadyVerified &&
      autoLoadedOfpKeyRef.current !== ofpKey;

    if (!eligible || !activeMission || !ofpKey) {
      if (alreadyVerified && ofpKey) {
        autoLoadedOfpKeyRef.current = ofpKey;
        setLoadOfpAutoStatus('done');
        setLoadOfpAutoError(null);
      } else if (!ofpOk) {
        setLoadOfpAutoStatus('idle');
      }
      return;
    }

    let cancelled = false;
    let stopped = false;
    let inFlight = false;
    let toastedFailure = false;
    setLoadOfpAutoStatus('waiting');

    async function tryLoadOfp() {
      if (cancelled || stopped || inFlight || !activeMission) return;
      if (!simBridge?.connected) {
        setLoadOfpAutoStatus('waiting');
        return;
      }
      if (simBridge.onGround === false) {
        setLoadOfpAutoStatus('waiting');
        setLoadOfpAutoError('Waiting for aircraft on ground before loading OFP');
        return;
      }
      inFlight = true;
      setLoadOfpAutoStatus('loading');
      setLoadOfpAutoError(null);
      try {
        const result = await postLoadOfp({
          missionId: activeMission.id,
          simbriefUser: username,
          runPreflightAfter: true,
        });
        if (cancelled) return;
        await refresh();
        if (!result.ok) {
          // Applying/rolling back is stateful. Never repeat automatically after
          // an actual attempt; wait for an explicit user retry.
          stopped = true;
          setLoadOfpAutoStatus('failed');
          setLoadOfpAutoError(result.error ?? 'OFP load failed');
          if (!toastedFailure) {
            toastedFailure = true;
            setToastKind('fail');
            setToast(
              result.rolledBack
                ? `Auto OFP load failed · ${result.error ?? 'rolled back'}`
                : `Auto OFP load failed · ${result.error ?? 'unknown error'}`,
            );
          }
          return;
        }
        stopped = true;
        autoLoadedOfpKeyRef.current = ofpKey;
        setLoadOfpAutoStatus('done');
        setLoadOfpAutoError(null);
        const fuelKg = result.plan.blockFuelLb / KG_TO_LB;
        const cargoKg = result.plan.cargoLb / KG_TO_LB;
        const pf = result.preflight?.check.verdict;
        const preflightReady = result.preflight?.check.loadVerification?.ready;
        setToastKind(
          preflightReady ? 'ok' : pf === 'fail' ? 'fail' : pf === 'warn' ? 'warn' : 'ok',
        );
        setToast(
          `Loaded OFP into ${result.identity.title || 'aircraft'} · ` +
            `fuel ${formatMassExact(fuelKg, weightSystem)} · ` +
            `cargo ${formatMassExact(cargoKg, weightSystem)}` +
            (pf ? ` · Preflight ${preflightReady ? 'READY' : pf.toUpperCase()}` : ''),
        );
      } catch (err) {
        if (!cancelled) {
          stopped = true;
          const message = err instanceof Error ? err.message : String(err);
          setLoadOfpAutoStatus('failed');
          setLoadOfpAutoError(message);
          if (!toastedFailure) {
            toastedFailure = true;
            setToastKind('fail');
            setToast(`Auto OFP load failed · ${message}`);
          }
        }
      } finally {
        inFlight = false;
      }
    }

    void tryLoadOfp();
    const id = window.setInterval(() => {
      void tryLoadOfp();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    activeMission?.id,
    activeMission?.status,
    activeMission?.staticId,
    activeMission?.lastOfpCheck?.checkedAtIso,
    activeMission?.lastOfpCheck?.ofpId,
    activeMission?.lastOfpCheck?.staticId,
    activeMission?.lastOfpCheck?.verdict,
    activeMission?.fuelAuthorizedOfpId,
    activeMission?.lastPreflightCheck?.checkedAtIso,
    activeMission?.lastPreflightCheck?.loadVerification?.ready,
    airportIcao,
    loadOfpRetryToken,
    preferManualLoad,
    refresh,
    simBridge?.connected,
    simBridge?.onGround,
    simbriefUser,
    staging?.replaceManifest,
    tab,
    watchAutoPaused,
    weightSystem,
  ]);

  // Continuously refresh Loaded vs Due while staging on the ground.
  useEffect(() => {
    const username = simbriefUser.trim();
    const ofp = activeMission?.lastOfpCheck;
    const eligible =
      tab === 'staging' &&
      !airportIcao &&
      Boolean(activeMission) &&
      activeMission?.status === 'dispatched' &&
      Boolean(username) &&
      Boolean(ofp?.ofpId) &&
      activeMission?.fuelAuthorizedOfpId === ofp?.ofpId &&
      Boolean(simBridge?.connected) &&
      simBridge?.onGround !== false &&
      loadOfpAutoStatus !== 'loading' &&
      !staging?.replaceManifest;
    if (!eligible || !activeMission) return;

    let cancelled = false;
    let inFlight = false;
    async function refreshLiveLoad() {
      if (cancelled || inFlight || !activeMission) return;
      inFlight = true;
      try {
        const result = await postPreflight({
          missionId: activeMission.id,
          simbriefUser: username,
        });
        if (cancelled) return;
        setMissions((current) =>
          current.map((mission) =>
            mission.id === result.mission.id ? result.mission : mission,
          ),
        );
      } catch {
        // Soft background refresh: bridge status already reports connectivity.
      } finally {
        inFlight = false;
      }
    }

    void refreshLiveLoad();
    const id = window.setInterval(() => {
      void refreshLiveLoad();
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    activeMission?.id,
    activeMission?.status,
    activeMission?.fuelAuthorizedOfpId,
    activeMission?.lastOfpCheck?.ofpId,
    airportIcao,
    loadOfpAutoStatus,
    simBridge?.connected,
    simBridge?.onGround,
    simbriefUser,
    staging?.replaceManifest,
    tab,
  ]);

  // Keep Watch running for every operational mission; Preflight gates auto-depart.
  useEffect(() => {
    const preflight = activeMission?.lastPreflightCheck;
    const alreadyWatching =
      Boolean(watch?.running) && watch?.missionId === activeMission?.id;
    const eligible =
      tab === 'staging' &&
      !airportIcao &&
      Boolean(activeMission) &&
      ['dispatched', 'in_flight'].includes(activeMission?.status ?? '') &&
      !alreadyWatching &&
      !watchAutoPaused &&
      !watch?.settlement;

    if (!eligible || !activeMission) {
      if (!alreadyWatching) {
        setWatchAutoStatus('idle');
      }
      return;
    }

    let cancelled = false;
    let stopped = false;
    let inFlight = false;
    setWatchAutoStatus('waiting');

    async function tryStartWatch() {
      if (cancelled || stopped || inFlight || !activeMission) return;
      inFlight = true;
      setWatchAutoStatus('connecting');
      try {
        const status = await postWatchStart({
          missionId: activeMission.id,
          intervalSec: 5,
        });
        if (cancelled) return;
        stopped = true;
        setWatch(status);
        setWatchAutoStatus('idle');
        setToastKind('ok');
        setToast(
          `Watch started · MSFS connected · auto-depart/settle near ${activeMission.destIcao}`,
        );
      } catch {
        if (!cancelled) {
          setWatchAutoStatus('waiting');
        }
      } finally {
        inFlight = false;
      }
    }

    void tryStartWatch();
    const id = window.setInterval(() => {
      void tryStartWatch();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    activeMission?.id,
    activeMission?.status,
    activeMission?.destIcao,
    activeMission?.lastPreflightCheck?.checkedAtIso,
    activeMission?.lastPreflightCheck?.verdict,
    airportIcao,
    tab,
    watch?.running,
    watch?.missionId,
    watch?.settlement,
    watchAutoPaused,
  ]);

  // Reset watch auto-pause when switching missions or getting a fresh preflight.
  useEffect(() => {
    setWatchAutoPaused(false);
  }, [
    activeMission?.id,
    activeMission?.lastPreflightCheck?.checkedAtIso,
  ]);

  useEffect(() => {
    autoLoadedOfpKeyRef.current = null;
    setPreferManualLoad(false);
    setLoadOfpAutoStatus('idle');
    setLoadOfpAutoError(null);
  }, [activeMission?.id]);

  // Draft is only for pre-commit preparation; once a flight is operational, clear it.
  // Keep the draft while editing an accepted/dispatched manifest in place.
  useEffect(() => {
    if (!activeMission || !staging) return;
    if (
      staging.intoMissionId === activeMission.id &&
      (activeMission.status === 'accepted' ||
        (staging.replaceManifest && activeMission.status === 'dispatched'))
    ) {
      return;
    }
    setStaging(null);
  }, [
    activeMission?.id,
    activeMission?.status,
    staging?.intoMissionId,
    staging?.replaceManifest,
  ]);

  async function run(
    action: () => Promise<void>,
    opts: { refreshAfter?: boolean } = {},
  ) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (opts.refreshAfter !== false) {
        await refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openAirport(icao: string) {
    const next = icao.toUpperCase();
    await run(async () => {
      const view = await fetchAirport(next);
      setAirportView(view);
      if (airportIcao !== next) {
        setTerminalSection('inventory');
      }
      setAirportIcao(next);
      writeCareerLocation({ tab, airportIcao: next });
    }, { refreshAfter: false });
  }

  function closeAirport() {
    setAirportIcao(null);
    setAirportView(null);
    setTerminalSection('inventory');
    writeCareerLocation({ tab, airportIcao: null });
  }

  function goToTab(next: Tab, opts: { replace?: boolean } = {}) {
    setAirportIcao(null);
    setAirportView(null);
    setTerminalSection('inventory');
    setTab(next);
    writeCareerLocation({ tab: next, airportIcao: null }, opts);
  }

  function selectTab(next: Tab) {
    goToTab(next);
    void run(refresh, { refreshAfter: false });
  }

  function onRefresh() {
    void run(refresh, { refreshAfter: false });
  }

  async function onTick() {
    await run(async () => {
      const result = await postTick(24);
      setToastKind('ok');
      setToast(
        `Time advanced ${formatDuration(24)} → ${formatClock(result.tick)} · ${result.availableLots} lots`,
      );
    });
  }

  async function onResetBrazil() {
    const confirmed = await confirm({
      title: 'Reset Brazil world?',
      body: 'Clears the local career save — pilot profile, missions, wallet, and hangar — then reseeds the Brazil-only economy.',
      confirmLabel: 'Reset everything',
      cancelLabel: 'Keep save',
      tone: 'danger',
    });
    if (!confirmed) return;
    await run(async () => {
      const result = await postInitBrazil();
      setToastKind('ok');
      setToast(`Brazil world initialized · ${result.airports} airports`);
      closeAirport();
      setStaging(null);
      setFleet([]);
      setHubSelected(false);
      setPilotName('');
      setHomeHubIcao('');
      setSignupName('');
      setSignupHub('');
      goToTab('pilot');
    });
  }

  async function onSelectHub() {
    const name = signupName.trim();
    const icao = signupHub.trim().toUpperCase();
    if (name.length < 2) {
      setError('Enter a pilot name (at least 2 characters)');
      return;
    }
    if (!icao) {
      setError('Select a home hub ICAO');
      return;
    }
    await run(async () => {
      const result = await postSelectHub({ icao, pilotName: name });
      setHubSelected(result.hubSelected);
      setFleet(result.fleet);
      setHubOptions(result.hubs);
      setPilotName(result.pilotName);
      setHomeHubIcao(result.homeHubIcao);
      setWallet(result.walletUsd);
      setToastKind('ok');
      setToast(
        `${result.pilotName} registered · Caravan parked at ${result.homeHubIcao}`,
      );
      goToTab('pilot');
    });
  }

  async function onAcquireBonanza() {
    await run(async () => {
      const result = await postAcquireAircraft({
        aircraftClassId: 'light_ga',
        locationIcao: homeHubIcao || undefined,
      });
      setFleet(result.fleet);
      setWallet(result.walletUsd);
      setToastKind('ok');
      setToast('Company Bonanza parked at hangar');
    });
  }

  async function onFerry(aircraftId: string, destIcao: string) {
    if (!destIcao.trim()) return;
    const dest = destIcao.trim().toUpperCase();
    let quoteRes: Awaited<ReturnType<typeof postFerry>>;
    try {
      setBusy(true);
      setError(null);
      quoteRes = await postFerry({
        aircraftId,
        destIcao: dest,
        quoteOnly: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    } finally {
      setBusy(false);
    }
    const quote = quoteRes.quote;
    const ok = await confirm({
      title: `Ferry ${quote.originIcao} → ${quote.destIcao}?`,
      body: `${Math.round(quote.distanceNm)} nm · fee ${formatMoney(quote.ferryFeeUsd)} · fuel ${formatMoney(quote.fuelCostUsd)} · total ${formatMoney(quote.totalCostUsd)} (instant relocation).`,
      confirmLabel: 'Ferry now',
      cancelLabel: 'Not now',
      tone: 'warn',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postFerry({
        aircraftId,
        destIcao: dest,
      });
      if (result.fleet) setFleet(result.fleet);
      setWallet(result.walletUsd);
      setFerryDest('');
      setToastKind(result.quote.fuelScarcity === 'ok' ? 'ok' : 'warn');
      setToast(
        `Ferry complete · ${result.quote.originIcao}→${result.quote.destIcao} · −${formatMoney(result.walletDebitUsd ?? result.quote.totalCostUsd)}`,
      );
    });
  }

  function openFlightForRoute(
    originIcao: string,
    destIcao: string,
    aircraftClass: AircraftClass,
  ): Mission | undefined {
    const matches = missions.filter(
      (mission) =>
        ['accepted', 'dispatched'].includes(mission.status) &&
        mission.aircraftClassId === aircraftClass &&
        mission.originIcao === originIcao &&
        mission.destIcao === destIcao,
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  function aircraftCapKg(aircraftClass: AircraftClass): number {
    if (
      staging &&
      staging.aircraft === aircraftClass &&
      maxCargoKg !== null &&
      Number.isFinite(maxCargoKg)
    ) {
      return maxCargoKg;
    }
    return fallbackMaxCargoKg(aircraftClass);
  }

  function stagingUsedKg(draft: StagingDraft): number {
    const existing =
      draft.replaceManifest || !draft.intoMissionId
        ? 0
        : missions.find((m) => m.id === draft.intoMissionId)?.cargoKg ?? 0;
    return (
      existing + draft.lines.reduce((sum, line) => sum + line.cargoKg, 0)
    );
  }

  function stagingRemainingKg(draft: StagingDraft, excludeLotId?: string): number {
    const existing =
      draft.replaceManifest || !draft.intoMissionId
        ? 0
        : missions.find((m) => m.id === draft.intoMissionId)?.cargoKg ?? 0;
    const staged = draft.lines
      .filter((line) => line.lot.id !== excludeLotId)
      .reduce((sum, line) => sum + line.cargoKg, 0);
    return Math.max(0, aircraftCapKg(draft.aircraft) - existing - staged);
  }

  function lineMaxKg(draft: StagingDraft, lot: MarketLot): number {
    return Math.max(
      0,
      Math.floor(Math.min(lot.availableKg, stagingRemainingKg(draft, lot.id))),
    );
  }

  function stagingRouteDistanceNm(draft: StagingDraft): number | undefined {
    const fromLine = draft.lines[0]?.lot.distanceNm;
    if (typeof fromLine === 'number' && Number.isFinite(fromLine)) return fromLine;
    const marketMatch = lots.find(
      (lot) =>
        lot.originIcao === draft.originIcao && lot.destIcao === draft.destIcao,
    );
    return marketMatch?.distanceNm;
  }

  function stagingRangeOk(draft: StagingDraft): boolean {
    const distance = stagingRouteDistanceNm(draft);
    if (distance === undefined) return true;
    return distance <= aircraftMaxRangeNm(draft.aircraft);
  }

  function clampDraftToCapacity(draft: StagingDraft): StagingDraft {
    let remaining = aircraftCapKg(draft.aircraft);
    if (draft.intoMissionId && !draft.replaceManifest) {
      const existing = missions.find((m) => m.id === draft.intoMissionId);
      remaining = Math.max(0, remaining - (existing?.cargoKg ?? 0));
    }
    const lines = draft.lines.map((line) => {
      const maxKg = Math.max(
        0,
        Math.floor(Math.min(line.lot.availableKg, remaining)),
      );
      const cargoKg = Math.min(line.cargoKg, maxKg);
      remaining = Math.max(0, remaining - cargoKg);
      return { ...line, cargoKg };
    });
    return { ...draft, lines };
  }

  function enterStaging(lot: MarketLot) {
    if (!hubSelected) {
      setError('Create your pilot profile first (name + home hub)');
      goToTab('pilot');
      return;
    }
    if (activeMission) {
      setError(
        `Finish or cancel ${activeMission.id} in Staging before preparing another flight`,
      );
      goToTab('staging');
      return;
    }
    const parkedHere = fleet.find(
      (a) => a.status === 'parked' && a.locationIcao === lot.originIcao,
    );
    if (!parkedHere) {
      const parked = fleet.find((a) => a.status === 'parked');
      setError(
        parked
          ? `Your ${parked.label} is at ${parked.locationIcao}. Ferry to ${lot.originIcao} from Hangar first.`
          : `No parked aircraft available for ${lot.originIcao}`,
      );
      goToTab('hangar');
      return;
    }
    const aircraft = parkedHere.aircraftClassId;
    const openFlight = openFlightForRoute(lot.originIcao, lot.destIcao, aircraft);
    const existingLots = openFlight?.lots?.length ?? 0;
    if (existingLots >= MAX_STAGING_LOTS) {
      setError(`Flight ${openFlight!.id} already has ${MAX_STAGING_LOTS} lots`);
      return;
    }
    const draft: StagingDraft = {
      originIcao: lot.originIcao,
      destIcao: lot.destIcao,
      originName: lot.originName,
      destName: lot.destName,
      aircraft,
      aircraftId: parkedHere.id,
      intoMissionId: openFlight?.id,
      lines: [],
    };
    const maxKg = lineMaxKg(draft, lot);
    draft.lines = [
      {
        lot,
        cargoKg: maxKg > 0 ? defaultStagingKg(maxKg) : 0,
      },
    ];
    setStaging(draft);
    setPreferredAircraft(aircraft);
    setError(null);
    closeAirport();
    goToTab('staging');
  }

  function enterStagingFromContract(lot: AirportLot) {
    const marketLot = lots.find((candidate) => candidate.id === lot.id);
    enterStaging(
      marketLot ?? {
        id: lot.id,
        originIcao: lot.originIcao,
        destIcao: lot.destIcao,
        originName: lot.originIcao,
        destName: lot.destIcao,
        distanceNm: lot.distanceNm,
        commodityId: lot.commodityId,
        commodityName: lot.commodityName,
        availableKg: lot.availableKg,
        payUsd: lot.payUsd,
        urgency: lot.urgency === 'urgent' ? 'urgent' : 'normal',
        reason: lot.reason,
        createdAtTick: lot.createdAtTick,
        expiresAtTick: lot.expiresAtTick,
        ticksRemaining: lot.ticksRemaining,
        perishable: lot.perishable,
        npcClaim: lot.npcClaim,
      },
    );
  }

  function exitStaging() {
    if (busy) return;
    if (staging?.replaceManifest) {
      setStaging(null);
      goToTab('staging');
      return;
    }
    goToTab('market');
  }

  async function enterEditManifest(mission: Mission) {
    if (!['accepted', 'dispatched'].includes(mission.status)) {
      setError('Only accepted or dispatched flights can edit the manifest');
      return;
    }
    if (watch?.running && watch.missionId === mission.id) {
      try {
        const status = await postWatchStop();
        setWatch(status);
        setWatchAutoPaused(true);
        setWatchAutoStatus('idle');
      } catch {
        /* ignore — still allow edit */
      }
    }
    const missionLots = mission.lots?.length
      ? mission.lots
      : [
          {
            shipmentLotId: mission.shipmentLotId ?? '',
            commodityId: mission.commodityId,
            cargoKg: mission.cargoKg,
            payUsd: mission.payUsd,
            urgency: mission.urgency,
            reason: mission.reason,
            deadlineTick: mission.deadlineTick,
          },
        ];
    // Repair legacy/corrupted manifests before editing: zero-weight ghost lines
    // are discarded and duplicate shipment IDs become one independent control.
    const editableLots = new Map<string, (typeof missionLots)[number]>();
    for (const line of missionLots) {
      if (!line.shipmentLotId || line.cargoKg <= 0) continue;
      const existing = editableLots.get(line.shipmentLotId);
      editableLots.set(
        line.shipmentLotId,
        existing
          ? {
              ...existing,
              cargoKg: existing.cargoKg + line.cargoKg,
              payUsd: existing.payUsd + line.payUsd,
              urgency:
                existing.urgency === 'urgent' || line.urgency === 'urgent'
                  ? 'urgent'
                  : 'normal',
              deadlineTick: Math.min(existing.deadlineTick, line.deadlineTick),
            }
          : { ...line },
      );
    }
    const lines: StagingLine[] = [];
    for (const line of editableLots.values()) {
      const market = lots.find((lot) => lot.id === line.shipmentLotId);
      const lot: MarketLot = market
        ? {
            ...market,
            availableKg: market.availableKg + line.cargoKg,
          }
        : {
            id: line.shipmentLotId,
            originIcao: mission.originIcao,
            destIcao: mission.destIcao,
            originName: mission.originIcao,
            destName: mission.destIcao,
            commodityId: line.commodityId,
            commodityName: line.commodityId,
            availableKg: line.cargoKg,
            payUsd: line.payUsd,
            urgency: line.urgency === 'urgent' ? 'urgent' : 'normal',
            reason: line.reason,
            expiresAtTick: line.deadlineTick,
            ticksRemaining: Math.max(0, line.deadlineTick - tick),
          };
      lines.push({ lot, cargoKg: line.cargoKg });
    }
    if (lines.length === 0) {
      setError('This flight has no cargo lines to edit');
      return;
    }
    const draft: StagingDraft = {
      originIcao: mission.originIcao,
      destIcao: mission.destIcao,
      originName:
        lots.find((lot) => lot.originIcao === mission.originIcao)?.originName ??
        mission.originIcao,
      destName:
        lots.find((lot) => lot.destIcao === mission.destIcao)?.destName ??
        mission.destIcao,
      aircraft: mission.aircraftClassId as AircraftClass,
      aircraftId: mission.aircraftId,
      intoMissionId: mission.id,
      replaceManifest: true,
      lines,
    };
    setStaging(draft);
    setPreferredAircraft(draft.aircraft);
    setError(null);
    setToastKind('ok');
    setToast('Editing manifest — adjust payload, then Save & re-dispatch');
    goToTab('staging');
  }

  function changeStagingAircraft(next: AircraftClass) {
    if (!staging || busy || next === staging.aircraft) return;
    if (staging.replaceManifest || staging.aircraftId) return;
    const openFlight = openFlightForRoute(
      staging.originIcao,
      staging.destIcao,
      next,
    );
    const nextDraft = clampDraftToCapacity({
      ...staging,
      aircraft: next,
      intoMissionId: openFlight?.id,
    });
    setStaging(nextDraft);
    setPreferredAircraft(next);
  }

  function updateStagingLineKg(lotId: string, rawKg: number) {
    setStaging((current) => {
      if (!current) return current;
      return {
        ...current,
        lines: current.lines.map((line) => {
          if (line.lot.id !== lotId) return line;
          const maxKg = lineMaxKg(current, line.lot);
          const cargoKg =
            maxKg <= 0
              ? 0
              : Math.max(1, Math.min(maxKg, Math.floor(rawKg) || 0));
          return { ...line, cargoKg };
        }),
      };
    });
  }

  function setStagingLineFraction(lotId: string, fraction: number) {
    setStaging((current) => {
      if (!current) return current;
      const target = current.lines.find((line) => line.lot.id === lotId);
      if (!target) return current;
      const maxKg = lineMaxKg(current, target.lot);
      const cargoKg =
        maxKg <= 0
          ? 0
          : fraction >= 1
            ? maxKg
            : Math.max(
                1,
                Math.min(maxKg, Math.round(maxKg * fraction)),
              );
      return {
        ...current,
        lines: current.lines.map((line) =>
          line.lot.id === lotId ? { ...line, cargoKg } : line,
        ),
      };
    });
  }

  function removeStagingLine(lotId: string) {
    setStaging((current) => {
      if (!current) return current;
      const lines = current.lines.filter((line) => line.lot.id !== lotId);
      if (lines.length === 0) return null;
      return { ...current, lines };
    });
  }

  function addLotToStaging(lot: MarketLot) {
    setStaging((current) => {
      if (!current) return current;
      if (lot.originIcao !== current.originIcao || lot.destIcao !== current.destIcao) {
        return current;
      }
      if (current.lines.some((line) => line.lot.id === lot.id)) return current;
      const existingCount =
        (current.intoMissionId && !current.replaceManifest
          ? missions.find((m) => m.id === current.intoMissionId)?.lots?.length ?? 0
          : 0) + current.lines.length;
      if (existingCount >= MAX_STAGING_LOTS) return current;
      const maxKg = lineMaxKg(current, lot);
      if (maxKg <= 0) return current;
      return {
        ...current,
        lines: [...current.lines, { lot, cargoKg: defaultStagingKg(maxKg) }],
      };
    });
  }

  async function onCommitStaging() {
    if (!staging || staging.lines.length === 0) return;
    await run(async () => {
      const result = await postStagingCommit({
        aircraft: staging.aircraft,
        aircraftId: staging.aircraftId,
        missionId: staging.intoMissionId,
        openDispatch: true,
        replace: Boolean(staging.replaceManifest),
        weightSystem,
        lines: staging.lines.map((line) => ({
          lotId: line.lot.id,
          cargoKg: line.cargoKg,
        })),
      });
      if (result.fleet) setFleet(result.fleet);
      setStaging(null);
      setWatchAutoPaused(false);
      setToastKind('ok');
      const rem =
        result.remainingKg !== undefined
          ? ` · ${formatMassExact(result.remainingKg, weightSystem)} left`
          : '';
      const dispatchNote = result.dispatch
        ? ` · SimBrief ${result.dispatch.airframeLabel}`
        : '';
      const action = result.replaced
        ? 'Updated'
        : result.appended
          ? 'Updated'
          : 'Created';
      setToast(
        `${action} ${result.mission.id} · ${
          result.lineCount ?? staging.lines.length
        } lot(s) · ${formatTonnes(result.mission.cargoKg)}${rem}${dispatchNote}`,
      );
      goToTab('staging');
    });
  }

  async function onDispatch(mission: Mission) {
    await run(async () => {
      const result = await postDispatch({
        missionId: mission.id,
        open: true,
        weightSystem,
      });
      setToastKind('ok');
      setToast(
        `SimBrief opened · ${result.airframeLabel} · ${result.units ?? 'KGS'} · Generate OFP — auto-confirm runs every 15s`,
      );
    });
  }

  async function onCancel(mission: Mission) {
    const ok = await confirm({
      title: 'Cancel this flight?',
      body: (
        <>
          <p>
            <code>{mission.id}</code> · releases {mission.lots?.length ?? 1} lot
            reservation(s) back to the market when still active.
          </p>
          <p>No payout.</p>
        </>
      ),
      confirmLabel: 'Yes, cancel flight',
      cancelLabel: 'Keep flying',
      tone: 'danger',
    });
    if (!ok) return;
    await run(async () => {
      // Clear active flight immediately so auto-OFP / Preflight / Watch polls stop.
      setMissions((current) =>
        current.map((m) =>
          m.id === mission.id ? { ...m, status: 'cancelled' } : m,
        ),
      );
      setStaging(null);
      try {
        const stopped = await postWatchStop();
        setWatch(stopped);
      } catch {
        /* watch may already be idle */
      }
      const result = await postCancel({ missionId: mission.id });
      setMissions((current) =>
        current.map((m) => (m.id === result.mission.id ? result.mission : m)),
      );
      setWallet(result.walletUsd);
      setToastKind(result.warning ? 'warn' : 'ok');
      setToast(
        result.returnedToMarket
          ? `Cancelled ${result.mission.id} · ${formatTonnes(result.releasedKg)} released to market`
          : `Cancelled ${result.mission.id} · ${result.warning ?? 'no active lot to release'}`,
      );
      goToTab('staging');
    });
  }

  function retryAutoLoadOfp() {
    setPreferManualLoad(false);
    autoLoadedOfpKeyRef.current = null;
    setLoadOfpAutoError(null);
    setLoadOfpAutoStatus('waiting');
    setLoadOfpRetryToken((token) => token + 1);
  }

  function continueManuallyLoad() {
    setPreferManualLoad(true);
    autoLoadedOfpKeyRef.current = null;
    setLoadOfpAutoStatus('idle');
    setLoadOfpAutoError(null);
    setToastKind('ok');
    setToast(
      'Load manually in the aircraft Mass & Balance / EFB. Loaded vs Due updates automatically.',
    );
  }

  async function onLoadFuelAndPayload(mission: Mission) {
    const username = simbriefUser.trim();
    if (!username) {
      setToastKind('warn');
      setToast('Enter SimBrief username before loading fuel and payload');
      return;
    }
    setLoadOfpAutoStatus('loading');
    let succeeded = false;
    let failureMessage: string | null = null;
    await run(async () => {
      try {
        const result = await postLoadOfp({
          missionId: mission.id,
          simbriefUser: username,
          runPreflightAfter: true,
        });
        if (!result.ok) {
          throw new Error(result.error ?? 'Fuel and payload load failed');
        }
        succeeded = true;
        setLoadOfpAutoStatus('done');
        setLoadOfpAutoError(null);
        setToastKind('ok');
        setToast(
          `Fuel and payload loaded · cargo ${formatMassExact(result.plan.cargoLb / KG_TO_LB, weightSystem)} · live validation active`,
        );
      } catch (err) {
        failureMessage = err instanceof Error ? err.message : String(err);
        throw err;
      }
    });
    if (!succeeded) {
      setLoadOfpAutoStatus('failed');
      setLoadOfpAutoError(failureMessage ?? 'Fuel and payload load failed');
    }
  }

  async function onBuyMissionFuel(mission: Mission) {
    setMissionFuelQuoteStatus('loading');
    await run(async () => {
      const result = await postFuelPurchase(mission.id);
      setMissionFuelQuote(null);
      setMissionFuelQuoteStatus('ready');
      setMissionFuelQuoteError(null);
      setToastKind(result.quote.uplift.scarcity === 'ok' ? 'ok' : 'warn');
      setToast(
        `Fuel purchased · ${formatMassExact(
          result.quote.shortfallKg,
          weightSystem,
        )} · −${formatMoney(result.fuelDebitUsd)} · continuing automatically`,
      );
    });
  }

  async function onDepart(mission: Mission) {
    let override = false;
    const preflightReady =
      mission.lastPreflightCheck?.loadVerification?.ready ??
      mission.lastPreflightCheck?.verdict !== 'fail';
    if (mission.lastPreflightCheck && !preflightReady) {
      const ok = await confirm({
        title: 'Depart with failed Preflight?',
        body: `Preflight is not ready for ${mission.id}. Depart anyway without fixing fuel/payload?`,
        confirmLabel: 'Depart anyway',
        cancelLabel: 'Stay on ground',
        tone: 'warn',
      });
      if (!ok) return;
      override = true;
    }
    await run(async () => {
      const result = await postDepart({ missionId: mission.id, override });
      setToastKind(
        override || result.mission.fuelUplift?.scarcity === 'dry'
          ? 'warn'
          : result.mission.fuelUplift?.scarcity === 'partial'
            ? 'warn'
            : 'ok',
      );
      const fuelNote = result.mission.fuelUplift
        ? ` · fuel ${formatTonnes(result.mission.fuelUplift.requestedKg)} (−${formatMoney(result.mission.fuelUplift.costUsd)}${result.mission.fuelUplift.scarcity !== 'ok' ? ` · ${result.mission.fuelUplift.scarcity}` : ''})`
        : '';
      setToast(
        override
          ? `Departed ${result.mission.id} with preflight override · in_flight${fuelNote}`
          : `Departed ${result.mission.id} · in_flight${fuelNote}`,
      );
    });
  }

  async function onSettle(mission: Mission) {
    const ok = await confirm({
      title: 'Settle without MSFS?',
      body: `Deliver cargo to ${mission.destIcao} and credit the wallet now. Skips the live SimBridge arrival check.`,
      confirmLabel: 'Settle now',
      cancelLabel: 'Keep flying',
      tone: 'warn',
    });
    if (!ok) return;
    await run(async () => {
      const result = await postSettle({ missionId: mission.id });
      setWatch((prev) =>
        prev?.missionId === mission.id ? { ...prev, running: false } : prev,
      );
      setToastKind(result.settlement.onTime ? 'ok' : 'warn');
      setToast(
        `Settled ${result.mission.id} · paid ${formatMoney(result.settlement.payoutUsd)}` +
          (result.settlement.onTime
            ? ''
            : ` · late ${result.settlement.lateTicks}h (−${formatMoney(result.settlement.penaltyUsd)})`) +
          (result.settlement.residualFuelKg !== null
            ? ` · fuel remaining ${formatTonnes(result.settlement.residualFuelKg)}`
            : ' · fuel remaining estimated'),
      );
      setStaging(null);
      goToTab('staging');
    });
  }

  const cargoOptions = useMemo(
    () =>
      Array.from(
        new Map(lots.map((lot) => [lot.commodityId, lot.commodityName])).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [lots],
  );
  const filteredLots = useMemo(() => {
    const maxDistance = Number(distanceMaxNm);
    const maxLoad = Number(loadMaxKg);
    const maxExpiry = Number(expiresWithinHours);
    const minPay = Number(minimumPayUsd);
    const routeTokens = routeFilter
      .trim()
      .toLowerCase()
      .split(/[\s,/>\-→]+/)
      .filter(Boolean);
    return lots.filter((lot) => {
      if (routeTokens.length > 0) {
        const blob =
          `${lot.originIcao} ${lot.destIcao} ${lot.originName ?? ''} ${lot.destName ?? ''}`.toLowerCase();
        if (!routeTokens.every((token) => blob.includes(token))) {
          return false;
        }
      }
      if (
        distanceMaxNm &&
        (lot.distanceNm === undefined || lot.distanceNm > maxDistance)
      ) {
        return false;
      }
      if (cargoFilter && lot.commodityId !== cargoFilter) return false;
      if (loadMaxKg && lot.availableKg > maxLoad) return false;
      if (
        expiresWithinHours &&
        Math.max(0, lot.expiresAtTick - continuousHours) > maxExpiry
      ) {
        return false;
      }
      if (minimumPayUsd && lot.payUsd < minPay) return false;
      return true;
    });
  }, [
    cargoFilter,
    continuousHours,
    distanceMaxNm,
    expiresWithinHours,
    loadMaxKg,
    lots,
    minimumPayUsd,
    routeFilter,
  ]);
  const marketPageCount = Math.max(
    1,
    Math.ceil(filteredLots.length / MARKET_PAGE_SIZE),
  );
  const safeMarketPage = Math.min(marketPage, marketPageCount);
  const sortedLots = useMemo(() => {
    if (!marketSort) return filteredLots;
    const direction = marketSort.direction === 'asc' ? 1 : -1;
    return filteredLots
      .map((lot, index) => ({ lot, index }))
      .sort((a, b) => {
        let comparison = 0;
        switch (marketSort.key) {
          case 'distance':
            comparison =
              (a.lot.distanceNm ?? Number.POSITIVE_INFINITY) -
              (b.lot.distanceNm ?? Number.POSITIVE_INFINITY);
            break;
          case 'cargo':
            comparison = a.lot.commodityName.localeCompare(b.lot.commodityName);
            break;
          case 'load':
            comparison = a.lot.availableKg - b.lot.availableKg;
            break;
          case 'expires':
            comparison = a.lot.expiresAtTick - b.lot.expiresAtTick;
            break;
          case 'pay':
            comparison = a.lot.payUsd - b.lot.payUsd;
            break;
        }
        return comparison === 0 ? a.index - b.index : comparison * direction;
      })
      .map(({ lot }) => lot);
  }, [filteredLots, marketSort]);
  const pagedLots = sortedLots.slice(
    (safeMarketPage - 1) * MARKET_PAGE_SIZE,
    safeMarketPage * MARKET_PAGE_SIZE,
  );
  const hasMarketFilters = Boolean(
    routeFilter.trim() ||
      distanceMaxNm ||
      cargoFilter ||
      loadMaxKg ||
      expiresWithinHours ||
      minimumPayUsd,
  );

  function updateMarketFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setMarketPage(1);
  }

  function clearMarketFilters() {
    setRouteFilter('');
    setDistanceMaxNm('');
    setCargoFilter('');
    setLoadMaxKg('');
    setExpiresWithinHours('');
    setMinimumPayUsd('');
    setMarketPage(1);
  }

  function toggleMarketSort(key: MarketSortKey) {
    setMarketSort((current) => ({
      key,
      direction:
        current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
    setMarketPage(1);
  }

  function sortIndicator(key: MarketSortKey): string {
    if (marketSort?.key !== key) return '↕';
    return marketSort.direction === 'asc' ? '↑' : '↓';
  }

  const stagingExisting =
    staging?.intoMissionId && !staging.replaceManifest
      ? missions.find((m) => m.id === staging.intoMissionId)
      : undefined;
  const stagingExistingLots = stagingExisting?.lots?.length ?? 0;
  const stagingPayUsd = staging
    ? staging.lines.reduce(
        (sum, line) => sum + proRataPayUsd(line.lot, line.cargoKg),
        0,
      )
    : 0;
  const stagingTotalKg = staging ? stagingUsedKg(staging) : 0;
  const stagingFreeKg = staging
    ? Math.max(0, aircraftCapKg(staging.aircraft) - stagingTotalKg)
    : 0;
  const stagingValid =
    Boolean(staging) &&
    staging!.lines.length > 0 &&
    stagingRangeOk(staging!) &&
    routeFuelFeasible !== false &&
    staging!.lines.every((line) => {
      const maxKg = lineMaxKg(staging!, line.lot);
      return line.cargoKg > 0 && line.cargoKg <= maxKg;
    }) &&
    stagingExistingLots + staging!.lines.length <= MAX_STAGING_LOTS;
  const stagingDistanceNm = staging ? stagingRouteDistanceNm(staging) : undefined;
  const stagingInRange = staging ? stagingRangeOk(staging) : true;
  const stagingFuelOk = routeFuelFeasible !== false;
  const stagingCandidates = staging
    ? stagingRouteLots.filter(
        (lot) =>
          lot.originIcao === staging.originIcao &&
          lot.destIcao === staging.destIcao &&
          !staging.lines.some((line) => line.lot.id === lot.id) &&
          lot.availableKg > 0,
      )
    : [];

  const showAirport = airportIcao !== null && airportView !== null;
  const showStaging = tab === 'staging';
  const stagingMode: 'empty' | 'draft' | 'active' = staging
    ? 'draft'
    : activeMission
      ? 'active'
      : 'empty';
  const terminalMovementCount = showAirport
    ? (airportView.arrivals?.length ?? 0) + (airportView.departures?.length ?? 0)
    : 0;
  const terminalContractCount = showAirport
    ? airportView.outboundLots.length + airportView.inboundLots.length
    : 0;
  const activeMissionDistanceNm = activeMission
    ? lots.find(
        (lot) =>
          lot.originIcao === activeMission.originIcao &&
          lot.destIcao === activeMission.destIcao,
      )?.distanceNm
    : undefined;
  const activeMissionFuelEstKg =
    activeMission && !activeMission.fuelUplift
      ? estimateFuelUpliftKg(
          activeMission.aircraftClassId as AircraftClass,
          activeMissionDistanceNm ?? 0,
        )
      : undefined;

  return (
    <div className="shell">
      <div className="atmosphere" aria-hidden="true" />
      <header className="top">
        <div className="brand-block">
          <p className="brand">Skyline Career</p>
          <h1>
            {showAirport
              ? airportView.airport.icao
              : showStaging
                ? stagingMode === 'active'
                  ? 'Flight operations'
                  : stagingMode === 'draft'
                    ? 'Flight staging'
                    : 'Staging'
                : tab === 'fleet'
                  ? 'NPC fleet'
                  : tab === 'hangar'
                    ? 'Hangar'
                    : tab === 'pilot'
                      ? 'Pilot'
                      : tab === 'missions'
                        ? 'Logbook'
                        : 'Freight board'}
          </h1>
          <p className="lede">
            {showAirport
              ? `${airportView.airport.name} · ${airportView.airport.region} · ${airportView.airport.hubTier ?? 'spoke'} · level ${airportView.airport.level}`
              : showStaging
                ? stagingMode === 'active'
                  ? 'Dispatch, confirm OFP, preflight, and watch the active flight.'
                  : stagingMode === 'draft'
                    ? 'Build a same-route manifest, adjust each payload, then accept and open SimBrief.'
                    : 'Prepare a freight from the Market, or resume after settling the last flight.'
                : tab === 'fleet'
                  ? 'Competing freighters — who is idle, airborne, turning around, or resting.'
                  : tab === 'hangar'
                    ? 'Your aircraft — always parked at a terminal; ferry or fly cargo to relocate.'
                    : tab === 'pilot'
                      ? hubSelected
                        ? 'Company identity, fleet snapshot, and progression.'
                        : 'Register your name and home hub to start the career.'
                      : tab === 'missions'
                        ? 'Historical flights — settled, cancelled, and past operations.'
                        : 'Local cargo economy — prepare a flight, dispatch in SimBrief, watch it settle.'}
          </p>
        </div>
        <div className="metrics">
          {hubSelected && pilotName ? (
            <button
              type="button"
              className="metric pilot-chip"
              title="Open Pilot profile"
              onClick={() => selectTab('pilot')}
              disabled={busy}
            >
              <span className="label">Pilot</span>
              <strong>{pilotName}</strong>
            </button>
          ) : null}
          <div className="metric">
            <span className="label">Wallet</span>
            <strong>{formatMoney(wallet)}</strong>
          </div>
          <div className="metric" title="1 economy tick = 1 simulated hour">
            <span className="label">Clock</span>
            <strong>{formatClock(continuousHours)}</strong>
          </div>
          <div className="metric">
            <span className="label">Active</span>
            <strong>{activeCount}</strong>
          </div>
          <div className="metric" title="Competing freighters airborne or turning around">
            <span className="label">NPC busy</span>
            <strong>{npcBusy}</strong>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Board sections">
        {showAirport ? (
          <button
            type="button"
            className="tab"
            onClick={() => selectTab(tab)}
            disabled={busy}
          >
            ← Back
          </button>
        ) : null}
        <button
          type="button"
          className={!showAirport && tab === 'market' ? 'tab active' : 'tab'}
          onClick={() => selectTab('market')}
          disabled={busy}
        >
          Market
        </button>
        <button
          type="button"
          className={!showAirport && tab === 'pilot' ? 'tab active' : 'tab'}
          onClick={() => selectTab('pilot')}
          disabled={busy}
        >
          Pilot
          {hubSelected && homeHubIcao ? ` · ${homeHubIcao}` : ''}
        </button>
        <button
          type="button"
          className={!showAirport && tab === 'hangar' ? 'tab active' : 'tab'}
          onClick={() => selectTab('hangar')}
          disabled={busy}
        >
          Hangar
          {fleet[0] ? ` · ${fleet[0].locationIcao}` : ''}
        </button>
        <button
          type="button"
          className={!showAirport && tab === 'missions' ? 'tab active' : 'tab'}
          onClick={() => selectTab('missions')}
          disabled={busy}
        >
          Logbook
        </button>
        <button
          type="button"
          className={!showAirport && tab === 'fleet' ? 'tab active' : 'tab'}
          onClick={() => selectTab('fleet')}
          disabled={busy}
        >
          NPC fleet
        </button>
        <button
          type="button"
          className={!showAirport && showStaging ? 'tab active' : 'tab'}
          onClick={() => selectTab('staging')}
          disabled={busy}
          title={
            activeMission
              ? `${activeMission.originIcao}→${activeMission.destIcao} · ${activeMission.status}`
              : staging
                ? `${staging.originIcao}→${staging.destIcao} · ${staging.lines.length} staged lot(s)`
                : 'Flight staging / operations'
          }
        >
          Staging
          {activeMission
            ? ' · live'
            : staging
              ? ` (${staging.lines.length})`
              : ''}
        </button>
        <button
          type="button"
          className={!showAirport && tab === 'settings' ? 'tab active' : 'tab'}
          onClick={() => selectTab('settings')}
          disabled={busy}
        >
          Settings
        </button>
        {showAirport ? <span className="tab active terminal-tab">Terminal</span> : null}
        <div className="spacer" />
        <button
          type="button"
          className="action"
          onClick={() => void onTick()}
          disabled={busy}
          title="Advance the economy by 24 hours (1 day)"
        >
          +1 day
        </button>
        <button
          type="button"
          className="action ghost"
          onClick={onRefresh}
          disabled={busy}
        >
          Refresh
        </button>
        <button
          type="button"
          className="action ghost"
          onClick={() => void onResetBrazil()}
          disabled={busy}
          title="Clear the prototype save and initialize the Brazil-only world"
        >
          Reset Brazil
        </button>
      </nav>

      {error ? <p className="banner error">{error}</p> : null}
      {toast ? <p className={`banner ${toastKind === 'ok' ? 'ok' : toastKind}`}>{toast}</p> : null}

      {!hubSelected ? (
        <section className="panel hub-picker" role="dialog" aria-labelledby="hub-picker-title">
          <div className="panel-head">
            <div>
              <h2 id="hub-picker-title">Create pilot profile</h2>
              <p>
                Choose a callsign and home hub. Your starter Caravan parks there — load cargo only
                where the aircraft is parked, or ferry first.
              </p>
            </div>
          </div>
          <form
            className="pilot-signup"
            onSubmit={(e) => {
              e.preventDefault();
              void onSelectHub();
            }}
          >
            <label className="pilot-field">
              Pilot name
              <input
                type="text"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                maxLength={40}
                minLength={2}
                placeholder="e.g. Ada Skyline"
                disabled={busy}
                autoComplete="nickname"
                required
              />
            </label>
            <label className="pilot-field">
              Home hub
              <select
                value={signupHub}
                onChange={(e) => setSignupHub(e.target.value)}
                disabled={busy}
                required
              >
                <option value="">Select ICAO…</option>
                {(hubOptions.length > 0
                  ? hubOptions
                  : ['SBGR', 'SBGL', 'SBKP', 'SBCF', 'SBPA', 'SBRF']
                ).map((icao) => (
                  <option key={icao} value={icao}>
                    {icao}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="accept" disabled={busy || signupName.trim().length < 2 || !signupHub}>
              Start career
            </button>
          </form>
        </section>
      ) : null}

      {hubSelected && showAirport ? (
        <section className="panel airport-panel">
          <nav className="terminal-sections" aria-label="Terminal sections">
            <button
              type="button"
              className={
                terminalSection === 'inventory'
                  ? 'terminal-section active'
                  : 'terminal-section'
              }
              onClick={() => setTerminalSection('inventory')}
              disabled={busy}
            >
              Inventory
              {airportView.events && airportView.events.length > 0
                ? ` · ${airportView.events.length} event${airportView.events.length === 1 ? '' : 's'}`
                : ''}
            </button>
            <button
              type="button"
              className={
                terminalSection === 'contracts'
                  ? 'terminal-section active'
                  : 'terminal-section'
              }
              onClick={() => setTerminalSection('contracts')}
              disabled={busy}
            >
              Contracts ({terminalContractCount})
            </button>
            <button
              type="button"
              className={
                terminalSection === 'movements'
                  ? 'terminal-section active'
                  : 'terminal-section'
              }
              onClick={() => setTerminalSection('movements')}
              disabled={busy}
            >
              Movements ({terminalMovementCount})
            </button>
          </nav>

                {terminalSection === 'movements' ? (
                  <>
                    <div className="panel-head">
                      <div>
                        <h2>Live movements</h2>
                        <p>
                          Arrivals &amp; departures at {formatClock(continuousHours)}
                          <span className="live-dot" title="Auto-refreshes every 15s">
                            {' '}
                            · live
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="movement-grid">
                      <MovementBoard
                        title="Arrivals"
                        mode="arrivals"
                        rows={airportView.arrivals ?? []}
                        onOpen={openAirport}
                        busy={busy}
                        empty="No freighters inbound right now."
                        nowMs={displayNowMs}
                      />
                      <MovementBoard
                        title="Departures / outbound"
                        mode="departures"
                        rows={airportView.departures ?? []}
                        onOpen={openAirport}
                        busy={busy}
                        empty="No freighters outbound from this terminal."
                        nowMs={displayNowMs}
                      />
                    </div>
                  </>
                ) : null}

                {terminalSection === 'inventory' ? (
                  <>
                    <div className="panel-head">
                      <div>
                        <h2>Terminal inventory</h2>
                        <p>
                          {formatTonnes(airportView.totalStockTonnes * 1000)} total stock ·{' '}
                          {formatClock(continuousHours)}
                        </p>
                        {airportView.events && airportView.events.length > 0 ? (
                          <ul className="event-list">
                            {airportView.events.map((ev) => (
                              <li key={ev.id} className="event-badge">
                                {ev.label}
                                <small>
                                  {' '}
                                  · ends {formatClock(ev.endsAtTick)}
                                </small>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Commodity</th>
                            <th>Stock</th>
                            <th>Fill</th>
                            <th>Balance</th>
                            <th>Trend</th>
                            <th>Flow / hour</th>
                            <th>Local price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {airportView.commodities.map((c) => (
                            <tr key={c.commodityId}>
                              <td>
                                <strong>{c.name}</strong>
                                <small>
                                  {c.perishable
                                    ? 'Perishable'
                                    : c.highValue
                                      ? 'High value'
                                      : 'Standard'}
                                </small>
                              </td>
                              <td>
                                {formatTonnes(c.stockTonnes * 1000)}
                                <small>of {formatTonnes(c.capacityTonnes * 1000)}</small>
                              </td>
                              <td>
                                <div className="fill-bar" aria-hidden="true">
                                  <span
                                    style={{
                                      width: `${Math.min(100, c.fillPct * 100)}%`,
                                    }}
                                  />
                                </div>
                                <small>{(c.fillPct * 100).toFixed(0)}%</small>
                              </td>
                              <td>
                                <span className={`balance balance-${c.balance}`}>
                                  {c.balance}
                                </span>
                              </td>
                              <td>
                                <span className={`trend trend-${c.trend ?? 'stable'}`}>
                                  {c.trend ?? 'stable'}
                                </span>
                              </td>
                              <td>
                                +{formatTonnes(c.productionPerTickKg)}
                                <small>
                                  −{formatTonnes(c.consumptionPerTickKg)}
                                </small>
                              </td>
                              <td className="pay">
                                $
                                {(weightSystem === 'imperial'
                                  ? c.unitPriceUsd / KG_TO_LB
                                  : c.unitPriceUsd
                                ).toFixed(2)}
                                /{massUnitLabel(weightSystem)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}

                {terminalSection === 'contracts' ? (
                  <>
                    <div className="panel-head">
                      <div>
                        <h2>Contracts</h2>
                        <p>
                          {airportView.outboundLots.length} outbound ·{' '}
                          {airportView.inboundLots.length} inbound
                        </p>
                      </div>
                    </div>
                    <div className="airport-contracts">
                      <div>
                        <h3>Outbound</h3>
                        {airportView.outboundLots.length === 0 ? (
                          <p className="empty">No active outbound lots.</p>
                        ) : (
                          <ul className="contract-list">
                            {airportView.outboundLots.map((lot) => (
                              <li key={lot.id}>
                                <div className="route">
                                  <IcaoLink
                                    icao={lot.originIcao}
                                    onOpen={openAirport}
                                    disabled={busy}
                                  />
                                  <span className="arrow">→</span>
                                  <IcaoLink
                                    icao={lot.destIcao}
                                    onOpen={openAirport}
                                    disabled={busy}
                                  />
                                  {lot.urgency === 'urgent' ? (
                                    <span className="tag">Urgent</span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="accept contract-preflight"
                                    disabled={
                                      busy ||
                                      Boolean(activeMission) ||
                                      lot.status !== 'available' ||
                                      lot.availableKg <= 0
                                    }
                                    onClick={() => enterStagingFromContract(lot)}
                                    title={
                                      activeMission
                                        ? `Finish or cancel ${activeMission.id} in Staging first`
                                        : lot.status !== 'available' || lot.availableKg <= 0
                                          ? 'This contract is no longer available'
                                          : `Prepare ${lot.originIcao} → ${lot.destIcao}`
                                    }
                                  >
                                    {activeMission ? 'Flight busy' : 'Prepare Preflight'}
                                  </button>
                                </div>
                                <p>
                                  {lot.commodityName} · {formatTonnes(lot.availableKg)} ·{' '}
                                  {formatMoney(lot.payUsd)}
                                  {lot.distanceNm !== undefined
                                    ? ` · ${Math.round(lot.distanceNm).toLocaleString()} nm`
                                    : ''}
                                </p>
                                <NpcTakenBadge claim={lot.npcClaim} nowMs={displayNowMs} />
                                <LotExpiry
                                  lot={lot}
                                  tick={tick}
                                  continuousHours={continuousHours}
                                />
                                <small>{lot.reason}</small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h3>Inbound</h3>
                        {airportView.inboundLots.length === 0 ? (
                          <p className="empty">No active inbound lots.</p>
                        ) : (
                          <ul className="contract-list">
                            {airportView.inboundLots.map((lot) => (
                              <li key={lot.id}>
                                <div className="route">
                                  <IcaoLink
                                    icao={lot.originIcao}
                                    onOpen={openAirport}
                                    disabled={busy}
                                  />
                                  <span className="arrow">→</span>
                                  <IcaoLink
                                    icao={lot.destIcao}
                                    onOpen={openAirport}
                                    disabled={busy}
                                  />
                                  {lot.urgency === 'urgent' ? (
                                    <span className="tag">Urgent</span>
                                  ) : null}
                                </div>
                                <p>
                                  {lot.commodityName} · {formatTonnes(lot.availableKg)} ·{' '}
                                  {formatMoney(lot.payUsd)}
                                  {lot.distanceNm !== undefined
                                    ? ` · ${Math.round(lot.distanceNm).toLocaleString()} nm`
                                    : ''}
                                </p>
                                <NpcTakenBadge claim={lot.npcClaim} nowMs={displayNowMs} />
                                <LotExpiry
                                  lot={lot}
                                  tick={tick}
                                  continuousHours={continuousHours}
                                />
                                <small>{lot.reason}</small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}
        </section>
      ) : hubSelected && tab === 'market' ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Available freights</h2>
            <p>
              {lots.length} lots
              {npcActivity.length > 0
                ? ` · ${npcActivity.length} NPC airborne`
                : ''}
              {fleet.find((a) => a.status === 'parked')
                ? ` · aircraft at ${fleet.find((a) => a.status === 'parked')!.locationIcao}`
                : ''}
            </p>
            <RegionPressureChips regions={regionPressure} />
          </div>
          {marketEvents.length > 0 ? (
            <ul className="event-list market-events">
              {marketEvents.map((ev) => (
                <li key={ev.id} className={`event-badge shock-${ev.kind}`}>
                  <strong>{ev.region}</strong> · {ev.label}
                  <small>
                    {' '}
                    · ends {formatClock(ev.endsAtTick)}
                  </small>
                </li>
              ))}
            </ul>
          ) : null}
          {activeMission ? (
            <p className="banner warn">
              Active flight {activeMission.id} ({activeMission.originIcao}→
              {activeMission.destIcao}) — finish or cancel it in{' '}
              <button
                type="button"
                className="linkish"
                onClick={() => selectTab('staging')}
                disabled={busy}
              >
                Staging
              </button>{' '}
              before preparing another.
            </p>
          ) : fleet.find((a) => a.status === 'parked') ? (
            <p className="banner ok">
              Prepare freights from{' '}
              <strong>{fleet.find((a) => a.status === 'parked')!.locationIcao}</strong>
              . Other origins need a ferry from{' '}
              <button
                type="button"
                className="linkish"
                onClick={() => selectTab('hangar')}
                disabled={busy}
              >
                Hangar
              </button>
              .
            </p>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Route</th>
                  <th
                    aria-sort={
                      marketSort?.key === 'distance'
                        ? marketSort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="sort-header"
                      onClick={() => toggleMarketSort('distance')}
                    >
                      Distance <span>{sortIndicator('distance')}</span>
                    </button>
                  </th>
                  <th
                    aria-sort={
                      marketSort?.key === 'cargo'
                        ? marketSort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="sort-header"
                      onClick={() => toggleMarketSort('cargo')}
                    >
                      Cargo <span>{sortIndicator('cargo')}</span>
                    </button>
                  </th>
                  <th
                    aria-sort={
                      marketSort?.key === 'load'
                        ? marketSort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="sort-header"
                      onClick={() => toggleMarketSort('load')}
                    >
                      Load <span>{sortIndicator('load')}</span>
                    </button>
                  </th>
                  <th
                    aria-sort={
                      marketSort?.key === 'expires'
                        ? marketSort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="sort-header"
                      onClick={() => toggleMarketSort('expires')}
                    >
                      Expires <span>{sortIndicator('expires')}</span>
                    </button>
                  </th>
                  <th
                    aria-sort={
                      marketSort?.key === 'pay'
                        ? marketSort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="sort-header"
                      onClick={() => toggleMarketSort('pay')}
                    >
                      Pay <span>{sortIndicator('pay')}</span>
                    </button>
                  </th>
                  <th></th>
                </tr>
                <tr className="filter-row">
                  <th>
                    <input
                      type="search"
                      className="route-filter"
                      aria-label="Filter route by ICAO or city"
                      placeholder="ICAO / city"
                      value={routeFilter}
                      onChange={(e) =>
                        updateMarketFilter(setRouteFilter, e.target.value)
                      }
                    />
                  </th>
                  <th>
                    <select
                      aria-label="Maximum distance"
                      value={distanceMaxNm}
                      onChange={(e) =>
                        updateMarketFilter(setDistanceMaxNm, e.target.value)
                      }
                    >
                      <option value="">Any</option>
                      <option value="250">≤ 250 nm</option>
                      <option value="500">≤ 500 nm</option>
                      <option value="1000">≤ 1,000 nm</option>
                      <option value="2000">≤ 2,000 nm</option>
                    </select>
                  </th>
                  <th>
                    <select
                      aria-label="Cargo commodity"
                      value={cargoFilter}
                      onChange={(e) =>
                        updateMarketFilter(setCargoFilter, e.target.value)
                      }
                    >
                      <option value="">Any</option>
                      {cargoOptions.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <select
                      aria-label="Maximum cargo load"
                      value={loadMaxKg}
                      onChange={(e) =>
                        updateMarketFilter(setLoadMaxKg, e.target.value)
                      }
                    >
                      <option value="">Any</option>
                      <option value="1000">≤ 1 t</option>
                      <option value="2000">≤ 2 t</option>
                      <option value="5000">≤ 5 t</option>
                      <option value="10000">≤ 10 t</option>
                      <option value="20000">≤ 20 t</option>
                    </select>
                  </th>
                  <th>
                    <select
                      aria-label="Expires within"
                      value={expiresWithinHours}
                      onChange={(e) =>
                        updateMarketFilter(setExpiresWithinHours, e.target.value)
                      }
                    >
                      <option value="">Any</option>
                      <option value="6">≤ 6 h</option>
                      <option value="12">≤ 12 h</option>
                      <option value="24">≤ 24 h</option>
                      <option value="48">≤ 48 h</option>
                    </select>
                  </th>
                  <th>
                    <select
                      aria-label="Minimum pay"
                      value={minimumPayUsd}
                      onChange={(e) =>
                        updateMarketFilter(setMinimumPayUsd, e.target.value)
                      }
                    >
                      <option value="">Any</option>
                      <option value="1000">≥ $1,000</option>
                      <option value="5000">≥ $5,000</option>
                      <option value="10000">≥ $10,000</option>
                      <option value="25000">≥ $25,000</option>
                    </select>
                  </th>
                  <th>
                    {hasMarketFilters ? (
                      <button
                        type="button"
                        className="clear-filters"
                        onClick={clearMarketFilters}
                      >
                        Clear
                      </button>
                    ) : (
                      <span className="muted">Filters</span>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedLots.map((lot) => (
                  <tr key={lot.id}>
                    <td>
                      <div className="route">
                        <IcaoLink icao={lot.originIcao} onOpen={openAirport} disabled={busy} />
                        <span className="arrow">→</span>
                        <IcaoLink icao={lot.destIcao} onOpen={openAirport} disabled={busy} />
                        {lot.urgency === 'urgent' ? <span className="tag">Urgent</span> : null}
                        {lot.pressure?.thinFleet ? (
                          <span
                            className="tag pressure"
                            title={`${regionLabel(lot.pressure.originRegion || 'region')}: local competing fleet is thin — freights from this origin tend to pay more`}
                          >
                            Thin fleet
                          </span>
                        ) : null}
                        {lot.pressure?.laneBusy ? (
                          <span
                            className="tag saturated"
                            title={`NPC cargo already airborne on this lane (${Math.round((lot.pressure.laneSaturation || 0) * 100)}% saturated) — remaining slots are scarcer`}
                          >
                            Lane busy
                          </span>
                        ) : null}
                        {lot.pressure?.weather === 'marginal' ||
                        lot.pressure?.weather === 'poor' ? (
                          <span
                            className={`tag weather ${lot.pressure.weather}`}
                            title={`Simulated ${lot.pressure.weather} weather on this lane — richer / shorter-lived freights`}
                          >
                            {lot.pressure.weather}
                          </span>
                        ) : null}
                        {lot.pressure?.idleEscalated ? (
                          <span
                            className="tag idle"
                            title={`Freight has sat on the board — pay is up ${Math.round(((lot.pressure.idlePayMult || 1) - 1) * 100)}% vs formation`}
                          >
                            Idle +{Math.round(((lot.pressure.idlePayMult || 1) - 1) * 100)}%
                          </span>
                        ) : null}
                        {lot.pressure?.demandShock
                          ? (lot.pressure.shockLabels ?? ['Shock']).map((label) => (
                              <span
                                key={`${lot.id}-${label}`}
                                className="tag shock"
                                title={`Regional demand shock on this lane — freight pay ×${(lot.pressure?.shockPayMult ?? 1).toFixed(2)}`}
                              >
                                {label}
                              </span>
                            ))
                          : null}
                      </div>
                      <small>
                        {lot.originName} → {lot.destName}
                      </small>
                      <NpcTakenBadge claim={lot.npcClaim} nowMs={displayNowMs} />
                    </td>
                    <td className="distance">
                      {lot.distanceNm !== undefined
                        ? `${Math.round(lot.distanceNm).toLocaleString()} nm`
                        : '—'}
                    </td>
                    <td>
                      <strong>{lot.commodityName}</strong>
                      <small>{lot.reason}</small>
                    </td>
                    <td>{formatTonnes(lot.availableKg)}</td>
                    <td>
                      <LotExpiry lot={lot} tick={tick} continuousHours={continuousHours} />
                      {lot.perishable ? <small>Perishable</small> : null}
                    </td>
                    <td className="pay">{formatMoney(lot.payUsd)}</td>
                    <td>
                      <button
                        type="button"
                        className="accept"
                        disabled={busy || Boolean(activeMission)}
                        onClick={() => enterStaging(lot)}
                        title={
                          activeMission
                            ? `Finish or cancel ${activeMission.id} in Staging first`
                            : staging &&
                                staging.originIcao === lot.originIcao &&
                                staging.destIcao === lot.destIcao
                              ? 'Replace current staging draft with this lot as the starting line'
                              : 'Open flight staging to choose aircraft and payload'
                        }
                      >
                        {activeMission
                          ? 'Flight busy'
                          : staging &&
                              staging.originIcao === lot.originIcao &&
                              staging.destIcao === lot.destIcao
                            ? 'Restage route'
                            : 'Prepare flight'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredLots.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      {lots.length === 0
                        ? 'No lots yet — run +1 day to form market lanes.'
                        : 'No freights match the selected filters.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Freight pages">
            <p>
              {filteredLots.length === 0
                ? '0 records'
                : `${(safeMarketPage - 1) * MARKET_PAGE_SIZE + 1}–${Math.min(
                    safeMarketPage * MARKET_PAGE_SIZE,
                    filteredLots.length,
                  )} of ${filteredLots.length}`}
            </p>
            <div>
              <button
                type="button"
                disabled={safeMarketPage <= 1}
                onClick={() => setMarketPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </button>
              <span>
                Page {safeMarketPage} of {marketPageCount}
              </span>
              <button
                type="button"
                disabled={safeMarketPage >= marketPageCount}
                onClick={() =>
                  setMarketPage((page) => Math.min(marketPageCount, page + 1))
                }
              >
                Next
              </button>
            </div>
          </nav>

          <div className="panel-head npc-head">
            <h2>NPC freights in progress</h2>
            <p>
              {npcActivity.length} airborne · open{' '}
              <button type="button" className="linkish" onClick={() => selectTab('fleet')}>
                NPC fleet
              </button>{' '}
              for full roster
            </p>
          </div>
          <NpcActivityList
            rows={npcActivity}
            onOpen={openAirport}
            busy={busy}
            empty="No competing freighters airborne right now."
            nowMs={displayNowMs}
          />
        </section>
      ) : hubSelected && showStaging ? (
        <section className="panel staging-panel">
          {stagingMode === 'empty' ? (
            <>
              <div className="panel-head missions-head">
                <div>
                  <h2>No active flight</h2>
                  <p>
                    Staging is empty after settle or cancel. Your aircraft is at{' '}
                    <strong>
                      {fleet.find((a) => a.status === 'parked')?.locationIcao ?? '—'}
                    </strong>
                    . Prepare a freight from that origin on the Market.
                  </p>
                </div>
                <button
                  type="button"
                  className="accept"
                  onClick={() => selectTab('market')}
                  disabled={busy}
                >
                  Open Market
                </button>
              </div>
              <div className="staging-empty">
                <p>
                  One operational flight at a time. History stays in the{' '}
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => selectTab('missions')}
                    disabled={busy}
                  >
                    Logbook
                  </button>
                  .
                </p>
              </div>
            </>
          ) : stagingMode === 'draft' && staging ? (
            <>
              <div className="panel-head missions-head">
                <div>
                  <h2>
                    {staging.originIcao} → {staging.destIcao}
                  </h2>
                  <p>
                    {staging.originName} → {staging.destName} ·{' '}
                    {aircraftClassLabel(staging.aircraft)}
                    {staging.replaceManifest
                      ? ` · editing ${staging.intoMissionId}`
                      : stagingExisting
                        ? ` · adding to ${stagingExisting.id}`
                        : ' · new flight'}
                  </p>
                </div>
                <div className="staging-head-actions">
                  <label className="staging-aircraft">
                    Aircraft
                    <select
                      value={staging.aircraft}
                      onChange={(event) =>
                        changeStagingAircraft(event.target.value as AircraftClass)
                      }
                      disabled={
                        busy ||
                        Boolean(staging.aircraftId) ||
                        Boolean(staging.replaceManifest)
                      }
                      title={
                        staging.aircraftId || staging.replaceManifest
                          ? 'Class locked to the assigned aircraft'
                          : undefined
                      }
                    >
                      <option value="narrow_freighter">Narrow (B738 BCF)</option>
                      <option value="wide_freighter">Wide (MD-11F)</option>
                      <option value="light_turboprop">Light TP (C208 Caravan)</option>
                      <option value="light_ga">Light GA (BE36 Bonanza)</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="action ghost"
                    onClick={exitStaging}
                    disabled={busy}
                  >
                    {staging.replaceManifest ? 'Back to flight' : 'Back to market'}
                  </button>
                </div>
              </div>

              <div className="cargo-capacity staging-capacity">
                <span>
                  Operational payload
                  <strong>{formatTonnes(aircraftCapKg(staging.aircraft))}</strong>
                  <em>
                    {structuralMaxCargoKg !== null
                      ? `structural ${formatTonnes(structuralMaxCargoKg)}`
                      : 'structural pending'}
                    {' · MTOW/fuel estimate'}
                  </em>
                </span>
                <span>
                  Route distance
                  <strong>
                    {stagingDistanceNm !== undefined
                      ? `${Math.round(stagingDistanceNm).toLocaleString()} nm`
                      : '—'}
                  </strong>
                  <em>max {aircraftMaxRangeNm(staging.aircraft).toLocaleString()} nm</em>
                </span>
                <span>
                  Planning fuel
                  <strong>
                    {estimatedBlockFuelKg !== null
                      ? formatTonnes(estimatedBlockFuelKg)
                      : '—'}
                  </strong>
                  <em>
                    {routeFuelCapacityKg !== null
                      ? `tank max ${formatTonnes(routeFuelCapacityKg)}`
                      : airframeLabel ?? 'homologated class'}
                    {maxCargoSource ? ` · ${maxCargoSource}` : ''}
                  </em>
                </span>
                <span>
                  Manifest total
                  <strong>{formatTonnes(stagingTotalKg)}</strong>
                </span>
                <span>
                  Remaining
                  <strong>{formatTonnes(stagingFreeKg)}</strong>
                </span>
                <span>
                  Contract pay
                  <strong>
                    {formatMoney(stagingPayUsd + (stagingExisting?.payUsd ?? 0))}
                  </strong>
                </span>
              </div>

              {!stagingInRange ? (
                <p className="banner error">
                  This route exceeds {aircraftClassLabel(staging.aircraft)} range
                  {stagingDistanceNm !== undefined
                    ? ` (${Math.round(stagingDistanceNm)} nm > ${aircraftMaxRangeNm(staging.aircraft)} nm)`
                    : ''}
                  . Choose a longer-range aircraft before Accept &amp; Dispatch.
                </p>
              ) : null}

              {!stagingFuelOk ? (
                <p className="banner error">
                  Estimated block fuel exceeds tank capacity
                  {estimatedBlockFuelKg !== null &&
                  routeFuelCapacityKg !== null
                    ? ` (${formatTonnes(estimatedBlockFuelKg)} required > ${formatTonnes(routeFuelCapacityKg)} max`
                    : ''}
                  {routeFuelDeficitKg !== null && routeFuelDeficitKg > 0
                    ? ` · deficit ${formatTonnes(routeFuelDeficitKg)}`
                    : ''}
                  {estimatedBlockFuelKg !== null &&
                  routeFuelCapacityKg !== null
                    ? ')'
                    : ''}
                  . Choose a shorter route or an aircraft with more range before
                  Dispatch.
                </p>
              ) : null}

              {stagingExisting && (stagingExisting.lots?.length ?? 0) > 0 ? (
                <div className="staging-section">
                  <h3>Already on this flight</h3>
                  <ul className="staging-existing">
                    {stagingExisting.lots!.map((line) => (
                      <li key={`${line.shipmentLotId}-${line.commodityId}`}>
                        {formatTonnes(line.cargoKg)} {line.commodityId} ·{' '}
                        {formatMoney(line.payUsd)}
                        {line.urgency === 'urgent' ? ' · urgent' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="staging-section">
                <h3>
                  Staged lots ({staging.lines.length}
                  {stagingExistingLots
                    ? ` + ${stagingExistingLots} existing`
                    : ''}
                  /{MAX_STAGING_LOTS})
                </h3>
                <ul className="staging-lines">
                  {staging.lines.map((line) => {
                    const maxKg = lineMaxKg(staging, line.lot);
                    const valid = line.cargoKg > 0 && line.cargoKg <= maxKg;
                    const displayMax = Math.max(
                      0,
                      Math.floor(kgToDisplay(maxKg, weightSystem)),
                    );
                    const displayValue = Math.round(
                      kgToDisplay(line.cargoKg, weightSystem),
                    );
                    const unit = massUnitLabel(weightSystem);
                    return (
                      <li key={line.lot.id} className="staging-line">
                        <div className="staging-line-head">
                          <div>
                            <strong>{line.lot.commodityName}</strong>
                            {line.lot.urgency === 'urgent' ? (
                              <span className="tag">Urgent</span>
                            ) : null}
                            <small>{line.lot.reason}</small>
                          </div>
                          <button
                            type="button"
                            className="action ghost danger"
                            disabled={busy}
                            onClick={() => {
                              if (staging.lines.length <= 1) {
                                setStaging(null);
                              } else {
                                removeStagingLine(line.lot.id);
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>
                        <p className="staging-line-meta">
                          Lot {formatTonnes(line.lot.availableKg)} available · max this line{' '}
                          {formatTonnes(maxKg)} · pay{' '}
                          {formatMoney(proRataPayUsd(line.lot, line.cargoKg))}
                        </p>
                        <label className="cargo-amount">
                          Load to reserve
                          <div>
                            <input
                              type="number"
                              min={1}
                              max={Math.max(1, displayMax)}
                              step={weightSystem === 'imperial' ? 10 : 100}
                              value={displayValue}
                              onChange={(e) =>
                                updateStagingLineKg(
                                  line.lot.id,
                                  displayToKg(Number(e.target.value), weightSystem),
                                )
                              }
                              disabled={busy}
                            />
                            <span>{unit}</span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={Math.max(1, displayMax)}
                            step={1}
                            value={Math.min(displayValue, Math.max(1, displayMax))}
                            onChange={(e) =>
                              updateStagingLineKg(
                                line.lot.id,
                                displayToKg(Number(e.target.value), weightSystem),
                              )
                            }
                            disabled={busy || displayMax <= 0}
                            aria-label={`${line.lot.commodityName} load in ${massUnitLong(weightSystem)}`}
                          />
                        </label>
                        <div className="cargo-presets">
                          {[0.25, 0.5, 0.75, 1].map((fraction) => (
                            <button
                              key={fraction}
                              type="button"
                              onClick={() => setStagingLineFraction(line.lot.id, fraction)}
                              disabled={busy || maxKg <= 0}
                            >
                              {fraction === 1 ? 'Max' : `${fraction * 100}%`}
                            </button>
                          ))}
                        </div>
                        {!valid ? (
                          <p className="cargo-dialog-error">
                            Choose between 1 and{' '}
                            {formatMassExact(maxKg, weightSystem)}.
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="staging-section">
                <h3>Same-route lots to add</h3>
                {stagingExistingLots + staging.lines.length >= MAX_STAGING_LOTS ? (
                  <p className="empty">Manifest lot cap reached ({MAX_STAGING_LOTS}).</p>
                ) : stagingRouteLotsLoading ? (
                  <p className="empty">Loading all available lots on this route…</p>
                ) : stagingRouteLotsError ? (
                  <p className="empty">
                    Could not load route lots: {stagingRouteLotsError}
                  </p>
                ) : stagingCandidates.length === 0 ? (
                  <p className="empty">No other available lots on this route.</p>
                ) : (
                  <ul className="staging-candidates">
                    {stagingCandidates.map((lot) => {
                      const room = stagingRemainingKg(staging);
                      const maxKg = Math.min(lot.availableKg, room);
                      return (
                        <li key={lot.id}>
                          <div>
                            <strong>{lot.commodityName}</strong>
                            {lot.urgency === 'urgent' ? (
                              <span className="tag">Urgent</span>
                            ) : null}
                            <small>
                              {formatTonnes(lot.availableKg)} · {formatMoney(lot.payUsd)}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="accept"
                            disabled={busy || maxKg <= 0}
                            onClick={() => addLotToStaging(lot)}
                          >
                            {maxKg <= 0 ? 'No room' : `Add · up to ${formatTonnes(maxKg)}`}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="staging-footer">
                <p>
                  {staging.lines.length} staged · {formatTonnes(stagingTotalKg)} ·{' '}
                  {formatMoney(stagingPayUsd + (stagingExisting?.payUsd ?? 0))} total
                </p>
                <div className="cargo-dialog-actions">
                  <button
                    type="button"
                    className="action ghost"
                    onClick={exitStaging}
                    disabled={busy}
                  >
                    {staging.replaceManifest ? 'Back to flight' : 'Back to market'}
                  </button>
                  <button
                    type="button"
                    className="accept"
                    disabled={busy || !stagingValid}
                    onClick={() => void onCommitStaging()}
                  >
                    {staging.replaceManifest
                      ? 'Save & re-dispatch'
                      : 'Accept & Dispatch'}
                  </button>
                </div>
              </div>
            </>
          ) : activeMission ? (
            <>
              <div className="panel-head missions-head">
                <div>
                  <h2>
                    <IcaoLink
                      icao={activeMission.originIcao}
                      onOpen={openAirport}
                      disabled={busy}
                    />{' '}
                    →{' '}
                    <IcaoLink
                      icao={activeMission.destIcao}
                      onOpen={openAirport}
                      disabled={busy}
                    />
                  </h2>
                  <p>
                    {activeMission.id} · {aircraftClassLabel(activeMission.aircraftClassId)} ·{' '}
                    <span className={`status status-${activeMission.status}`}>
                      {activeMission.status}
                    </span>
                  </p>
                </div>
                <div className="staging-ops-head-actions">
                  {!simbriefUser.trim() ? (
                    <button
                      type="button"
                      className="action ghost compact-dispatch"
                      onClick={() => selectTab('settings')}
                      disabled={busy}
                      title="Set your SimBrief username in Settings"
                    >
                      Set SimBrief user
                    </button>
                  ) : (
                    <span className="settings-chip" title="Change in Settings">
                      SimBrief · {simbriefUser.trim()}
                    </span>
                  )}
                  {activeMission.status === 'dispatched' ? (
                    <button
                      type="button"
                      className="action ghost compact-dispatch"
                      disabled={busy}
                      onClick={() => void onDispatch(activeMission)}
                      title="Re-open SimBrief with the current cargo"
                    >
                      Re-open Dispatch
                    </button>
                  ) : null}
                  {['accepted', 'dispatched'].includes(activeMission.status) ? (
                    <button
                      type="button"
                      className="action ghost danger compact-dispatch"
                      disabled={busy}
                      title="Cancel mission and return reserved cargo to the market"
                      onClick={() => void onCancel(activeMission)}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="cargo-capacity staging-capacity staging-ops-capacity">
                <span>
                  Cargo
                  <strong>{formatTonnes(activeMission.cargoKg)}</strong>
                  <em>
                    {(activeMission.lots?.length ?? 1) > 1
                      ? `${activeMission.lots!.length} lots`
                      : '1 lot'}
                  </em>
                </span>
                <span>
                  Contract
                  <strong>{formatMoney(activeMission.payUsd)}</strong>
                </span>
                <span>
                  Deadline
                  <strong>
                    {formatDeadline(activeMission.deadlineTick, continuousHours)}
                  </strong>
                </span>
                <span>
                  Capacity left
                  <strong>
                    {formatTonnes(
                      Math.max(
                        0,
                        fallbackMaxCargoKg(activeMission.aircraftClassId as AircraftClass) -
                          activeMission.cargoKg,
                      ),
                    )}
                  </strong>
                </span>
              </div>

              <p className="staging-ops-reason">
                {formatWeightText(activeMission.reason, weightSystem)}
              </p>
              <p className="staging-ops-reason">
                {activeMission.fuelUplift
                  ? `Fuel uplift ${formatTonnes(activeMission.fuelUplift.requestedKg)} · ${formatMoney(activeMission.fuelUplift.costUsd)} · ${activeMission.fuelUplift.scarcity} @ ${activeMission.fuelUplift.originIcao}`
                  : activeMissionFuelEstKg !== undefined
                    ? `Est. Jet-A uplift ~${formatTonnes(activeMissionFuelEstKg)} at ${activeMission.originIcao} (charged on Depart)`
                    : `Jet-A uplift charged on Depart from ${activeMission.originIcao}`}
              </p>

              {(activeMission.lots?.length ?? 0) > 0 ||
              ['accepted', 'dispatched'].includes(activeMission.status) ? (
                <div className="staging-section">
                  <div className="staging-section-head">
                    <h3>Cargo</h3>
                    {['accepted', 'dispatched'].includes(activeMission.status) ? (
                      <button
                        type="button"
                        className="action compact"
                        disabled={busy}
                        title="Adjust payload or lots, then regenerate the OFP"
                        onClick={() => void enterEditManifest(activeMission)}
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                  {(activeMission.lots?.length ?? 0) > 0 ? (
                    <ul className="staging-existing">
                      {activeMission.lots!.map((line) => (
                        <li key={`${line.shipmentLotId}-${line.commodityId}`}>
                          {formatTonnes(line.cargoKg)} {line.commodityId} ·{' '}
                          {formatMoney(line.payUsd)}
                          {line.urgency === 'urgent' ? ' · urgent' : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty">No cargo lots on this flight yet.</p>
                  )}
                </div>
              ) : null}

              {activeMission.lastOfpCheck
                ? (() => {
                    const check = activeMission.lastOfpCheck;
                    const briefing = check.briefing;
                    const actionableFindings = check.findings.filter(
                      (finding) => finding.severity !== 'info',
                    );
                    const cruise =
                      briefing?.cruiseAltitudeFt !== undefined
                        ? briefing.cruiseAltitudeFt >= 18_000
                          ? `FL${String(
                              Math.round(briefing.cruiseAltitudeFt / 100),
                            ).padStart(3, '0')}`
                          : `${Math.round(
                              briefing.cruiseAltitudeFt,
                            ).toLocaleString('en-US')} FT`
                        : undefined;
                    const briefingItems = [
                      briefing?.aircraftIcao
                        ? ['Aircraft', briefing.aircraftIcao]
                        : null,
                      briefing?.tailNumber
                        ? ['Tail number', briefing.tailNumber]
                        : null,
                      briefing?.distanceNm !== undefined
                        ? ['Distance', `${Math.round(briefing.distanceNm)} NM`]
                        : null,
                      briefing?.blockTime
                        ? ['Block time', briefing.blockTime]
                        : null,
                      cruise ? ['Cruise', cruise] : null,
                      briefing?.alternateIcao
                        ? ['Alternate', briefing.alternateIcao]
                        : null,
                    ].filter(
                      (item): item is [string, string] => item !== null,
                    );

                    return (
                      <section
                        className={`ofp-result-card ofp-briefing-card ofp-result-${check.verdict}`}
                        aria-live="polite"
                      >
                        <div className="ofp-result-head">
                          <strong>
                            {check.verdict === 'pass'
                              ? 'OFP PASSED'
                              : check.verdict === 'warn'
                                ? 'OFP NEEDS REVIEW'
                                : 'OFP FAILED'}
                          </strong>
                          <span>
                            Checked{' '}
                            {new Date(check.checkedAtIso).toLocaleTimeString()}
                          </span>
                        </div>

                        {briefingItems.length > 0 ? (
                          <dl className="ofp-briefing-grid">
                            {briefingItems.map(([label, value]) => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}

                        {briefing?.route ? (
                          <div className="ofp-route-strip">
                            <span>Route</span>
                            <code>{briefing.route}</code>
                          </div>
                        ) : (
                          <p>Re-check SimBrief to load the operational route.</p>
                        )}

                        {actionableFindings.length > 0 ? (
                          <details className="preflight-technical">
                            <summary>
                              {actionableFindings.length}{' '}
                              {actionableFindings.length === 1
                                ? 'OFP detail'
                                : 'OFP details'}
                            </summary>
                            <ul className="ofp-findings">
                              {actionableFindings.map((finding) => (
                                <li
                                  key={`ofp-${finding.code}-${finding.message}`}
                                  className={`finding-${finding.severity}`}
                                >
                                  [{finding.severity.toUpperCase()}]{' '}
                                  {formatWeightText(finding.message, weightSystem)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </section>
                    );
                  })()
                : activeMission.status === 'dispatched' && activeMission.staticId ? (
                <div className="ofp-auto-wait" aria-live="polite">
                  <span className={ofpAutoStatus === 'checking' ? 'poll-dot checking' : 'poll-dot'} />
                  <div>
                    <strong>
                      {!simbriefUser.trim()
                        ? 'Set your SimBrief user in Settings to enable automatic OFP confirmation'
                        : ofpAutoStatus === 'checking'
                          ? 'Checking SimBrief for OFP…'
                          : 'Waiting for OFP'}
                    </strong>
                    {simbriefUser.trim() ? (
                      <small>Automatic check every 15 seconds while Staging is open.</small>
                    ) : (
                      <small>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => selectTab('settings')}
                        >
                          Open Settings
                        </button>
                      </small>
                    )}
                  </div>
                </div>
                ) : null}

              {activeMission.status === 'dispatched' &&
              activeMission.staticId &&
              activeMission.lastOfpCheck?.verdict === 'fail' ? (
                <div className="ofp-auto-wait" aria-live="polite">
                  <span
                    className={
                      ofpAutoStatus === 'checking'
                        ? 'poll-dot checking'
                        : 'poll-dot'
                    }
                  />
                  <div>
                    <strong>
                      {ofpAutoStatus === 'checking'
                        ? 'Checking for an updated OFP…'
                        : 'Waiting for the updated OFP'}
                    </strong>
                    <small>
                      The previous OFP does not match. Retrying automatically
                      every 15 seconds.
                    </small>
                  </div>
                </div>
              ) : null}

              {activeMission.status === 'dispatched' &&
              (activeMission.lastOfpCheck?.verdict === 'pass' ||
                activeMission.lastOfpCheck?.verdict === 'warn') &&
              activeMission.fuelAuthorizedOfpId !== activeMission.lastOfpCheck.ofpId ? (
                missionFuelQuote ? (
                  <section className="fuel-purchase-card" aria-live="polite">
                    <div className="fuel-purchase-head">
                      <div>
                        <strong>FUEL PURCHASE REQUIRED</strong>
                        <small>
                          Persisted fuel is below the confirmed OFP block fuel.
                        </small>
                      </div>
                      <span>{missionFuelQuote.quote.uplift.scarcity}</span>
                    </div>
                    <dl className="fuel-purchase-grid">
                      <div>
                        <dt>On aircraft</dt>
                        <dd>
                          {formatMassExact(
                            missionFuelQuote.quote.currentFuelKg,
                            weightSystem,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>OFP block fuel</dt>
                        <dd>
                          {formatMassExact(
                            missionFuelQuote.quote.requiredBlockFuelKg,
                            weightSystem,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>To purchase</dt>
                        <dd>
                          {formatMassExact(
                            missionFuelQuote.quote.shortfallKg,
                            weightSystem,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>{formatMoney(missionFuelQuote.quote.uplift.costUsd)}</dd>
                      </div>
                    </dl>
                    <div className="fuel-purchase-footer">
                      <small>
                        Wallet {formatMoney(missionFuelQuote.walletUsd)} →{' '}
                        {formatMoney(missionFuelQuote.walletAfterUsd)}
                        {missionFuelQuote.quote.uplift.scarcity !== 'ok'
                          ? ' · tanker surcharge included'
                          : ` · ${formatMoney(
                              missionFuelQuote.quote.uplift.unitPriceUsd,
                            )}/kg`}
                      </small>
                      <button
                        type="button"
                        className="action"
                        disabled={busy || missionFuelQuoteStatus === 'loading'}
                        onClick={() => void onBuyMissionFuel(activeMission)}
                      >
                        Buy fuel &amp; continue
                      </button>
                    </div>
                  </section>
                ) : missionFuelQuoteStatus === 'error' ? (
                  <div className="ofp-auto-wait fuel-quote-error" aria-live="polite">
                    <span className="poll-dot off" />
                    <div>
                      <strong>Could not calculate OFP fuel purchase</strong>
                      <small>{missionFuelQuoteError}</small>
                    </div>
                    <button
                      type="button"
                      className="action ghost compact"
                      onClick={() =>
                        setMissionFuelQuoteRetryToken((token) => token + 1)
                      }
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="ofp-auto-wait" aria-live="polite">
                    <span className="poll-dot checking" />
                    <div>
                      <strong>Checking persisted aircraft fuel…</strong>
                      <small>Comparing the career tank with OFP block fuel.</small>
                    </div>
                  </div>
                )
              ) : null}

              {activeMission.status === 'dispatched' &&
              Boolean(activeMission.lastOfpCheck?.ofpId) &&
              activeMission.fuelAuthorizedOfpId ===
                activeMission.lastOfpCheck?.ofpId &&
              !activeMission.lastPreflightCheck?.loadVerification?.ready
                ? (() => {
                    const method = preferredLoadMethod(activeMission);
                    const inject =
                      method === 'direct-injection' &&
                      missionInjectCapable(activeMission) &&
                      !preferManualLoad;
                    const title = inject
                      ? loadOfpAutoStatus === 'failed'
                        ? 'Fuel purchased · aircraft load failed'
                        : !simBridge?.connected
                          ? 'Fuel purchased · waiting for SimBridge'
                          : loadOfpAutoStatus === 'loading'
                            ? 'Loading OFP fuel and cargo into the aircraft…'
                            : 'Fuel purchased · preparing Skyline inject'
                      : preferManualLoad || method === 'native-simbrief'
                        ? method === 'native-simbrief' && !preferManualLoad
                          ? 'Import OFP in the aircraft EFB'
                          : 'Load manually, then Validate'
                        : 'Load fuel and payload';
                    const detail = inject
                      ? loadOfpAutoStatus === 'failed'
                        ? loadOfpAutoError ??
                          'Retry inject, or continue manually; live validation stays active.'
                        : !simBridge?.connected
                          ? 'Start the local SimBridge host with npm run start:local. Loading resumes automatically.'
                          : 'Loaded vs Due updates live after inject. CG is advisory on Preflight.'
                      : method === 'native-simbrief' && !preferManualLoad
                        ? 'Use Import SimBrief / Load OFP on the aircraft EFB or FMC. Loaded vs Due updates automatically.'
                        : 'Set fuel and payload in Mass & Balance / EFB. Loaded vs Due updates automatically.';
                    return (
                      <div
                        className={`ofp-auto-wait fuel-pipeline-status ${
                          loadOfpAutoStatus === 'failed' ? 'fuel-pipeline-failed' : ''
                        }`}
                        aria-live="polite"
                      >
                        <span
                          className={`poll-dot ${
                            inject && loadOfpAutoStatus === 'loading'
                              ? 'checking'
                              : ''
                          }`}
                        />
                        <div>
                          <strong>{title}</strong>
                          <small>
                            Preferred method:{' '}
                            {method === 'direct-injection'
                              ? 'Skyline inject'
                              : 'Native SimBrief EFB'}
                            {preferManualLoad ? ' · manual override' : ''}
                            <br />
                            {detail}
                          </small>
                        </div>
                        <div className="fuel-pipeline-actions">
                          {inject && loadOfpAutoStatus === 'failed' ? (
                            <button
                              type="button"
                              className="action ghost compact"
                              disabled={busy}
                              onClick={() => retryAutoLoadOfp()}
                            >
                              Retry inject
                            </button>
                          ) : null}
                          {inject ? (
                            <button
                              type="button"
                              className="action ghost compact"
                              disabled={busy}
                              onClick={() => continueManuallyLoad()}
                            >
                              Continue manually
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()
                : null}

              <div className="mission-actions staging-ops-actions">
                {activeMission.status === 'accepted' ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={busy}
                    onClick={() => void onDispatch(activeMission)}
                    title="Re-open SimBrief with the current cargo without editing"
                  >
                    Dispatch
                  </button>
                ) : null}
                {['accepted', 'dispatched'].includes(activeMission.status) ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={busy}
                    title="Mark cargo airborne without MSFS"
                    onClick={() => void onDepart(activeMission)}
                  >
                    Depart
                  </button>
                ) : null}
                {['accepted', 'dispatched', 'in_flight'].includes(activeMission.status) ? (
                  <button
                    type="button"
                    className="action ghost"
                    disabled={busy}
                    title="Deliver cargo and credit wallet without MSFS"
                    onClick={() => void onSettle(activeMission)}
                  >
                    Settle
                  </button>
                ) : null}
              </div>

              {activeMission.lastPreflightCheck
                ? (() => {
                    const check = activeMission.lastPreflightCheck;
                    const verification = check.loadVerification;
                    const ready = verification?.ready ?? check.verdict !== 'fail';
                    const canInjectPayload =
                      preferredLoadMethod(activeMission) === 'direct-injection' &&
                      missionInjectCapable(activeMission);
                    const noteLabel =
                      verification?.weightNoteCount &&
                      verification.weightNoteCount === check.findings.length
                        ? `${verification.weightNoteCount} weight ${
                            verification.weightNoteCount === 1 ? 'note' : 'notes'
                          }`
                        : `${check.findings.length} technical ${
                            check.findings.length === 1 ? 'detail' : 'details'
                          }`;
                    const massFromLb = (lb: number | undefined) =>
                      lb === undefined
                        ? 'Not available'
                        : formatMassExact(lb / KG_TO_LB, weightSystem);

                    return (
                      <section
                        className={`ofp-result-card preflight-summary-card ofp-result-${
                          ready ? 'pass' : 'fail'
                        }`}
                        aria-live="polite"
                      >
                        <div className="ofp-result-head">
                          <div>
                            <strong>
                              {ready ? 'PREFLIGHT READY' : 'PREFLIGHT FAILED'}
                            </strong>
                            <small>
                              {ready
                                ? 'Fuel and cargo match the confirmed OFP.'
                                : 'Fix the mismatched aircraft load before departure.'}
                            </small>
                          </div>
                          <div className="preflight-head-actions">
                            <span>
                              Checked {new Date(check.checkedAtIso).toLocaleTimeString()}
                            </span>
                            {canInjectPayload ? (
                              <button
                                type="button"
                                className="action compact"
                                disabled={
                                  busy ||
                                  !simBridge?.connected ||
                                  verification?.aircraft.onGround === false
                                }
                                onClick={() =>
                                  void onLoadFuelAndPayload(activeMission)
                                }
                                title="Load OFP fuel and payload into the aircraft"
                              >
                                Load Fuel &amp; Payload
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {verification ? (
                          <div className="preflight-load-grid">
                            <div
                              className={
                                verification.fuel.ok
                                  ? 'preflight-load-ok'
                                  : 'preflight-load-fail'
                              }
                            >
                              <span>Fuel</span>
                              <strong>
                                Sim {massFromLb(verification.fuel.liveLb)}
                              </strong>
                              <small>
                                Due {massFromLb(verification.fuel.plannedLb)}
                              </small>
                              <b>{verification.fuel.ok ? '✓' : '✗'}</b>
                            </div>
                            <div
                              className={
                                verification.payload.ok
                                  ? 'preflight-load-ok'
                                  : 'preflight-load-fail'
                              }
                            >
                              <span>Payload</span>
                              <strong>
                                Sim {massFromLb(verification.payload.liveLb)}
                              </strong>
                              <small>
                                Due {massFromLb(verification.payload.plannedLb)}
                              </small>
                              <b>{verification.payload.ok ? '✓' : '✗'}</b>
                            </div>
                            {verification.cg ? (
                              <div
                                className={
                                  verification.cg.ok
                                    ? 'preflight-load-ok'
                                    : 'preflight-load-warn'
                                }
                              >
                                <span>CG</span>
                                <strong>
                                  {verification.cg.liveMac !== undefined
                                    ? `${verification.cg.liveMac.toFixed(1)}% MAC`
                                    : 'n/a'}
                                </strong>
                                <small>
                                  {verification.cg.minMac !== undefined &&
                                  verification.cg.maxMac !== undefined
                                    ? `envelope ${verification.cg.minMac}–${verification.cg.maxMac}`
                                    : 'advisory only'}
                                </small>
                                <b>
                                  {verification.cg.severity === 'warn' ? '⚠' : 'ℹ'}
                                </b>
                              </div>
                            ) : null}
                            <div className="preflight-aircraft-state">
                              <span>Aircraft</span>
                              <strong>
                                {verification.aircraft.onGround
                                  ? 'On ground'
                                  : 'Airborne'}
                              </strong>
                              <small>
                                {verification.aircraft.enginesRunning
                                  ? 'Engines running'
                                  : 'Engines off'}
                              </small>
                              <b>
                                {verification.aircraft.onGround &&
                                !verification.aircraft.enginesRunning
                                  ? 'READY'
                                  : 'CHECK'}
                              </b>
                            </div>
                          </div>
                        ) : (
                          <p>Waiting for live Loaded vs Due data…</p>
                        )}

                        {check.findings.length > 0 ? (
                          <details className="preflight-technical">
                            <summary>{noteLabel}</summary>
                            <ul className="ofp-findings">
                              {check.findings.map((finding) => (
                                <li
                                  key={`pre-${finding.code}-${finding.message}`}
                                  className={`finding-${finding.severity}`}
                                >
                                  [{finding.severity.toUpperCase()}]{' '}
                                  {formatWeightText(finding.message, weightSystem)}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </section>
                    );
                  })()
                : null}

              {(() => {
                const watchingThis =
                  watch?.missionId === activeMission.id &&
                  (watch.running || Boolean(watch.settlement) || Boolean(watch.lastError));
                const showWaitPanel =
                  !watchingThis &&
                  (watchAutoStatus === 'waiting' ||
                    watchAutoStatus === 'connecting' ||
                    watchAutoStatus === 'blocked' ||
                    loadOfpAutoStatus === 'waiting' ||
                    loadOfpAutoStatus === 'loading' ||
                    loadOfpAutoStatus === 'failed' ||
                    (Boolean(activeMission.lastPreflightCheck) &&
                      activeMission.lastPreflightCheck!.verdict !== 'fail' &&
                      !watchAutoPaused));
                if (!watchingThis && !showWaitPanel) return null;

                const watchRunning = Boolean(
                  watch?.running && watch.missionId === activeMission.id,
                );
                const bridgeConnected = Boolean(
                  watchRunning || simBridge?.connected,
                );
                const bridgeOnGround =
                  watchRunning && watch?.onGround !== null && watch?.onGround !== undefined
                    ? watch.onGround
                    : simBridge?.onGround ?? null;
                const bridgeEngines =
                  watchRunning &&
                  watch?.enginesRunning !== null &&
                  watch?.enginesRunning !== undefined
                    ? watch.enginesRunning
                    : simBridge?.enginesRunning ?? null;
                const phaseLabel = watchRunning
                  ? watch?.phase ?? 'sampling'
                  : watchAutoStatus === 'connecting'
                    ? 'connecting watch'
                    : watchAutoStatus === 'waiting'
                      ? 'waiting to start watch'
                      : watchAutoStatus === 'blocked'
                        ? 'watch held'
                        : simBridge?.phase ?? 'idle';
                const stageDetail =
                  bridgeOnGround === true
                    ? bridgeEngines
                      ? 'On ground · engines running'
                      : 'On ground · engines off'
                    : bridgeOnGround === false
                      ? 'Airborne'
                      : watchAutoStatus === 'blocked'
                        ? 'Watch not started — Preflight failed'
                        : bridgeConnected
                          ? 'Sampling live aircraft…'
                          : watchAutoStatus === 'waiting' ||
                              watchAutoStatus === 'connecting'
                            ? 'SimBridge not connected yet'
                            : 'No live aircraft sample';

                const statusLabel =
                  loadOfpAutoStatus === 'loading'
                    ? 'LOADING OFP…'
                    : loadOfpAutoStatus === 'waiting' &&
                        (activeMission.lastOfpCheck?.verdict === 'pass' ||
                          activeMission.lastOfpCheck?.verdict === 'warn') &&
                        !activeMission.lastPreflightCheck?.loadVerification?.ready
                      ? 'WAITING TO LOAD OFP'
                      : watchRunning
                        ? 'MSFS CONNECTED'
                        : watchAutoStatus === 'blocked'
                          ? 'WATCH BLOCKED'
                          : watchAutoStatus === 'connecting'
                            ? 'CONNECTING…'
                            : bridgeConnected
                              ? 'SIMBRIDGE CONNECTED'
                              : watchAutoPaused
                                ? 'WATCH PAUSED'
                                : 'WAITING FOR MSFS';

                return (
                  <footer
                    className={`watch-status-footer ${
                      loadOfpAutoStatus === 'failed'
                        ? 'watch-blocked'
                        : watchRunning
                          ? 'watch-connected'
                          : watchAutoStatus === 'blocked'
                            ? 'watch-blocked'
                            : bridgeConnected || loadOfpAutoStatus === 'loading'
                              ? 'watch-connected'
                              : 'watch-waiting'
                    }`}
                    aria-live="polite"
                  >
                    <div className="watch-footer-primary">
                      <span
                        className={`watch-dot ${
                          loadOfpAutoStatus === 'loading' ||
                          watchAutoStatus === 'connecting'
                            ? 'checking'
                            : watchRunning || bridgeConnected
                              ? 'on'
                              : 'off'
                        }`}
                      />
                      <strong>{statusLabel}</strong>
                      <div className="watch-footer-item">
                        <span>Phase</span>
                        <b>{stageDetail}</b>
                      </div>
                      <div className="watch-footer-item">
                        <span>Mission</span>
                        <b>{activeMission.status}</b>
                      </div>
                      {watch?.position ? (
                        <div className="watch-footer-item">
                          <span>Position</span>
                          <b>
                            {watch.position.lat.toFixed(3)}, {watch.position.lon.toFixed(3)}
                          </b>
                        </div>
                      ) : null}
                    </div>
                    <div className="watch-footer-secondary">
                      <span>{phaseLabel}</span>
                      {loadOfpAutoError ? (
                        <span className="watch-footer-error">{loadOfpAutoError}</span>
                      ) : null}
                      {watch?.lastEvent && watch.lastEvent.type !== 'none' ? (
                        <span>
                          {watch.lastEvent.type === 'settle_blocked'
                            ? `Blocked: ${watch.lastEvent.reason}`
                            : `${watch.lastEvent.type}: ${watch.lastEvent.reason}`}
                        </span>
                      ) : null}
                      {watch?.lastError ? (
                        <span className="watch-footer-error">{watch.lastError}</span>
                      ) : simBridge?.error &&
                        !bridgeConnected &&
                        watchAutoStatus !== 'blocked' ? (
                        <span className="watch-footer-error">{simBridge.error}</span>
                      ) : null}
                      {watch?.settlement ? (
                        <span>
                          Paid {formatMoney(watch.settlement.payoutUsd)}
                          {watch.settlement.onTime
                            ? ' on time'
                            : ` · late ${watch.settlement.lateTicks}h`}
                        </span>
                      ) : null}
                    </div>
                  </footer>
                );
              })()}
            </>
          ) : null}
        </section>
      ) : hubSelected && tab === 'settings' ? (
        <section className="panel settings-panel">
          <div className="panel-head">
            <div>
              <h2>Settings</h2>
              <p>Integrations and display preferences for this browser.</p>
            </div>
          </div>
          <div className="settings-grid">
            <div className="settings-card">
              <h3>SimBrief</h3>
              <p className="settings-help">
                Used for Dispatch redirect, automatic OFP confirmation, auto OFP load, and Preflight.
                Stored only in this browser.
              </p>
              <label className="simbrief-field">
                Username
                <input
                  type="text"
                  value={simbriefUser}
                  onChange={(e) => setSimbriefUser(e.target.value)}
                  placeholder="navigraph alias"
                  disabled={busy}
                  autoComplete="username"
                  spellCheck={false}
                />
              </label>
            </div>
            <div className="settings-card">
              <h3>Weight system</h3>
              <p className="settings-help">
                Changes cargo, fuel, and capacity labels across the board. Dispatch also
                sends this unit to SimBrief so the OFP matches your preference. Internal
                mission data stays in kilograms.
              </p>
              <div className="settings-choice" role="radiogroup" aria-label="Weight system">
                <button
                  type="button"
                  className={
                    weightSystem === 'metric'
                      ? 'settings-choice-btn active'
                      : 'settings-choice-btn'
                  }
                  onClick={() => setWeightSystem('metric')}
                  disabled={busy}
                >
                  Metric
                  <small>tonnes / kg · SimBrief KGS</small>
                </button>
                <button
                  type="button"
                  className={
                    weightSystem === 'imperial'
                      ? 'settings-choice-btn active'
                      : 'settings-choice-btn'
                  }
                  onClick={() => setWeightSystem('imperial')}
                  disabled={busy}
                >
                  Imperial
                  <small>klb / lb · SimBrief LBS</small>
                </button>
              </div>
              <p className="settings-sample">
                Example · Caravan structural max:{' '}
                <strong>{formatTonnes(1_704, weightSystem)}</strong>
                {' · '}
                <strong>{formatMassExact(1_704, weightSystem)}</strong>
              </p>
            </div>
          </div>
        </section>
      ) : hubSelected && tab === 'pilot' ? (
        <section className="panel pilot-panel">
          <div className="panel-head">
            <div>
              <h2>Pilot profile</h2>
              <p>Company identity and fleet at a glance.</p>
            </div>
          </div>
          <div className="pilot-profile-grid">
            <div className="pilot-card">
              <h3>Identity</h3>
              <dl className="pilot-dl">
                <div>
                  <dt>Name</dt>
                  <dd>{pilotName || 'Pilot'}</dd>
                </div>
                <div>
                  <dt>Home hub</dt>
                  <dd>
                    {homeHubIcao ? (
                      <IcaoLink icao={homeHubIcao} onOpen={openAirport} disabled={busy} />
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>Registered</dd>
                </div>
              </dl>
            </div>
            <div className="pilot-card">
              <h3>Company</h3>
              <dl className="pilot-dl">
                <div>
                  <dt>Wallet</dt>
                  <dd>{formatMoney(wallet)}</dd>
                </div>
                <div>
                  <dt>Active flights</dt>
                  <dd>{activeCount}</dd>
                </div>
                <div>
                  <dt>Aircraft</dt>
                  <dd>{fleet.length}</dd>
                </div>
              </dl>
            </div>
            <div className="pilot-card pilot-card-wide">
              <h3>Progression</h3>
              <dl className="pilot-dl muted">
                <div>
                  <dt>Experience</dt>
                  <dd>Coming soon</dd>
                </div>
                <div>
                  <dt>Rank (Patente)</dt>
                  <dd>Coming soon</dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="pilot-fleet-block">
            <div className="panel-head missions-head">
              <div>
                <h3>Fleet snapshot</h3>
                <p>Current parking and fuel. Ferry from Hangar.</p>
              </div>
              <button
                type="button"
                className="accept"
                onClick={() => selectTab('hangar')}
                disabled={busy}
              >
                Open Hangar
              </button>
            </div>
            {fleet.length === 0 ? (
              <p className="empty">No aircraft yet.</p>
            ) : (
              <ul className="hangar-list">
                {fleet.map((acf) => (
                  <li key={acf.id} className="hangar-card">
                    <div className="hangar-main">
                      <div className="route">
                        <strong>{acf.label}</strong>
                        <span className={`status status-${acf.status}`}>{acf.status}</span>
                      </div>
                      <p>
                        {aircraftClassLabel(acf.aircraftClassId)} · at{' '}
                        <IcaoLink icao={acf.locationIcao} onOpen={openAirport} disabled={busy} />
                      </p>
                      <p className="payline">
                        Fuel {formatTonnes(acf.fuelKg)} / {formatTonnes(acf.fuelCapacityKg)}
                      </p>
                      <div className="fill-bar" aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.min(
                              100,
                              (acf.fuelKg / Math.max(1, acf.fuelCapacityKg)) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : hubSelected && tab === 'hangar' ? (
        <section className="panel hangar-panel">
          <div className="panel-head">
            <div>
              <h2>Company hangar</h2>
              <p>
                Aircraft must be at the mission origin to prepare cargo. Instant ferry moves them
                for a fee + Jet-A.
              </p>
            </div>
            {!fleet.some((a) => a.aircraftClassId === 'light_ga') ? (
              <button
                type="button"
                className="accept"
                onClick={() => void onAcquireBonanza()}
                disabled={busy}
              >
                Add Bonanza
              </button>
            ) : null}
          </div>
          {fleet.length === 0 ? (
            <p className="empty">No aircraft yet — pick a starter hub.</p>
          ) : (
            <ul className="hangar-list">
              {fleet.map((acf) => (
                <li key={acf.id} className="hangar-card">
                  <div className="hangar-main">
                    <div className="route">
                      <strong>{acf.label}</strong>
                      <span className={`status status-${acf.status}`}>{acf.status}</span>
                    </div>
                    <p>
                      {aircraftClassLabel(acf.aircraftClassId)} · at{' '}
                      <IcaoLink icao={acf.locationIcao} onOpen={openAirport} disabled={busy} />
                      {acf.assignedMissionId ? ` · mission ${acf.assignedMissionId}` : ''}
                    </p>
                    <p className="payline">
                      Fuel {formatTonnes(acf.fuelKg)} / {formatTonnes(acf.fuelCapacityKg)}
                    </p>
                    <div className="fill-bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.min(100, (acf.fuelKg / Math.max(1, acf.fuelCapacityKg)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  {acf.status === 'parked' ? (
                    <div className="hangar-ferry">
                      <label className="staging-aircraft">
                        Ferry to
                        <select
                          value={ferryDest}
                          onChange={(e) => setFerryDest(e.target.value)}
                          disabled={busy}
                        >
                          <option value="">Select hub…</option>
                          {hubOptions
                            .filter((h) => h !== acf.locationIcao)
                            .map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="accept"
                        disabled={busy || !ferryDest}
                        onClick={() => void onFerry(acf.id, ferryDest)}
                      >
                        Ferry now
                      </button>
                    </div>
                  ) : (
                    <p className="empty">Assigned — finish or cancel the flight in Staging.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : hubSelected && tab === 'fleet' ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Competing fleet</h2>
              <p>
                {npcBusy} busy · {npcSummary.airborne} airborne · {npcSummary.turnaround}{' '}
                turnaround · {npcSummary.resting} resting · {npcSummary.idle} idle
                <span className="live-dot" title="Auto-refreshes every 15s; clock ticks every second">
                  {' '}
                  · live
                </span>
              </p>
              <RegionPressureChips regions={regionPressure} />
            </div>
          </div>
          <FleetRoster
            fleet={npcFleet}
            onOpen={openAirport}
            busy={busy}
            nowMs={displayNowMs}
          />
        </section>
      ) : !hubSelected ? null : (
        <section className="panel logbook-panel">
          <div className="panel-head">
            <div>
              <h2>Logbook</h2>
              <p>
                Read-only flight history. Operate the current flight from Staging.
              </p>
            </div>
            {activeMission ? (
              <button
                type="button"
                className="accept"
                onClick={() => selectTab('staging')}
                disabled={busy}
              >
                Open Staging
              </button>
            ) : null}
          </div>
          <ul className="mission-list logbook-list">
            {[...missions]
              .sort(
                (a, b) =>
                  (b.acceptedAtTick ?? 0) - (a.acceptedAtTick ?? 0) ||
                  b.id.localeCompare(a.id),
              )
              .map((m) => (
                <li key={m.id} className="mission logbook-entry">
                  <div className="mission-main">
                    <div className="route">
                      <IcaoLink icao={m.originIcao} onOpen={openAirport} disabled={busy} />
                      <span className="arrow">→</span>
                      <IcaoLink icao={m.destIcao} onOpen={openAirport} disabled={busy} />
                      <span className={`status status-${m.status}`}>{m.status}</span>
                      {isActiveMissionStatus(m.status) ? (
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => selectTab('staging')}
                          disabled={busy}
                        >
                          Operate in Staging
                        </button>
                      ) : null}
                      {m.lastOfpCheck ? (
                        <span className={`ofp-verdict ofp-${m.lastOfpCheck.verdict}`}>
                          OFP {m.lastOfpCheck.verdict}
                        </span>
                      ) : null}
                      {m.lastPreflightCheck ? (
                        <span className={`ofp-verdict ofp-${m.lastPreflightCheck.verdict}`}>
                          Preflight {m.lastPreflightCheck.verdict}
                        </span>
                      ) : null}
                    </div>
                    <p>
                      {m.id} · {formatTonnes(m.cargoKg)}
                      {(m.lots?.length ?? 1) > 1 ? ` · ${m.lots!.length} lots` : ''} ·{' '}
                      {aircraftClassLabel(m.aircraftClassId)} · deadline{' '}
                      {formatDeadline(m.deadlineTick, continuousHours)}
                      {m.acceptedAtTick !== undefined
                        ? ` · accepted T${m.acceptedAtTick}`
                        : ''}
                      {m.dispatchedAtTick !== undefined
                        ? ` · dispatched T${m.dispatchedAtTick}`
                        : ''}
                      {m.departedAtTick !== undefined
                        ? ` · departed T${m.departedAtTick}`
                        : ''}
                      {m.settledAtTick !== undefined
                        ? ` · settled T${m.settledAtTick}`
                        : ''}
                    </p>
                    <p className="payline">
                      Contract {formatMoney(m.payUsd)}
                      {m.payoutUsd !== undefined
                        ? ` · paid ${formatMoney(m.payoutUsd)}`
                        : ''}
                      {m.fuelUplift
                        ? ` · fuel −${formatMoney(m.fuelUplift.costUsd)} (${formatTonnes(m.fuelUplift.requestedKg)}${m.fuelUplift.scarcity !== 'ok' ? ` · ${m.fuelUplift.scarcity}` : ''})`
                        : ''}
                      {m.settledFuelKg !== undefined
                        ? ` · remaining ${formatTonnes(m.settledFuelKg)}`
                        : ''}
                      {m.payoutUsd !== undefined
                        ? ` · net ${formatMoney(
                            m.payoutUsd - (m.fuelUplift?.costUsd ?? 0),
                          )}`
                        : ''}
                    </p>
                    <small>{formatWeightText(m.reason, weightSystem)}</small>
                    {(m.lots?.length ?? 0) > 0 ? (
                      <ul className="ofp-findings logbook-lots">
                        {m.lots!.map((line) => (
                          <li key={`${line.shipmentLotId}-${line.commodityId}`}>
                            {formatTonnes(line.cargoKg)} {line.commodityId} ·{' '}
                            {formatMoney(line.payUsd)}
                            {line.urgency === 'urgent' ? ' · urgent' : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {m.lastOfpCheck ? (
                      <ul className="ofp-findings">
                        {m.lastOfpCheck.findings.map((f) => (
                          <li
                            key={`ofp-${f.code}-${f.message}`}
                            className={`finding-${f.severity}`}
                          >
                            [OFP {f.severity}]{' '}
                            {formatWeightText(f.message, weightSystem)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {m.lastPreflightCheck ? (
                      <ul className="ofp-findings">
                        {m.lastPreflightCheck.findings.map((f) => (
                          <li
                            key={`pre-${f.code}-${f.message}`}
                            className={`finding-${f.severity}`}
                          >
                            [Live {f.severity}]{' '}
                            {formatWeightText(f.message, weightSystem)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            {missions.length === 0 ? (
              <li className="empty">
                No flights logged yet — prepare a freight from the Market.
              </li>
            ) : null}
          </ul>
        </section>
      )}

      <footer className="foot">
        Saves to <code>profiles/career/</code> · same engine as <code>npm run career</code>
      </footer>
      {confirmDialog}
    </div>
  );
}
