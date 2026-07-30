import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAirport,
  fetchMarket,
  fetchMissions,
  fetchNpcFleet,
  fetchState,
  fetchWatchStatus,
  postCancel,
  postConfirmOfp,
  postDepart,
  postDispatch,
  postInitBrazil,
  postPreflight,
  postSettle,
  postStagingCommit,
  postTick,
  postWatchStart,
  postWatchStop,
  type AircraftClass,
  type AirportLot,
  type AirportMovement,
  type AirportView,
  type MarketLot,
  type Mission,
  type NpcActivity,
  type NpcFleetMember,
  type WatchStatus,
} from './api';

type Tab = 'market' | 'missions' | 'fleet' | 'staging';
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
  intoMissionId?: string;
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

function formatTonnes(kg: number): string {
  return `${(kg / 1000).toFixed(1)} t`;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

function aircraftClassLabel(id: string): string {
  if (id === 'wide_freighter') return 'Wide';
  if (id === 'light_turboprop') return 'Caravan';
  if (id === 'narrow_freighter') return 'Narrow';
  return id.replace(/_/g, ' ');
}

function fallbackMaxCargoKg(aircraft: AircraftClass): number {
  if (aircraft === 'wide_freighter') return 90_000;
  if (aircraft === 'light_turboprop') return 1_704;
  return 18_137;
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
}) {
  if (!props.claim) return null;
  const eta = liveEtaHours({
    arrivesAtMs: props.claim.arrivesAtMs,
    nowMs: props.nowMs,
    fallbackHours: props.claim.etaHours,
  });
  return (
    <span className="npc-badge" title={`${formatTonnes(props.claim.cargoKg)} reserved by NPC`}>
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
              {row.npcName} · {row.commodityName} · {formatTonnes(row.cargoKg)} · ETA{' '}
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
                  {row.commodityName} · {formatTonnes(row.cargoKg)}
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
            const phase =
              mission != null
                ? livePhase(eta, mission.phase)
                : npc.phase === 'turnaround' && (turnaroundLeft ?? 0) <= 0
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
                <td>{npc.homeRegion}</td>
                <td>
                  <span className={`phase-tag phase-${phase}`}>{phaseLabel(phase)}</span>
                  {phase === 'turnaround' && turnaroundLeft !== undefined ? (
                    <small>free in {formatDuration(turnaroundLeft)}</small>
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
                        {mission.commodityName} · {formatTonnes(mission.cargoKg)} · ETA{' '}
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
  const [tab, setTab] = useState<Tab>('market');
  const [airportIcao, setAirportIcao] = useState<string | null>(null);
  const [airportView, setAirportView] = useState<AirportView | null>(null);
  const [aircraft, setAircraft] = useState<AircraftClass>('narrow_freighter');
  const [tick, setTick] = useState(0);
  const [lastBatchAtMs, setLastBatchAtMs] = useState(Date.now());
  const [msPerTick, setMsPerTick] = useState(MS_PER_TICK_DEFAULT);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [displayNowMs, setDisplayNowMs] = useState(Date.now());
  const [wallet, setWallet] = useState(0);
  const [lots, setLots] = useState<MarketLot[]>([]);
  const [npcActivity, setNpcActivity] = useState<NpcActivity[]>([]);
  const [npcBusy, setNpcBusy] = useState(0);
  const [npcFleet, setNpcFleet] = useState<NpcFleetMember[]>([]);
  const [npcSummary, setNpcSummary] = useState({
    airborne: 0,
    turnaround: 0,
    idle: 0,
  });
  const [missions, setMissions] = useState<Mission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'ok' | 'warn' | 'fail'>('ok');
  const [simbriefUser, setSimbriefUser] = useState(loadSimbriefUser);
  const [maxCargoKg, setMaxCargoKg] = useState<number | null>(null);
  const [watch, setWatch] = useState<WatchStatus | null>(null);
  const [marketPage, setMarketPage] = useState(1);
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

  const refresh = useCallback(async () => {
    setError(null);
    const [state, market, missionState, npcState] = await Promise.all([
      fetchState(),
      fetchMarket(aircraft),
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
    setNpcActivity(npcState.activity.length ? npcState.activity : market.npcActivity ?? []);
    setNpcBusy(npcState.busy);
    setNpcFleet(npcState.fleet);
    setNpcSummary({
      airborne: npcState.airborne,
      turnaround: npcState.turnaround,
      idle: npcState.idle,
    });
    setMaxCargoKg(market.maxCargoKg ?? null);
    setMissions(missionState.missions.slice().reverse());
    if (airportIcao) {
      const view = await fetchAirport(airportIcao);
      setAirportView(view);
    }
  }, [aircraft, airportIcao]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [refresh]);

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
                    : ` · late ${status.settlement!.lateTicks}h (−${formatMoney(status.settlement!.penaltyUsd)})`),
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
    }, watch?.running ? 2_000 : 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [watch?.running, refresh]);

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

  const activeCount = useMemo(
    () =>
      missions.filter((m) =>
        ['accepted', 'dispatched', 'in_flight'].includes(m.status),
      ).length,
    [missions],
  );

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
    await run(async () => {
      const view = await fetchAirport(icao);
      setAirportView(view);
      setAirportIcao(icao.toUpperCase());
    }, { refreshAfter: false });
  }

  function closeAirport() {
    setAirportIcao(null);
    setAirportView(null);
  }

  function selectTab(next: Tab) {
    closeAirport();
    if (next === 'staging' && staging) {
      setAircraft(staging.aircraft);
    }
    setTab(next);
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
    const confirmed = window.confirm(
      'Reset the local career to the Brazil-only world? This clears missions and wallet.',
    );
    if (!confirmed) return;
    await run(async () => {
      const result = await postInitBrazil();
      setToastKind('ok');
      setToast(`Brazil world initialized · ${result.airports} airports`);
      closeAirport();
      setStaging(null);
      setTab('market');
    });
  }

  function openFlightForRoute(
    originIcao: string,
    destIcao: string,
    aircraftClass: AircraftClass = aircraft,
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

  function openFlightForLot(lot: MarketLot): Mission | undefined {
    return openFlightForRoute(lot.originIcao, lot.destIcao);
  }

  function aircraftCapKg(aircraftClass: AircraftClass = aircraft): number {
    return aircraftClass === aircraft
      ? maxCargoKg ?? fallbackMaxCargoKg(aircraftClass)
      : fallbackMaxCargoKg(aircraftClass);
  }

  function stagingUsedKg(draft: StagingDraft): number {
    const existing = draft.intoMissionId
      ? missions.find((m) => m.id === draft.intoMissionId)?.cargoKg ?? 0
      : 0;
    return (
      existing + draft.lines.reduce((sum, line) => sum + line.cargoKg, 0)
    );
  }

  function stagingRemainingKg(draft: StagingDraft, excludeLotId?: string): number {
    const existing = draft.intoMissionId
      ? missions.find((m) => m.id === draft.intoMissionId)?.cargoKg ?? 0
      : 0;
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

  function enterStaging(lot: MarketLot) {
    const openFlight = openFlightForLot(lot);
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
      intoMissionId: openFlight?.id,
      lines: [],
    };
    const maxKg = lineMaxKg(draft, lot);
    if (maxKg <= 0) {
      setError(
        openFlight
          ? `Flight ${openFlight.id} is full`
          : 'No cargo capacity available',
      );
      return;
    }
    draft.lines = [{ lot, cargoKg: defaultStagingKg(maxKg) }];
    setStaging(draft);
    setError(null);
    closeAirport();
    setTab('staging');
  }

  function exitStaging() {
    if (busy) return;
    setTab('market');
  }

  function changeStagingAircraft(next: AircraftClass) {
    if (!staging || busy || next === staging.aircraft) return;
    const openFlight = openFlightForRoute(
      staging.originIcao,
      staging.destIcao,
      next,
    );
    setStaging({
      ...staging,
      aircraft: next,
      intoMissionId: openFlight?.id,
    });
    setAircraft(next);
    setMarketPage(1);
  }

  function updateStagingLineKg(lotId: string, rawKg: number) {
    setStaging((current) => {
      if (!current) return current;
      return {
        ...current,
        lines: current.lines.map((line) => {
          if (line.lot.id !== lotId) return line;
          const maxKg = lineMaxKg(current, line.lot);
          const cargoKg = Math.max(1, Math.min(maxKg, Math.floor(rawKg) || 0));
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
        fraction >= 1
          ? maxKg
          : Math.max(1, Math.min(maxKg, Math.floor((maxKg * fraction) / 100) * 100));
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
        (current.intoMissionId
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
        missionId: staging.intoMissionId,
        openDispatch: true,
        lines: staging.lines.map((line) => ({
          lotId: line.lot.id,
          cargoKg: line.cargoKg,
        })),
      });
      setStaging(null);
      setToastKind('ok');
      const rem =
        result.remainingKg !== undefined
          ? ` · ${Math.round(result.remainingKg).toLocaleString()} kg left`
          : '';
      const dispatchNote = result.dispatch
        ? ` · SimBrief ${result.dispatch.airframeLabel}`
        : '';
      setToast(
        `${result.appended ? 'Updated' : 'Created'} ${result.mission.id} · ${
          result.lineCount ?? staging.lines.length
        } lot(s) · ${(result.mission.cargoKg / 1000).toFixed(1)} t${rem}${dispatchNote}`,
      );
      setTab('missions');
    });
  }

  async function onDispatch(mission: Mission) {
    await run(async () => {
      const result = await postDispatch({ missionId: mission.id, open: true });
      setToastKind('ok');
      setToast(
        `SimBrief opened · ${result.airframeLabel} · Generate OFP, then Confirm OFP`,
      );
    });
  }

  async function onCancel(mission: Mission) {
    const ok = window.confirm(
      `Cancel mission ${mission.id}?\nReleases ${mission.lots?.length ?? 1} lot reservation(s) back to the market when still active. No payout.`,
    );
    if (!ok) return;
    await run(async () => {
      const result = await postCancel({ missionId: mission.id });
      setToastKind(result.warning ? 'warn' : 'ok');
      setToast(
        result.returnedToMarket
          ? `Cancelled ${result.mission.id} · ${(result.releasedKg / 1000).toFixed(1)} t released to market`
          : `Cancelled ${result.mission.id} · ${result.warning ?? 'no active lot to release'}`,
      );
    });
  }

  async function onConfirmOfp(mission: Mission) {
    const user = simbriefUser.trim();
    if (!user) {
      setError('Enter your SimBrief username above before Confirm OFP');
      return;
    }
    await run(async () => {
      const result = await postConfirmOfp({
        missionId: mission.id,
        simbriefUser: user,
      });
      const cargo =
        result.ofp.cargoKg !== undefined
          ? ` · OFP cargo ${Math.round(result.ofp.cargoKg)} kg`
          : '';
      setToastKind(result.check.verdict === 'pass' ? 'ok' : result.check.verdict);
      setToast(`Intent→OFP ${result.check.verdict.toUpperCase()}${cargo}`);
    });
  }

  async function onPreflight(mission: Mission) {
    const user = simbriefUser.trim();
    if (!user) {
      setError('Enter your SimBrief username above before Preflight');
      return;
    }
    if (!mission.staticId) {
      setError('Dispatch first so Preflight can fetch the OFP by static_id');
      return;
    }
    await run(async () => {
      const result = await postPreflight({
        missionId: mission.id,
        simbriefUser: user,
      });
      const fuel = `fuel ${Math.round(result.live.fuelTotalLb)} lb`;
      const payload =
        result.live.payloadTotalLb !== undefined
          ? ` · payload ${Math.round(result.live.payloadTotalLb)} lb`
          : '';
      setToastKind(result.check.verdict === 'pass' ? 'ok' : result.check.verdict);
      setToast(
        `Preflight ${result.check.verdict.toUpperCase()} · ${result.check.phase} · ${fuel}${payload}`,
      );
    });
  }

  async function onWatch(mission: Mission) {
    if (watch?.running && watch.missionId === mission.id) {
      await run(async () => {
        const status = await postWatchStop();
        setWatch(status);
        setToastKind('ok');
        setToast('Watch stopped');
      });
      return;
    }
    let allowDepartOverride = false;
    if (mission.lastPreflightCheck?.verdict === 'fail') {
      const ok = window.confirm(
        `Preflight failed for ${mission.id}.\nStart Watch anyway and allow auto-depart on wheels-up?`,
      );
      if (!ok) return;
      allowDepartOverride = true;
    }
    await run(async () => {
      const status = await postWatchStart({
        missionId: mission.id,
        intervalSec: 5,
        allowDepartOverride,
      });
      setWatch(status);
      setToastKind(allowDepartOverride ? 'warn' : 'ok');
      setToast(
        allowDepartOverride
          ? `Watching ${mission.id} with depart override — auto-settle near ${mission.destIcao}`
          : `Watching ${mission.id} via MSFS — auto-depart on wheels-up, auto-settle near ${mission.destIcao}`,
      );
    });
  }

  async function onDepart(mission: Mission) {
    let override = false;
    if (mission.lastPreflightCheck?.verdict === 'fail') {
      const ok = window.confirm(
        `Preflight failed for ${mission.id}.\nDepart anyway without fixing fuel/payload?`,
      );
      if (!ok) return;
      override = true;
    }
    await run(async () => {
      const result = await postDepart({ missionId: mission.id, override });
      setToastKind(override ? 'warn' : 'ok');
      setToast(
        override
          ? `Departed ${result.mission.id} with preflight override · in_flight`
          : `Departed ${result.mission.id} · status in_flight`,
      );
    });
  }

  async function onSettle(mission: Mission) {
    const ok = window.confirm(
      `Settle mission ${mission.id} now?\nDelivers cargo to ${mission.destIcao} and credits the wallet (no MSFS check).`,
    );
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
            : ` · late ${result.settlement.lateTicks}h (−${formatMoney(result.settlement.penaltyUsd)})`),
      );
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
    return lots.filter((lot) => {
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

  const stagingExisting = staging?.intoMissionId
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
    staging!.lines.every((line) => {
      const maxKg = lineMaxKg(staging!, line.lot);
      return line.cargoKg > 0 && line.cargoKg <= maxKg;
    }) &&
    stagingExistingLots + staging!.lines.length <= MAX_STAGING_LOTS;
  const stagingCandidates = staging
    ? lots.filter(
        (lot) =>
          lot.originIcao === staging.originIcao &&
          lot.destIcao === staging.destIcao &&
          !staging.lines.some((line) => line.lot.id === lot.id) &&
          lot.availableKg > 0,
      )
    : [];

  const showAirport = airportIcao !== null && airportView !== null;
  const showStaging = tab === 'staging' && staging !== null;

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
                ? 'Flight staging'
                : tab === 'fleet'
                  ? 'NPC fleet'
                  : 'Freight board'}
          </h1>
          <p className="lede">
            {showAirport
              ? `${airportView.airport.name} · ${airportView.airport.region} · level ${airportView.airport.level}`
              : showStaging
                ? 'Build a same-route manifest, adjust each payload, then accept and open SimBrief.'
                : tab === 'fleet'
                  ? 'Competing freighters — who is idle, airborne, or turning around.'
                  : 'Local cargo economy — prepare a flight, dispatch in SimBrief, watch it settle.'}
          </p>
        </div>
        <div className="metrics">
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
          className={!showAirport && tab === 'missions' ? 'tab active' : 'tab'}
          onClick={() => selectTab('missions')}
          disabled={busy}
        >
          Missions
        </button>
        <button
          type="button"
          className={!showAirport && tab === 'fleet' ? 'tab active' : 'tab'}
          onClick={() => selectTab('fleet')}
          disabled={busy}
        >
          NPC fleet
        </button>
        {staging ? (
          <button
            type="button"
            className={!showAirport && showStaging ? 'tab active' : 'tab'}
            onClick={() => selectTab('staging')}
            disabled={busy}
            title={`${staging.originIcao}→${staging.destIcao} · ${staging.lines.length} staged lot(s)`}
          >
            Staging ({staging.lines.length})
          </button>
        ) : null}
        {showAirport ? <span className="tab active terminal-tab">Terminal</span> : null}
        <div className="spacer" />
        <label className="aircraft">
          Aircraft
          <select
            value={aircraft}
            onChange={(e) => {
              setAircraft(e.target.value as AircraftClass);
              setMarketPage(1);
            }}
            disabled={busy || showStaging}
            title={showStaging ? 'Aircraft is locked while staging this flight' : undefined}
          >
            <option value="narrow_freighter">Narrow (B738 BCF)</option>
            <option value="wide_freighter">Wide (MD-11F)</option>
            <option value="light_turboprop">Light TP (C208 Caravan)</option>
          </select>
        </label>
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

      {showAirport ? (
        <section className="panel airport-panel">
          <div className="panel-head">
            <div>
              <h2>Live movements</h2>
              <p>
                Arrivals & departures at {formatClock(continuousHours)}
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

          <div className="panel-head">
            <div>
              <h2>Terminal inventory</h2>
              <p>
                {airportView.totalStockTonnes.toFixed(1)} t total stock · {formatClock(continuousHours)}
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
                        {c.perishable ? 'Perishable' : c.highValue ? 'High value' : 'Standard'}
                      </small>
                    </td>
                    <td>
                      {c.stockTonnes.toFixed(1)} t
                      <small>of {c.capacityTonnes.toFixed(1)} t</small>
                    </td>
                    <td>
                      <div className="fill-bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, c.fillPct * 100)}%` }} />
                      </div>
                      <small>{(c.fillPct * 100).toFixed(0)}%</small>
                    </td>
                    <td>
                      <span className={`balance balance-${c.balance}`}>{c.balance}</span>
                    </td>
                    <td>
                      <span className={`trend trend-${c.trend ?? 'stable'}`}>
                        {c.trend ?? 'stable'}
                      </span>
                    </td>
                    <td>
                      +{(c.productionPerTickKg / 1000).toFixed(2)} t
                      <small>−{(c.consumptionPerTickKg / 1000).toFixed(2)} t</small>
                    </td>
                    <td className="pay">${c.unitPriceUsd.toFixed(2)}/kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="airport-contracts">
            <div>
              <h3>Outbound contracts</h3>
              {airportView.outboundLots.length === 0 ? (
                <p className="empty">No active outbound lots.</p>
              ) : (
                <ul className="contract-list">
                  {airportView.outboundLots.map((lot) => (
                    <li key={lot.id}>
                      <div className="route">
                        <IcaoLink icao={lot.originIcao} onOpen={openAirport} disabled={busy} />
                        <span className="arrow">→</span>
                        <IcaoLink icao={lot.destIcao} onOpen={openAirport} disabled={busy} />
                        {lot.urgency === 'urgent' ? <span className="tag">Urgent</span> : null}
                      </div>
                      <p>
                        {lot.commodityName} · {formatTonnes(lot.availableKg)} ·{' '}
                        {formatMoney(lot.payUsd)}
                      </p>
                      <NpcTakenBadge claim={lot.npcClaim} nowMs={displayNowMs} />
                      <LotExpiry lot={lot} tick={tick} continuousHours={continuousHours} />
                      <small>{lot.reason}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>Inbound contracts</h3>
              {airportView.inboundLots.length === 0 ? (
                <p className="empty">No active inbound lots.</p>
              ) : (
                <ul className="contract-list">
                  {airportView.inboundLots.map((lot) => (
                    <li key={lot.id}>
                      <div className="route">
                        <IcaoLink icao={lot.originIcao} onOpen={openAirport} disabled={busy} />
                        <span className="arrow">→</span>
                        <IcaoLink icao={lot.destIcao} onOpen={openAirport} disabled={busy} />
                        {lot.urgency === 'urgent' ? <span className="tag">Urgent</span> : null}
                      </div>
                      <p>
                        {lot.commodityName} · {formatTonnes(lot.availableKg)} ·{' '}
                        {formatMoney(lot.payUsd)}
                      </p>
                      <NpcTakenBadge claim={lot.npcClaim} nowMs={displayNowMs} />
                      <LotExpiry lot={lot} tick={tick} continuousHours={continuousHours} />
                      <small>{lot.reason}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : tab === 'market' ? (
        <section className="panel">
          <div className="panel-head">
            <h2>Available freights</h2>
            <p>
              {lots.length} lots
              {maxCargoKg ? ` · SimBrief cargo cap ${(maxCargoKg / 1000).toFixed(1)} t` : ''}
              {npcActivity.length > 0
                ? ` · ${npcActivity.length} NPC airborne`
                : ''}
            </p>
          </div>
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
                    {hasMarketFilters ? (
                      <button
                        type="button"
                        className="clear-filters"
                        onClick={clearMarketFilters}
                      >
                        Clear
                      </button>
                    ) : (
                      <span>Filters</span>
                    )}
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
                  <th />
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
                      {(() => {
                        const openFlight = openFlightForLot(lot);
                        const cap = maxCargoKg ?? fallbackMaxCargoKg(aircraft);
                        const freeKg = openFlight
                          ? Math.max(0, cap - openFlight.cargoKg)
                          : null;
                        return (
                          <button
                            type="button"
                            className="accept"
                            disabled={busy || (freeKg !== null && freeKg <= 0)}
                            onClick={() => enterStaging(lot)}
                            title={
                              openFlight
                                ? `Prepare additions to ${openFlight.id} · ${Math.round(freeKg ?? 0).toLocaleString()} kg free`
                                : 'Prepare a new flight with this lot'
                            }
                          >
                            {openFlight
                              ? `Add · ${(Math.max(0, freeKg ?? 0) / 1000).toFixed(1)} t free`
                              : 'Prepare flight'}
                          </button>
                        );
                      })()}
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
      ) : showStaging && staging ? (
        <section className="panel staging-panel">
          <div className="panel-head missions-head">
            <div>
              <h2>
                {staging.originIcao} → {staging.destIcao}
              </h2>
              <p>
                {staging.originName} → {staging.destName} ·{' '}
                {aircraftClassLabel(staging.aircraft)}
                {stagingExisting
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
                  disabled={busy}
                >
                  <option value="narrow_freighter">Narrow (B738 BCF)</option>
                  <option value="wide_freighter">Wide (MD-11F)</option>
                  <option value="light_turboprop">Light TP (C208 Caravan)</option>
                </select>
              </label>
              <button
                type="button"
                className="action ghost"
                onClick={exitStaging}
                disabled={busy}
              >
                Back to market
              </button>
            </div>
          </div>

          <div className="cargo-capacity staging-capacity">
            <span>
              Aircraft capacity
              <strong>{formatTonnes(aircraftCapKg(staging.aircraft))}</strong>
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
              <strong>{formatMoney(stagingPayUsd + (stagingExisting?.payUsd ?? 0))}</strong>
            </span>
          </div>

          {stagingExisting && (stagingExisting.lots?.length ?? 0) > 0 ? (
            <div className="staging-section">
              <h3>Already on this flight</h3>
              <ul className="staging-existing">
                {stagingExisting.lots!.map((line) => (
                  <li key={`${line.shipmentLotId}-${line.commodityId}`}>
                    {(line.cargoKg / 1000).toFixed(1)} t {line.commodityId} ·{' '}
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
                            exitStaging();
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
                          max={maxKg}
                          step={100}
                          value={line.cargoKg}
                          onChange={(e) =>
                            updateStagingLineKg(line.lot.id, Number(e.target.value))
                          }
                          disabled={busy}
                        />
                        <span>kg</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={Math.max(1, maxKg)}
                        step={100}
                        value={Math.min(line.cargoKg, Math.max(1, maxKg))}
                        onChange={(e) =>
                          updateStagingLineKg(line.lot.id, Number(e.target.value))
                        }
                        disabled={busy || maxKg <= 0}
                        aria-label={`${line.lot.commodityName} load in kilograms`}
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
                        Choose between 1 and {maxKg.toLocaleString()} kg.
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
                        {lot.urgency === 'urgent' ? <span className="tag">Urgent</span> : null}
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
                Back to market
              </button>
              <button
                type="button"
                className="accept"
                disabled={busy || !stagingValid}
                onClick={() => void onCommitStaging()}
              >
                Accept &amp; Dispatch
              </button>
            </div>
          </div>
        </section>
      ) : tab === 'fleet' ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Competing fleet</h2>
              <p>
                {npcBusy} busy · {npcSummary.airborne} airborne · {npcSummary.turnaround}{' '}
                turnaround · {npcSummary.idle} idle
                <span className="live-dot" title="Auto-refreshes every 15s; clock ticks every second">
                  {' '}
                  · live
                </span>
              </p>
            </div>
          </div>
          <FleetRoster
            fleet={npcFleet}
            onOpen={openAirport}
            busy={busy}
            nowMs={displayNowMs}
          />
        </section>
      ) : (
        <section className="panel">
          <div className="panel-head missions-head">
            <div>
              <h2>Company missions</h2>
              <p>
                Accept lots onto the same OD flight while capacity remains · Dispatch once for the
                whole manifest.
              </p>
            </div>
            <label className="simbrief-field">
              SimBrief user
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
          <ul className="mission-list">
            {missions.map((m) => (
              <li key={m.id} className="mission">
                <div className="mission-main">
                  <div className="route">
                    <IcaoLink icao={m.originIcao} onOpen={openAirport} disabled={busy} />
                    <span className="arrow">→</span>
                    <IcaoLink icao={m.destIcao} onOpen={openAirport} disabled={busy} />
                    <span className={`status status-${m.status}`}>{m.status}</span>
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
                    {(m.cargoKg / 1000).toFixed(1)} t
                    {(m.lots?.length ?? 1) > 1 ? ` · ${m.lots!.length} lots` : ''} ·{' '}
                    {aircraftClassLabel(m.aircraftClassId)} ·{' '}
                    {formatDeadline(m.deadlineTick, continuousHours)}
                    {['accepted', 'dispatched'].includes(m.status) &&
                    m.aircraftClassId === aircraft
                      ? ` · ${(
                          Math.max(
                            0,
                            (maxCargoKg ?? fallbackMaxCargoKg(aircraft)) - m.cargoKg,
                          ) / 1000
                        ).toFixed(1)} t free`
                      : ''}
                  </p>
                  <p className="payline">
                    Contract {formatMoney(m.payUsd)}
                    {m.payoutUsd !== undefined ? ` · paid ${formatMoney(m.payoutUsd)}` : ''}
                  </p>
                  <small>{m.reason}</small>
                  {(m.lots?.length ?? 0) > 1 ? (
                    <ul className="ofp-findings">
                      {m.lots!.map((line) => (
                        <li key={`${line.shipmentLotId}-${line.commodityId}`}>
                          {(line.cargoKg / 1000).toFixed(1)} t {line.commodityId} ·{' '}
                          {formatMoney(line.payUsd)}
                          {line.urgency === 'urgent' ? ' · urgent' : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {m.lastOfpCheck ? (
                    <ul className="ofp-findings">
                      {m.lastOfpCheck.findings.map((f) => (
                        <li key={`ofp-${f.code}-${f.message}`} className={`finding-${f.severity}`}>
                          [OFP {f.severity}] {f.message}
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
                          [Live {f.severity}] {f.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="mission-actions">
                  {['accepted', 'dispatched'].includes(m.status) ? (
                    <button
                      type="button"
                      className="action"
                      disabled={busy}
                      onClick={() => void onDispatch(m)}
                    >
                      {m.status === 'dispatched' ? 'Re-open Dispatch' : 'Dispatch'}
                    </button>
                  ) : null}
                  {['dispatched', 'in_flight'].includes(m.status) ? (
                    <button
                      type="button"
                      className="action"
                      disabled={busy || !m.staticId}
                      title={
                        !simbriefUser.trim()
                          ? 'Set SimBrief username above'
                          : 'Fetch OFP and compare to mission intent'
                      }
                      onClick={() => void onConfirmOfp(m)}
                    >
                      Confirm OFP
                    </button>
                  ) : null}
                  {['accepted', 'dispatched', 'in_flight'].includes(m.status) ? (
                    <button
                      type="button"
                      className="action"
                      disabled={busy || !m.staticId}
                      title={
                        !m.staticId
                          ? 'Dispatch first'
                          : !simbriefUser.trim()
                            ? 'Set SimBrief username above'
                            : 'Compare SimBrief OFP to live fuel/payload in MSFS'
                      }
                      onClick={() => void onPreflight(m)}
                    >
                      Preflight
                    </button>
                  ) : null}
                  {['accepted', 'dispatched', 'in_flight'].includes(m.status) ? (
                    <button
                      type="button"
                      className="action"
                      disabled={busy}
                      title="Connect to MSFS and auto depart/settle from live aircraft state"
                      onClick={() => void onWatch(m)}
                    >
                      {watch?.running && watch.missionId === m.id ? 'Stop watch' : 'Watch'}
                    </button>
                  ) : null}
                  {['accepted', 'dispatched'].includes(m.status) ? (
                    <button
                      type="button"
                      className="action ghost"
                      disabled={busy}
                      title="Mark cargo airborne without MSFS"
                      onClick={() => void onDepart(m)}
                    >
                      Depart
                    </button>
                  ) : null}
                  {['accepted', 'dispatched', 'in_flight'].includes(m.status) ? (
                    <button
                      type="button"
                      className="action ghost"
                      disabled={busy}
                      title="Deliver cargo and credit wallet without MSFS"
                      onClick={() => void onSettle(m)}
                    >
                      Settle
                    </button>
                  ) : null}
                  {['accepted', 'dispatched'].includes(m.status) ? (
                    <button
                      type="button"
                      className="action ghost danger"
                      disabled={busy}
                      title="Release reserved cargo back to the market"
                      onClick={() => void onCancel(m)}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
                {watch?.missionId === m.id && (watch.running || watch.settlement || watch.lastError) ? (
                  <div className="watch-panel" aria-live="polite">
                    <p className="watch-line">
                      <span className={`watch-dot ${watch.running ? 'on' : 'off'}`} />
                      {watch.running ? 'Live watch' : 'Watch idle'}
                      {watch.phase ? ` · ${watch.phase}` : ''}
                      {watch.sawAirborne ? ' · saw airborne' : ''}
                      {watch.onGround === true
                        ? watch.enginesRunning
                          ? ' · engines on'
                          : ' · engines off'
                        : watch.onGround === false
                          ? ' · airborne'
                          : ''}
                    </p>
                    {watch.lastEvent && watch.lastEvent.type !== 'none' ? (
                      <p className="watch-event">
                        {watch.lastEvent.type === 'settle_blocked'
                          ? `Blocked: ${watch.lastEvent.reason}`
                          : `${watch.lastEvent.type}: ${watch.lastEvent.reason}`}
                      </p>
                    ) : null}
                    {watch.lastError ? (
                      <p className="watch-error">{watch.lastError}</p>
                    ) : null}
                    {watch.settlement ? (
                      <p className="watch-settle">
                        Paid {formatMoney(watch.settlement.payoutUsd)}
                        {watch.settlement.onTime
                          ? ' on time'
                          : ` · late ${watch.settlement.lateTicks}h (−${formatMoney(watch.settlement.penaltyUsd)})`}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
            {missions.length === 0 ? (
              <li className="empty">No missions yet — accept a lot from the market.</li>
            ) : null}
          </ul>
        </section>
      )}

      <footer className="foot">
        Saves to <code>profiles/career/</code> · same engine as <code>npm run career</code>
      </footer>
    </div>
  );
}
