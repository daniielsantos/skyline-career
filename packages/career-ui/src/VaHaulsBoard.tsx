import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPorts,
  fetchVaHauls,
  postWarehouseBridgeDispatchHold,
  type Mission,
  type PlayerAircraft,
  type VaHaulHold,
  type VaHaulMission,
} from './api';
import { formatBoardMoney } from './board-money';
import { VaPortPathCard } from './VaPortPathCard';

function formatMassKg(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`;
  return `${Math.round(kg)} kg`;
}

function commodityLabel(id: string): string {
  const raw = id.trim();
  if (!raw) return 'Cargo';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

type Props = {
  companyId: string;
  homeHubIcao: string;
  fleet: PlayerAircraft[];
  walletUsd: number;
  isOwner: boolean;
  busy?: boolean;
  onWallet?: (walletUsd: number) => void;
  onFleet?: (fleet: PlayerAircraft[]) => void;
  onMissions?: (missions: Mission[]) => void;
  onStaged?: (mission: Mission) => void;
  onGoPorts?: () => void;
  onToast?: (kind: 'ok' | 'fail', message: string) => void;
};

export function VaHaulsBoard(props: Props) {
  const [holds, setHolds] = useState<VaHaulHold[]>([]);
  const [active, setActive] = useState<VaHaulMission[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyHoldId, setBusyHoldId] = useState<string | null>(null);
  const [aircraftByHold, setAircraftByHold] = useState<Record<string, string>>(
    {},
  );
  const [portStrip, setPortStrip] = useState<{
    portName: string;
    level: number | null;
    status: 'yours' | 'held' | 'vacant';
    pressure: string | null;
    whRoom: string | null;
  } | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const board = await fetchVaHauls();
      setHolds(board.openHolds ?? []);
      setActive(board.activeMissions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHolds([]);
      setActive([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, props.companyId]);

  useEffect(() => {
    const hub = props.homeHubIcao.trim().toUpperCase();
    if (!hub) {
      setPortStrip(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await fetchPorts();
        if (cancelled) return;
        // Only surface Port FBO when this company actually operates one —
        // never fall back to a vacant nearby port (home hub pickup ≠ ownership).
        const port = snap.ports.find(
          (p) =>
            p.concession?.status === 'yours' ||
            (p.concession?.companyId &&
              p.concession.companyId === props.companyId),
        );
        const wh = (snap.warehouses?.warehouses ?? []).find(
          (w) => w.icao.trim().toUpperCase() === hub,
        );
        const whRoom = wh
          ? `WH ${hub} · ${formatMassKg(wh.freeKg)} free / ${formatMassKg(wh.capacityKg)}`
          : null;
        if (!port) {
          setPortStrip(
            whRoom
              ? {
                  portName: `Home hub ${hub}`,
                  level: null,
                  status: 'vacant',
                  pressure: null,
                  whRoom,
                }
              : null,
          );
          return;
        }
        const signals = (port.marketSignals ?? []).filter(
          (s) => s.hubIcao?.toUpperCase() === hub,
        );
        const tight = signals.find((s) => s.balance === 'shortage');
        const fat = signals.find((s) => s.balance === 'surplus');
        const pressure = tight
          ? `${hub} · ${tight.commodityName} tight`
          : fat
            ? `${hub} · ${fat.commodityName} surplus`
            : null;
        setPortStrip({
          portName: port.name,
          level: port.concession?.level ?? null,
          status: port.concession?.status ?? 'yours',
          pressure,
          whRoom,
        });
      } catch {
        if (!cancelled) setPortStrip(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.companyId, props.homeHubIcao]);

  const parkedByOrigin = useMemo(() => {
    const map = new Map<string, PlayerAircraft[]>();
    for (const acf of props.fleet) {
      if (acf.status !== 'parked') continue;
      const icao = (acf.locationIcao ?? '').trim().toUpperCase();
      if (!icao) continue;
      const list = map.get(icao) ?? [];
      list.push(acf);
      map.set(icao, list);
    }
    return map;
  }, [props.fleet]);

  async function acceptHold(hold: VaHaulHold) {
    const origin = hold.originIcao.trim().toUpperCase();
    const candidates = parkedByOrigin.get(origin) ?? [];
    const aircraftId =
      (aircraftByHold[hold.id] || candidates[0]?.id || '').trim();
    if (!aircraftId) {
      setError(`No parked company aircraft at ${origin}`);
      return;
    }
    setBusyHoldId(hold.id);
    setError(null);
    try {
      const result = await postWarehouseBridgeDispatchHold({
        holdId: hold.id,
        aircraftId,
        companyId: props.companyId,
      });
      props.onWallet?.(result.walletUsd);
      props.onFleet?.(result.fleet);
      props.onMissions?.(result.missions.slice().reverse());
      props.onToast?.(
        'ok',
        `Internal haul ${result.mission.originIcao}→${result.mission.destIcao} · ${formatMassKg(result.kg)}${
          (result.pilotPayUsd ?? 0) > 0
            ? ` · pilot ${formatBoardMoney(result.pilotPayUsd ?? 0)}`
            : ''
        } · open Dispatch`,
      );
      props.onStaged?.(result.mission);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyHoldId(null);
    }
  }

  const pageBusy = Boolean(props.busy) || busyHoldId != null;

  return (
    <div className="va-pane-card va-hauls-pane">
      <header className="va-hauls-head">
        <div>
          <h3>Hauls</h3>
          <p className="settings-help">
            Paid WH→WH Internal Hauls for this company. Accept with a parked VA
            tail at origin, then Dispatch. Until Port FBO + stock exist, fly
            Freights with a VA-labeled aircraft — desk buy/Scout stay on Ports.
          </p>
        </div>
        {props.onGoPorts ? (
          <button
            type="button"
            className="action ghost"
            disabled={pageBusy}
            onClick={props.onGoPorts}
          >
            Open Ports desk
          </button>
        ) : null}
      </header>

      <VaPortPathCard
        companyId={props.companyId}
        homeHubIcao={props.homeHubIcao}
        walletUsd={props.walletUsd}
        isOwner={props.isOwner}
        busy={pageBusy}
        onGoPorts={props.onGoPorts}
      />

      {portStrip ? (
        <p className="va-hauls-port-strip" role="status">
          {portStrip.status === 'vacant' ? (
            <>
              <strong>{portStrip.portName}</strong>
              {portStrip.whRoom ? ` · ${portStrip.whRoom}` : ''}
              <span className="muted"> · no Port FBO yet</span>
            </>
          ) : (
            <>
              <strong>{portStrip.portName}</strong>
              {portStrip.level != null ? ` · Port FBO P${portStrip.level}` : ''}
              {portStrip.status === 'yours' ? ' · yours' : ' · held'}
              {portStrip.pressure ? ` · ${portStrip.pressure}` : ''}
              {portStrip.whRoom ? ` · ${portStrip.whRoom}` : ''}
            </>
          )}
        </p>
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <p className="settings-help">Loading hauls…</p>
      ) : (
        <>
          <section className="va-hauls-section">
            <h4 className="va-config-section-title">
              Open bridges
              {holds.length > 0 ? ` (${holds.length})` : ''}
            </h4>
            {holds.length === 0 ? (
              <p className="empty">
                No paid Internal Hauls waiting. After Port FBO + company stock,
                owner/dispatcher posts bridges from Ports (Scout / Hold). Until
                then, fly Freights with a VA tail for cut pay.
              </p>
            ) : (
              <ul className="va-hauls-list">
                {holds.map((hold) => {
                  const origin = hold.originIcao.trim().toUpperCase();
                  const candidates = parkedByOrigin.get(origin) ?? [];
                  const selected =
                    aircraftByHold[hold.id] || candidates[0]?.id || '';
                  const pay = hold.pilotPayUsd ?? 0;
                  return (
                    <li key={hold.id} className="va-hauls-row">
                      <div className="va-hauls-route">
                        <strong>
                          {origin}→{hold.destIcao.trim().toUpperCase()}
                        </strong>
                        <span className="muted">
                          {commodityLabel(hold.commodityId)} ·{' '}
                          {formatMassKg(hold.kg)}
                          {pay > 0
                            ? ` · pilot ${formatBoardMoney(pay)}`
                            : ''}
                        </span>
                      </div>
                      <div className="va-hauls-actions">
                        {candidates.length === 0 ? (
                          <span className="muted">
                            Need parked tail at {origin}
                          </span>
                        ) : (
                          <>
                            <label className="simbrief-field va-hauls-aircraft">
                              <span>Aircraft</span>
                              <select
                                value={selected}
                                disabled={pageBusy}
                                aria-label="Aircraft for haul"
                                onChange={(e) =>
                                  setAircraftByHold((prev) => ({
                                    ...prev,
                                    [hold.id]: e.target.value,
                                  }))
                                }
                              >
                                {candidates.map((acf) => (
                                  <option key={acf.id} value={acf.id}>
                                    {acf.label || acf.id}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="action"
                              disabled={pageBusy || !selected}
                              onClick={() => void acceptHold(hold)}
                            >
                              {busyHoldId === hold.id ? 'Accepting…' : 'Accept'}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="va-hauls-section">
            <h4 className="va-config-section-title">
              Active
              {active.length > 0 ? ` (${active.length})` : ''}
            </h4>
            {active.length === 0 ? (
              <p className="empty">No Internal Haul missions in progress.</p>
            ) : (
              <ul className="va-hauls-list">
                {active.map((m) => (
                  <li key={m.id} className="va-hauls-row">
                    <div className="va-hauls-route">
                      <strong>
                        {m.originIcao}→{m.destIcao}
                      </strong>
                      <span className="muted">
                        {commodityLabel(m.commodityId)} ·{' '}
                        {formatMassKg(m.cargoKg)} · {m.status}
                        {m.payUsd > 0
                          ? ` · ${formatBoardMoney(m.payUsd)}`
                          : ''}
                        {m.distanceNm != null
                          ? ` · ${Math.round(m.distanceNm)} nm`
                          : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
