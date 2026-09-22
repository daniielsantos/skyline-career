import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchVaHauls,
  postDemandDispatchHold,
  postWarehouseBridgeDispatchHold,
  postWarehouseHaulDispatchHold,
  type Mission,
  type PlayerAircraft,
  type VaCompanyNetworkNode,
  type VaHaulHold,
  type VaHaulMission,
} from './api';
import { formatBoardMoney } from './board-money';
import { BusyBlock } from './Busy';
import {
  findNetworkNode,
  hubInNetworkFocus,
  type CompanyNetworkNode,
} from './company-network';
import { VaCompanyNetwork } from './VaCompanyNetwork';
import { VaPortPathCard } from './VaPortPathCard';
import { formatMass, type WeightSystem } from './weight-units';

function commodityLabel(id: string): string {
  const raw = id.trim();
  if (!raw) return 'Cargo';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function holdKindLabel(kind: VaHaulHold['kind']): string {
  if (kind === 'bridge') return 'Bridge';
  if (kind === 'haul') return 'Wide haul';
  return 'Demand';
}

function holdPayLabel(hold: VaHaulHold): string {
  const kind = hold.kind ?? 'demand';
  if (kind === 'bridge') {
    const pay = hold.pilotPayUsd ?? 0;
    return pay > 0 ? ` · pilot ${formatBoardMoney(pay)}` : '';
  }
  const unit = hold.unitPriceUsd ?? 0;
  if (unit > 0 && hold.kg > 0) {
    return ` · ~${formatBoardMoney(Math.round(unit * hold.kg))}`;
  }
  return '';
}

function asNetworkNodes(
  nodes: VaCompanyNetworkNode[] | undefined,
): CompanyNetworkNode[] {
  return nodes ?? [];
}

type Props = {
  companyId: string;
  homeHubIcao: string;
  fleet: PlayerAircraft[];
  walletUsd: number;
  isOwner: boolean;
  weightSystem: WeightSystem;
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
  const [networkNodes, setNetworkNodes] = useState<CompanyNetworkNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyHoldId, setBusyHoldId] = useState<string | null>(null);
  const [aircraftByHold, setAircraftByHold] = useState<Record<string, string>>(
    {},
  );
  const [networkFocusId, setNetworkFocusId] = useState<string | null>(null);
  const mass = (kg: number) => formatMass(kg, props.weightSystem);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const board = await fetchVaHauls();
      setHolds(board.openHolds ?? []);
      setActive(board.activeMissions ?? []);
      setNetworkNodes(asNetworkNodes(board.companyNetwork));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHolds([]);
      setActive([]);
      setNetworkNodes([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    setLoaded(false);
    void refresh();
  }, [refresh, props.companyId]);

  const focusNode = findNetworkNode(networkNodes, networkFocusId);
  const hasPortFbo = networkNodes.some((n) => n.kind === 'fbo');

  useEffect(() => {
    if (
      networkFocusId &&
      !networkNodes.some((n) => n.id === networkFocusId)
    ) {
      setNetworkFocusId(null);
    }
  }, [networkFocusId, networkNodes]);

  const filteredHolds = useMemo(
    () =>
      holds.filter((h) =>
        hubInNetworkFocus(focusNode, h.originIcao),
      ),
    [holds, focusNode],
  );

  const filteredActive = useMemo(
    () =>
      active.filter((m) =>
        hubInNetworkFocus(focusNode, m.originIcao),
      ),
    [active, focusNode],
  );

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
    const kind = hold.kind ?? 'demand';
    try {
      const result =
        kind === 'bridge'
          ? await postWarehouseBridgeDispatchHold({
              holdId: hold.id,
              aircraftId,
              companyId: props.companyId,
            })
          : kind === 'haul'
            ? await postWarehouseHaulDispatchHold({
                holdId: hold.id,
                aircraftId,
                companyId: props.companyId,
              })
            : await postDemandDispatchHold({
                holdId: hold.id,
                aircraftId,
                companyId: props.companyId,
              });
      props.onWallet?.(result.walletUsd);
      props.onFleet?.(result.fleet);
      props.onMissions?.(result.missions.slice().reverse());
      const payNote =
        kind === 'bridge' && (result as { pilotPayUsd?: number }).pilotPayUsd
          ? ` · pilot ${formatBoardMoney((result as { pilotPayUsd?: number }).pilotPayUsd ?? 0)}`
          : 'payUsd' in result && typeof result.payUsd === 'number'
            ? ` · ${formatBoardMoney(result.payUsd)}`
            : '';
      props.onToast?.(
        'ok',
        `${holdKindLabel(kind)} ${result.mission.originIcao}→${result.mission.destIcao} · ${mass(result.kg)}${payNote} · open Dispatch`,
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
            {!loaded
              ? 'Airline desk — bridges, Demand, and Wide hauls.'
              : hasPortFbo
                ? 'Airline desk · Pick a network node, Accept with a parked VA tail at origin, then Dispatch.'
                : 'Until Port FBO + stock, fly Freights with a VA tail (market hire).'}
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

      {loaded && !hasPortFbo ? (
        <VaPortPathCard
          companyId={props.companyId}
          homeHubIcao={props.homeHubIcao}
          walletUsd={props.walletUsd}
          isOwner={props.isOwner}
          busy={pageBusy}
          onGoPorts={props.onGoPorts}
        />
      ) : null}

      {loaded && networkNodes.length > 0 ? (
        <VaCompanyNetwork
          nodes={networkNodes}
          selectedId={networkFocusId}
          onSelect={setNetworkFocusId}
          showMap={networkNodes.length > 1 || hasPortFbo}
          disabled={pageBusy}
          weightSystem={props.weightSystem}
        />
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <div className="va-pane-loading">
          <BusyBlock label="Loading hauls…" />
        </div>
      ) : (
        <>
          <section className="va-hauls-section">
            <h4 className="va-config-section-title">
              Open desk work
              {filteredHolds.length > 0
                ? ` (${filteredHolds.length}${
                    focusNode && filteredHolds.length !== holds.length
                      ? ` / ${holds.length}`
                      : ''
                  })`
                : ''}
            </h4>
            {filteredHolds.length === 0 ? (
              <p className="empty">
                {hasPortFbo
                  ? focusNode
                    ? `No open holds from ${focusNode.title} — try All, or post Scout Hold from Ports.`
                    : 'No desk holds open. Post from Ports (Scout / Hold) — needs company stock.'
                  : 'No desk work yet. Fly Freights with a VA tail, or finish the Port FBO path above.'}
              </p>
            ) : (
              <ul className="va-hauls-list">
                {filteredHolds.map((hold) => {
                  const origin = hold.originIcao.trim().toUpperCase();
                  const candidates = parkedByOrigin.get(origin) ?? [];
                  const selected =
                    aircraftByHold[hold.id] || candidates[0]?.id || '';
                  const kind = hold.kind ?? 'demand';
                  return (
                    <li key={hold.id} className="va-hauls-row">
                      <div className="va-hauls-route">
                        <strong>
                          {origin}→{hold.destIcao.trim().toUpperCase()}
                        </strong>
                        <span className="muted">
                          {holdKindLabel(kind)} ·{' '}
                          {commodityLabel(hold.commodityId)} ·{' '}
                          {mass(hold.kg)}
                          {holdPayLabel(hold)}
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
              {filteredActive.length > 0
                ? ` (${filteredActive.length})`
                : ''}
            </h4>
            {filteredActive.length === 0 ? (
              <p className="empty">None in progress.</p>
            ) : (
              <ul className="va-hauls-list">
                {filteredActive.map((m) => (
                  <li key={m.id} className="va-hauls-row">
                    <div className="va-hauls-route">
                      <strong>
                        {m.originIcao}→{m.destIcao}
                      </strong>
                      <span className="muted">
                        {commodityLabel(m.commodityId)} ·{' '}
                        {mass(m.cargoKg)} · {m.status}
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
