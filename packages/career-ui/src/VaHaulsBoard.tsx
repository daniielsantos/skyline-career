import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchVaHauls,
  postDemandDispatchHold,
  postDemandHoldCancel,
  postWarehouseBridgeDispatchHold,
  postWarehouseBridgeHoldCancel,
  postWarehouseHaulDispatchHold,
  postWarehouseHaulHoldCancel,
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

function holdPayParts(hold: VaHaulHold): string | null {
  const kind = hold.kind ?? 'demand';
  if (kind === 'bridge') {
    const pay = hold.pilotPayUsd ?? 0;
    return pay > 0 ? `pilot ${formatBoardMoney(pay)}` : null;
  }
  const unit = hold.unitPriceUsd ?? 0;
  if (unit > 0 && hold.kg > 0) {
    return `~${formatBoardMoney(Math.round(unit * hold.kg))}`;
  }
  return null;
}

function aircraftOptionLabel(
  acf: PlayerAircraft,
  originIcao: string,
): string {
  const origin = originIcao.trim().toUpperCase();
  const loc = (acf.locationIcao ?? '').trim().toUpperCase();
  const atOrigin = loc === origin;
  const where = atOrigin ? `@ ${loc}` : `ferry from ${loc || '—'}`;
  return `${acf.label || acf.id} · ${where}`;
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
  /** Off-origin (or Prepare path): open Dispatch Manifest + ferry there. */
  onPrepareHold?: (hold: VaHaulHold, aircraftId: string) => void;
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
  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(null);
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

  useEffect(() => {
    if (
      selectedHoldId &&
      !filteredHolds.some((h) => h.id === selectedHoldId)
    ) {
      setSelectedHoldId(null);
    }
  }, [selectedHoldId, filteredHolds]);

  const selectedHoldRoute = useMemo(() => {
    const hold = filteredHolds.find((h) => h.id === selectedHoldId);
    if (!hold) return null;
    if (
      typeof hold.originLat !== 'number' ||
      typeof hold.originLon !== 'number' ||
      typeof hold.destLat !== 'number' ||
      typeof hold.destLon !== 'number' ||
      !Number.isFinite(hold.originLat) ||
      !Number.isFinite(hold.originLon) ||
      !Number.isFinite(hold.destLat) ||
      !Number.isFinite(hold.destLon)
    ) {
      return null;
    }
    return {
      originIcao: hold.originIcao.trim().toUpperCase(),
      destIcao: hold.destIcao.trim().toUpperCase(),
      originLat: hold.originLat,
      originLon: hold.originLon,
      destLat: hold.destLat,
      destLon: hold.destLon,
    };
  }, [filteredHolds, selectedHoldId]);

  const filteredActive = useMemo(
    () =>
      active.filter((m) =>
        hubInNetworkFocus(focusNode, m.originIcao),
      ),
    [active, focusNode],
  );

  /** All parked VA tails — Prepare/Accept like Freights (ferry off-origin in Manifest). */
  const parkedFleet = useMemo(
    () => props.fleet.filter((acf) => acf.status === 'parked'),
    [props.fleet],
  );

  function pickDefaultAircraftId(originIcao: string): string {
    const origin = originIcao.trim().toUpperCase();
    const atOrigin = parkedFleet.find(
      (acf) =>
        (acf.locationIcao ?? '').trim().toUpperCase() === origin,
    );
    return (atOrigin ?? parkedFleet[0])?.id ?? '';
  }

  function selectedAircraftForHold(hold: VaHaulHold): PlayerAircraft | null {
    const id =
      (aircraftByHold[hold.id] || pickDefaultAircraftId(hold.originIcao)).trim();
    if (!id) return null;
    return parkedFleet.find((a) => a.id === id) ?? null;
  }

  async function acceptHold(hold: VaHaulHold) {
    const origin = hold.originIcao.trim().toUpperCase();
    const acf = selectedAircraftForHold(hold);
    const aircraftId = acf?.id?.trim() ?? '';
    if (!aircraftId || !acf) {
      setError('No parked company aircraft available');
      return;
    }
    if ((acf.locationIcao ?? '').trim().toUpperCase() !== origin) {
      if (props.onPrepareHold) {
        props.onPrepareHold(hold, aircraftId);
        return;
      }
      setError(`Aircraft is at ${acf.locationIcao}, not ${origin} — Prepare to ferry`);
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

  function prepareHold(hold: VaHaulHold) {
    const acf = selectedAircraftForHold(hold);
    const aircraftId = acf?.id?.trim() ?? '';
    if (!aircraftId) {
      setError('No parked company aircraft available');
      return;
    }
    if (!props.onPrepareHold) {
      void acceptHold(hold);
      return;
    }
    props.onPrepareHold(hold, aircraftId);
  }

  async function cancelHold(hold: VaHaulHold) {
    setBusyHoldId(hold.id);
    setError(null);
    const kind = hold.kind ?? 'demand';
    try {
      if (kind === 'bridge') {
        const result = await postWarehouseBridgeHoldCancel({
          holdId: hold.id,
          companyId: props.companyId,
        });
        props.onToast?.(
          'ok',
          `Released ${mass(result.kg)} bridge hold`,
        );
      } else if (kind === 'haul') {
        const result = await postWarehouseHaulHoldCancel({
          holdId: hold.id,
          companyId: props.companyId,
        });
        props.onToast?.(
          'ok',
          `Released ${mass(result.kg)} wide haul hold`,
        );
      } else {
        const result = await postDemandHoldCancel({
          holdId: hold.id,
          companyId: props.companyId,
        });
        props.onToast?.(
          'ok',
          `Released ${mass(result.kg)} Demand hold`,
        );
      }
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
                ? 'Airline desk · Prepare a parked VA tail (ferry in Dispatch if off-hub), then Accept.'
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
          highlightRoute={selectedHoldRoute}
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
            <p className="va-hauls-section-help muted">
              Reserved cargo until Accept (Dispatch) or Cancel. Off-hub tails
              Prepare → ferry in Manifest. Click a hold to plot the route on the
              map.
            </p>
            {filteredHolds.length === 0 ? (
              <p className="empty">
                {hasPortFbo
                  ? focusNode
                    ? `No open holds from ${focusNode.title} — try All, or post Scout Hold from Ports.`
                    : 'No desk holds open. Post from Ports (Scout / Hold) — needs company stock.'
                  : 'No desk work yet. Fly Freights with a VA tail, or finish the Port FBO path above.'}
              </p>
            ) : parkedFleet.length === 0 ? (
              <p className="empty">
                No parked VA aircraft — park a company tail, then Prepare.
              </p>
            ) : (
              <ul className="va-hauls-list">
                {filteredHolds.map((hold) => {
                  const origin = hold.originIcao.trim().toUpperCase();
                  const dest = hold.destIcao.trim().toUpperCase();
                  const selectedId =
                    aircraftByHold[hold.id] ||
                    pickDefaultAircraftId(hold.originIcao);
                  const selected = parkedFleet.find((a) => a.id === selectedId);
                  const atOrigin = Boolean(
                    selected &&
                      (selected.locationIcao ?? '')
                        .trim()
                        .toUpperCase() === origin,
                  );
                  const kind = hold.kind ?? 'demand';
                  const pay = holdPayParts(hold);
                  const busyThis = busyHoldId === hold.id;
                  const usePrepare = Boolean(props.onPrepareHold) && !atOrigin;
                  const isSelected = selectedHoldId === hold.id;
                  return (
                    <li
                      key={hold.id}
                      className={
                        isSelected
                          ? 'va-hauls-row is-selected'
                          : 'va-hauls-row'
                      }
                      onClick={() =>
                        setSelectedHoldId((prev) =>
                          prev === hold.id ? null : hold.id,
                        )
                      }
                    >
                      <div className="va-hauls-row-main">
                        <div className="va-hauls-route">
                          <strong>
                            {origin}
                            <span className="va-hauls-route-arrow" aria-hidden>
                              →
                            </span>
                            {dest}
                          </strong>
                          <span
                            className={`va-hauls-kind va-hauls-kind-${kind}`}
                          >
                            {holdKindLabel(kind)}
                          </span>
                        </div>
                        <ul className="va-hauls-meta">
                          <li>{commodityLabel(hold.commodityId)}</li>
                          <li>{mass(hold.kg)}</li>
                          {typeof hold.distanceNm === 'number' &&
                          Number.isFinite(hold.distanceNm) &&
                          hold.distanceNm > 0 ? (
                            <li>{Math.round(hold.distanceNm).toLocaleString()} nm</li>
                          ) : null}
                          {pay ? <li>{pay}</li> : null}
                          {hold.heldByName ? (
                            <li title="Posted by">{hold.heldByName}</li>
                          ) : null}
                        </ul>
                      </div>
                      <div
                        className="va-hauls-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="simbrief-field va-hauls-aircraft">
                          <span>Aircraft</span>
                          <select
                            value={selectedId}
                            disabled={pageBusy}
                            aria-label="Aircraft for haul"
                            onChange={(e) =>
                              setAircraftByHold((prev) => ({
                                ...prev,
                                [hold.id]: e.target.value,
                              }))
                            }
                          >
                            {parkedFleet.map((acf) => (
                              <option key={acf.id} value={acf.id}>
                                {aircraftOptionLabel(acf, origin)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="action"
                          disabled={pageBusy || !selectedId}
                          title={
                            usePrepare
                              ? `Open Dispatch — ferry to ${origin} before Accept`
                              : undefined
                          }
                          onClick={() =>
                            usePrepare
                              ? prepareHold(hold)
                              : void acceptHold(hold)
                          }
                        >
                          {busyThis
                            ? usePrepare
                              ? '…'
                              : 'Accepting…'
                            : usePrepare
                              ? 'Prepare'
                              : 'Accept'}
                        </button>
                        <button
                          type="button"
                          className="action ghost"
                          disabled={pageBusy}
                          title="Release reserved cargo back to the desk"
                          onClick={() => void cancelHold(hold)}
                        >
                          {busyThis ? '…' : 'Cancel'}
                        </button>
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
