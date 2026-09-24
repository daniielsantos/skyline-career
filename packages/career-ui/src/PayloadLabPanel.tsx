import { useEffect, useMemo, useState } from 'react';
import {
  deletePayloadLab,
  fetchPayloadLab,
  postPayloadLab,
  type Mission,
  type PayloadLabAirframeOption,
} from './api';
import { KG_TO_LB } from './weight-units';

/** Matches shared `CHARTER_BAGGAGE_KG_PER_PAX` for Lab preview only. */
const LAB_CHARTER_BAGGAGE_KG_PER_PAX = 18;

function kgToLb(kg: number): number {
  return Math.round(kg * KG_TO_LB);
}

function lbToKg(lb: number): number {
  return Math.max(1, Math.round(lb / KG_TO_LB));
}

function defaultCargoLb(option: PayloadLabAirframeOption | undefined): number {
  const maxKg = option?.maxCargoKg;
  if (typeof maxKg === 'number' && maxKg > 0) {
    const maxLb = kgToLb(maxKg);
    return Math.max(100, Math.min(maxLb, Math.round(maxLb * 0.6)));
  }
  return 880;
}

function defaultPax(option: PayloadLabAirframeOption | undefined): number {
  const max = option?.maxPaxSeats;
  if (typeof max === 'number' && max > 0) {
    return Math.max(1, Math.min(max, Math.round(max * 0.5)));
  }
  return 4;
}

function formatLb(lb: number): string {
  return `${Math.round(lb).toLocaleString()} lb`;
}

const CLASS_LABELS: Record<string, string> = {
  light_ga: 'Light GA',
  light_turboprop: 'Light turboprop',
  light_jet: 'Light jet',
  medium_piston: 'Medium piston',
  narrow_freighter: 'Narrow freighter',
  wide_freighter: 'Wide freighter',
};

function classLabel(id: string): string {
  return CLASS_LABELS[id] ?? id;
}

function loadLayoutLabel(layout: string | undefined): string {
  return layout === 'pax_and_cargo' ? 'pax_and_cargo' : 'freighter';
}

function airframeMatchesQuery(
  row: PayloadLabAirframeOption,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const layout = loadLayoutLabel(row.loadLayout);
  return (
    row.label.toLowerCase().includes(q) ||
    row.typeId.toLowerCase().includes(q) ||
    row.aircraftClassId.toLowerCase().includes(q) ||
    layout.includes(q) ||
    (q === 'pax' && layout === 'pax_and_cargo') ||
    (q === 'freight' && layout === 'freighter')
  );
}

type LabKind = 'freight' | 'charter';

export function PayloadLabPanel(props: {
  busy: boolean;
  homeHubIcao?: string | null;
  activeLabMission?: Mission | null;
  onOpenDispatch: () => void;
  onMissionsUpdated: (missions: Mission[]) => void;
}) {
  const [options, setOptions] = useState<PayloadLabAirframeOption[]>([]);
  const [typeId, setTypeId] = useState('');
  const [labKind, setLabKind] = useState<LabKind>('freight');
  const [cargoLb, setCargoLb] = useState(880);
  const [pax, setPax] = useState(4);
  const [originIcao, setOriginIcao] = useState('SBGR');
  const [destIcao, setDestIcao] = useState('SBSP');
  const [textFilter, setTextFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const classIds = useMemo(() => {
    const ids = new Set(options.map((row) => row.aircraftClassId));
    return [...ids].sort((a, b) =>
      classLabel(a).localeCompare(classLabel(b)),
    );
  }, [options]);

  const filtered = useMemo(() => {
    return options.filter((row) => {
      if (classFilter && row.aircraftClassId !== classFilter) return false;
      if (labKind === 'charter') {
        const seats = row.maxPaxSeats;
        if (!(typeof seats === 'number' && seats > 0)) return false;
      }
      return airframeMatchesQuery(row, textFilter);
    });
  }, [options, classFilter, textFilter, labKind]);

  const selected = useMemo(
    () => options.find((row) => row.typeId === typeId),
    [options, typeId],
  );

  const selectedMaxLb =
    typeof selected?.maxCargoKg === 'number' && selected.maxCargoKg > 0
      ? kgToLb(selected.maxCargoKg)
      : undefined;

  const selectedMaxPax =
    typeof selected?.maxPaxSeats === 'number' && selected.maxPaxSeats > 0
      ? selected.maxPaxSeats
      : undefined;

  const baggageLbPreview =
    labKind === 'charter' && pax >= 1
      ? kgToLb(pax * LAB_CHARTER_BAGGAGE_KG_PER_PAX)
      : 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchPayloadLab()
      .then((data) => {
        if (cancelled) return;
        setOptions(data.options);
        const home = props.homeHubIcao?.trim().toUpperCase();
        if (home) {
          setOriginIcao(home);
          setDestIcao(home === 'SBGR' ? 'SBSP' : 'SBGR');
        }
        const preferred =
          data.mission?.airframeTypeId ||
          data.options.find((o) => o.typeId.includes('c172'))?.typeId ||
          data.options[0]?.typeId ||
          '';
        setTypeId(preferred);
        const opt = data.options.find((o) => o.typeId === preferred);
        if (opt) setClassFilter(opt.aircraftClassId);
        if (data.mission?.missionType === 'charter') {
          setLabKind('charter');
          setPax(
            data.mission.pax && data.mission.pax > 0
              ? data.mission.pax
              : defaultPax(opt),
          );
        } else {
          setLabKind('freight');
          setCargoLb(
            data.mission?.cargoKg && data.mission.cargoKg > 0
              ? kgToLb(data.mission.cargoKg)
              : defaultCargoLb(opt),
          );
        }
        if (data.mission) {
          setOriginIcao(data.mission.originIcao);
          setDestIcao(data.mission.destIcao);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.homeHubIcao]);

  useEffect(() => {
    if (!selected) return;
    if (labKind === 'freight') {
      if (selectedMaxLb !== undefined && cargoLb > selectedMaxLb) {
        setCargoLb(selectedMaxLb);
      }
    } else if (selectedMaxPax !== undefined && pax > selectedMaxPax) {
      setPax(selectedMaxPax);
    }
  }, [selected?.typeId, selectedMaxLb, selectedMaxPax, labKind]);

  useEffect(() => {
    if (!typeId) return;
    if (filtered.some((row) => row.typeId === typeId)) return;
    const next = filtered[0];
    if (!next) {
      setTypeId('');
      return;
    }
    setTypeId(next.typeId);
    if (labKind === 'charter') setPax(defaultPax(next));
    else setCargoLb(defaultCargoLb(next));
  }, [filtered, typeId, labKind]);

  async function onStart() {
    setError(null);
    setWorking(true);
    try {
      const result = await postPayloadLab(
        labKind === 'charter'
          ? {
              airframeTypeId: typeId,
              missionKind: 'charter',
              pax,
              originIcao,
              destIcao,
            }
          : {
              airframeTypeId: typeId,
              missionKind: 'freight',
              cargoKg: lbToKg(cargoLb),
              originIcao,
              destIcao,
            },
      );
      props.onMissionsUpdated(result.missions);
      props.onOpenDispatch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  }

  async function onCancelLab() {
    setError(null);
    setWorking(true);
    try {
      const result = await deletePayloadLab();
      props.onMissionsUpdated(result.missions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  }

  const disabled = props.busy || working || loading || !typeId;
  const startDisabled =
    disabled ||
    (labKind === 'freight' ? cargoLb < 1 : pax < 1 || !selectedMaxPax);

  const activeIsCharter = props.activeLabMission?.missionType === 'charter';

  return (
    <section className="panel payload-lab-panel">
      <div className="panel-head">
        <div>
          <h2>Payload Lab</h2>
          <p className="muted">
            Dev harness: spawn a temporary Dispatch flight (no buy / ferry /
            settle). Uses the real Preflight UI for Open SimBrief, inject, and
            Due vs Sim. Weights in lb.
          </p>
        </div>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      {props.activeLabMission ? (
        <div className="card payload-lab-active">
          <p>
            Active lab: <strong>{props.activeLabMission.reason}</strong> ·{' '}
            {props.activeLabMission.originIcao}→
            {props.activeLabMission.destIcao} ·{' '}
            {activeIsCharter
              ? `${props.activeLabMission.pax ?? 0} pax · ${formatLb(
                  kgToLb(props.activeLabMission.baggageKg ?? 0),
                )} bags`
              : formatLb(kgToLb(props.activeLabMission.cargoKg))}
          </p>
          <div className="row-actions">
            <button
              type="button"
              className="primary"
              disabled={props.busy || working}
              onClick={() => props.onOpenDispatch()}
            >
              Open Dispatch
            </button>
            <button
              type="button"
              disabled={props.busy || working}
              onClick={() => void onCancelLab()}
            >
              Cancel lab flight
            </button>
          </div>
        </div>
      ) : null}

      <div className="card payload-lab-form">
        <div className="payload-lab-kind" role="group" aria-label="Lab mode">
          <button
            type="button"
            className={labKind === 'freight' ? 'is-active' : undefined}
            disabled={props.busy || working || loading}
            onClick={() => {
              setLabKind('freight');
              setCargoLb(defaultCargoLb(selected));
            }}
          >
            Freight
          </button>
          <button
            type="button"
            className={labKind === 'charter' ? 'is-active' : undefined}
            disabled={props.busy || working || loading}
            onClick={() => {
              setLabKind('charter');
              setPax(defaultPax(selected));
            }}
          >
            Charter
          </button>
        </div>

        <div className="payload-lab-filters">
          <label className="field">
            <span>Search</span>
            <input
              type="search"
              placeholder="Name, typeId…"
              value={textFilter}
              disabled={props.busy || working || loading}
              onChange={(e) => setTextFilter(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Class</span>
            <select
              value={classFilter}
              disabled={props.busy || working || loading}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="">All classes</option>
              {classIds.map((id) => (
                <option key={id} value={id}>
                  {classLabel(id)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>
            Airframe (Market SKU)
            {filtered.length !== options.length
              ? ` · ${filtered.length}/${options.length}`
              : ''}
          </span>
          <select
            value={filtered.some((r) => r.typeId === typeId) ? typeId : ''}
            disabled={disabled || filtered.length === 0}
            onChange={(e) => {
              const next = e.target.value;
              setTypeId(next);
              const opt = options.find((o) => o.typeId === next);
              if (labKind === 'charter') setPax(defaultPax(opt));
              else setCargoLb(defaultCargoLb(opt));
            }}
          >
            {loading ? (
              <option value="">Loading…</option>
            ) : filtered.length === 0 ? (
              <option value="">No matches</option>
            ) : (
              filtered.map((row) => (
                <option key={row.typeId} value={row.typeId}>
                  {row.label} · {classLabel(row.aircraftClassId)} ·{' '}
                  {loadLayoutLabel(row.loadLayout)}
                  {labKind === 'charter'
                    ? row.maxPaxSeats
                      ? ` · max ${row.maxPaxSeats} pax`
                      : ''
                    : row.maxCargoKg
                      ? ` · max ${formatLb(kgToLb(row.maxCargoKg))}`
                      : ''}
                </option>
              ))
            )}
          </select>
          {selected ? (
            <p
              className={`payload-lab-layout-chip payload-lab-layout-${loadLayoutLabel(selected.loadLayout)}`}
            >
              <strong>loadLayout</strong>
              <span>{loadLayoutLabel(selected.loadLayout)}</span>
              <span className="muted">
                {labKind === 'charter'
                  ? 'Charter Lab: exact pax + bags on OFP (no board offer). Inject still follows charter cert gate (inject_verified config).'
                  : selected.loadLayout === 'pax_and_cargo'
                    ? 'SKU fills cabin seats then leftover freight (SimBrief pax+cargo). Same for all glass variants on this Market card.'
                    : 'SKU is career freighter (omit/default). Cargo + Passengers glass share this — seats map as baggage. Not per-variant.'}
              </span>
            </p>
          ) : null}
        </label>

        {labKind === 'freight' ? (
          <label className="field">
            <span>
              Payload (lb)
              {selectedMaxLb !== undefined
                ? ` · max ${formatLb(selectedMaxLb)}`
                : ''}
            </span>
            <div className="payload-lab-payload-row">
              <input
                type="number"
                min={1}
                step={10}
                max={selectedMaxLb}
                value={cargoLb}
                disabled={disabled}
                onChange={(e) => setCargoLb(Number(e.target.value) || 0)}
              />
              <button
                type="button"
                disabled={disabled || selectedMaxLb === undefined}
                title={
                  selectedMaxLb !== undefined
                    ? `Set payload to max (${formatLb(selectedMaxLb)})`
                    : 'Select an airframe with a known max cargo'
                }
                onClick={() => {
                  if (selectedMaxLb !== undefined) setCargoLb(selectedMaxLb);
                }}
              >
                100%
              </button>
            </div>
          </label>
        ) : (
          <label className="field">
            <span>
              Passengers
              {selectedMaxPax !== undefined ? ` · max ${selectedMaxPax}` : ''}
              {baggageLbPreview > 0
                ? ` · bags ~${formatLb(baggageLbPreview)}`
                : ''}
            </span>
            <div className="payload-lab-payload-row">
              <input
                type="number"
                min={1}
                step={1}
                max={selectedMaxPax}
                value={pax}
                disabled={disabled || !selectedMaxPax}
                onChange={(e) => setPax(Math.max(1, Number(e.target.value) || 1))}
              />
              <button
                type="button"
                disabled={disabled || selectedMaxPax === undefined}
                title={
                  selectedMaxPax !== undefined
                    ? `Fill cabin (${selectedMaxPax} pax)`
                    : 'Select an airframe with passenger seats'
                }
                onClick={() => {
                  if (selectedMaxPax !== undefined) setPax(selectedMaxPax);
                }}
              >
                Full
              </button>
            </div>
          </label>
        )}

        <div className="payload-lab-od">
          <label className="field">
            <span>Origin</span>
            <input
              value={originIcao}
              disabled={disabled}
              onChange={(e) => setOriginIcao(e.target.value.toUpperCase())}
              maxLength={4}
            />
          </label>
          <label className="field">
            <span>Dest</span>
            <input
              value={destIcao}
              disabled={disabled}
              onChange={(e) => setDestIcao(e.target.value.toUpperCase())}
              maxLength={4}
            />
          </label>
        </div>

        <ol className="muted payload-lab-steps">
          <li>Load the aircraft in MSFS (solo, on ground).</li>
          <li>Start lab → Dispatch opens.</li>
          <li>Open SimBrief → Accept OFP → Airframe inject → watch Due vs Sim.</li>
          <li>Cancel the lab flight when finished (no settle).</li>
        </ol>

        <button
          type="button"
          className="primary"
          disabled={startDisabled}
          onClick={() => void onStart()}
        >
          {working ? 'Starting…' : 'Start lab → Dispatch'}
        </button>
      </div>
    </section>
  );
}
