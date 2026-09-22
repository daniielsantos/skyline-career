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
import { isOpsAircraftBoardSelectable } from './ops-fleet';
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

const HOURS_PER_TICK = 0.25;
const HOURS_PER_DAY = 24;

function formatHoldDuration(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(Math.abs(hours) * 60));
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

/** Desk-hold TTL countdown (economy clock). Always returns a cell for column align. */
function formatHoldExpiresIn(
  expiresAtTick: number | undefined,
  clock: number | undefined,
): { label: string; urgent: boolean } {
  if (expiresAtTick == null || !Number.isFinite(expiresAtTick)) {
    return { label: '—', urgent: false };
  }
  if (clock == null || !Number.isFinite(clock)) {
    return { label: '…', urgent: false };
  }
  const remainingTicks = expiresAtTick - clock;
  if (remainingTicks <= 0) {
    return { label: 'Expired', urgent: true };
  }
  const hoursLeft = remainingTicks * HOURS_PER_TICK;
  return {
    label: `${formatHoldDuration(hoursLeft)} left`,
    urgent: hoursLeft <= 2,
  };
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
  /** Integer economy tick (fallback for hold TTL). */
  economyTick?: number;
  /** Soft continuous clock for smoother countdown. */
  economyClock?: number;
  onWallet?: (walletUsd: number) => void;
  onFleet?: (fleet: PlayerAircraft[]) => void;
  onMissions?: (missions: Mission[]) => void;
  onStaged?: (mission: Mission) => void;
  /** Off-origin or oversize hold: open Dispatch Manifest (ferry / partial load). */
  onPrepareHold?: (hold: VaHaulHold, aircraftId: string) => void;
  /** Ops payload estimate for the selected tail (fallback if unknown). */
  resolveMaxCargoKg?: (aircraft: PlayerAircraft) => number;
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
    () => props.fleet.filter(isOpsAircraftBoardSelectable),
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

  /** True when the hold won't fit this airframe's ops cap — Manifest slider. */
  function holdNeedsPartialLoad(
    hold: VaHaulHold,
    acf: PlayerAircraft | null,
  ): boolean {
    if (!acf || !props.onPrepareHold) return false;
    const holdKg = Math.max(0, Math.floor(hold.kg));
    if (holdKg <= 0) return false;
    const cap = Math.max(
      0,
      Math.floor(props.resolveMaxCargoKg?.(acf) ?? 0),
    );
    // Unknown cap: still allow Accept (server enforces). Known small cap → Prepare.
    if (cap <= 0) return false;
    return holdKg > cap;
  }

  function shouldPrepareHold(
    hold: VaHaulHold,
    acf: PlayerAircraft | null,
  ): boolean {
    if (!props.onPrepareHold || !acf) return false;
    const origin = hold.originIcao.trim().toUpperCase();
    const atOrigin =
      (acf.locationIcao ?? '').trim().toUpperCase() === origin;
    return !atOrigin || holdNeedsPartialLoad(hold, acf);
  }

  async function acceptHold(hold: VaHaulHold) {
    const origin = hold.originIcao.trim().toUpperCase();
    const acf = selectedAircraftForHold(hold);
    const aircraftId = acf?.id?.trim() ?? '';
    if (!aircraftId || !acf) {
      setError('No parked company aircraft available');
      return;
    }
    if (shouldPrepareHold(hold, acf)) {
      props.onPrepareHold?.(hold, aircraftId);
      return;
    }
    if ((acf.locationIcao ?? '').trim().toUpperCase() !== origin) {
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
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      props.onToast?.('fail', message);
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
                ? 'Airline desk · pick a parked company tail: Accept if it fits at origin, else Prepare (ferry / partial load in Manifest).'
                : 'Until Port FBO + stock, fly Freights with an airline tail (market hire).'}
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
              Reserved until Accept, Cancel, or hold TTL (WH tier; Demand also
              ends with the order). Off-hub or oversize → Prepare opens Manifest;
              leftover stays here. Click a hold to plot the route.
            </p>
            {filteredHolds.length === 0 ? (
              <p className="empty">
                {hasPortFbo
                  ? focusNode
                    ? `No open holds from ${focusNode.title} — try All, or post Scout Hold from Ports.`
                    : 'No desk holds open. Post from Ports (Scout / Hold) — needs company stock.'
                  : 'No desk work yet. Fly Freights with an airline tail, or finish the Port FBO path above.'}
              </p>
            ) : parkedFleet.length === 0 ? (
              <p className="empty">
                No parked company aircraft — park a company tail, then Prepare.
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
                  const kind = hold.kind ?? 'demand';
                  const pay = holdPayParts(hold);
                  const busyThis = busyHoldId === hold.id;
                  const usePrepare = shouldPrepareHold(hold, selected ?? null);
                  const needsPartial = holdNeedsPartialLoad(
                    hold,
                    selected ?? null,
                  );
                  const isSelected = selectedHoldId === hold.id;
                  const clock =
                    typeof props.economyClock === 'number' &&
                    Number.isFinite(props.economyClock)
                      ? props.economyClock
                      : props.economyTick;
                  const expiry = formatHoldExpiresIn(hold.expiresAtTick, clock);
                  const distNm =
                    typeof hold.distanceNm === 'number' &&
                    Number.isFinite(hold.distanceNm) &&
                    hold.distanceNm > 0
                      ? Math.round(hold.distanceNm).toLocaleString()
                      : '—';
                  const byName = hold.heldByName?.trim() || null;
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
                      <div className="va-hauls-row-id">
                        <strong className="va-hauls-route-od">
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
                      <div className="va-hauls-stats" aria-label="Hold details">
                        <div>
                          <span className="va-stat-label">Cargo</span>
                          <span className="va-stat-value">
                            {commodityLabel(hold.commodityId)}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Mass</span>
                          <span className="va-stat-value">{mass(hold.kg)}</span>
                        </div>
                        <div>
                          <span className="va-stat-label">Dist</span>
                          <span className="va-stat-value">
                            {distNm === '—' ? '—' : `${distNm} nm`}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Pay</span>
                          <span className="va-stat-value">{pay ?? '—'}</span>
                        </div>
                        <div>
                          <span className="va-stat-label">Expires</span>
                          <span
                            className={`va-stat-value va-hauls-expiry${
                              expiry.urgent ? ' is-urgent' : ''
                            }`}
                            title={
                              kind === 'demand'
                                ? 'Hold TTL, capped by Demand order expiry'
                                : 'Hold TTL by warehouse tier'
                            }
                          >
                            {expiry.label}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">By</span>
                          <span
                            className="va-stat-value"
                            title={byName ? 'Posted by' : undefined}
                          >
                            {byName || '—'}
                          </span>
                        </div>
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
                              ? needsPartial
                                ? `Hold ${mass(hold.kg)} exceeds this airframe — open Manifest to load a slice`
                                : `Open Dispatch — ferry to ${origin} before Accept`
                              : 'Dispatch the full hold on this aircraft'
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
                {filteredActive.map((m) => {
                  const origin = m.originIcao.trim().toUpperCase();
                  const dest = m.destIcao.trim().toUpperCase();
                  const kind = m.kind ?? 'other';
                  const kindLabel =
                    kind === 'other' ? 'Flight' : holdKindLabel(kind);
                  const acf = m.aircraftId
                    ? props.fleet.find((a) => a.id === m.aircraftId)
                    : undefined;
                  const tail =
                    acf?.label?.trim() ||
                    acf?.registration?.trim() ||
                    null;
                  const distNm =
                    typeof m.distanceNm === 'number' &&
                    Number.isFinite(m.distanceNm) &&
                    m.distanceNm > 0
                      ? Math.round(m.distanceNm).toLocaleString()
                      : null;
                  const statusLabel = m.status.replace(/_/g, ' ');
                  return (
                    <li
                      key={m.id}
                      className="va-hauls-row va-hauls-row-active"
                    >
                      <div className="va-hauls-row-id">
                        <strong className="va-hauls-route-od">
                          {origin}
                          <span className="va-hauls-route-arrow" aria-hidden>
                            →
                          </span>
                          {dest}
                        </strong>
                        <span
                          className={`va-hauls-kind va-hauls-kind-${
                            kind === 'other' ? 'demand' : kind
                          }`}
                        >
                          {kindLabel}
                        </span>
                      </div>
                      <div
                        className="va-hauls-stats va-hauls-stats-active"
                        aria-label="Active flight details"
                      >
                        <div>
                          <span className="va-stat-label">Cargo</span>
                          <span className="va-stat-value">
                            {commodityLabel(m.commodityId)}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Mass</span>
                          <span className="va-stat-value">
                            {mass(m.cargoKg)}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Dist</span>
                          <span className="va-stat-value">
                            {distNm ? `${distNm} nm` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Pay</span>
                          <span className="va-stat-value">
                            {m.payUsd > 0
                              ? formatBoardMoney(m.payUsd)
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Status</span>
                          <span className="va-stat-value va-hauls-status">
                            {statusLabel}
                          </span>
                        </div>
                        <div>
                          <span className="va-stat-label">Aircraft</span>
                          <span
                            className="va-stat-value"
                            title={tail ?? undefined}
                          >
                            {tail || '—'}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
