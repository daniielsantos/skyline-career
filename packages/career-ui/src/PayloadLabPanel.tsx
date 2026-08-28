import { useEffect, useMemo, useState } from 'react';
import {
  deletePayloadLab,
  fetchPayloadLab,
  postPayloadLab,
  type Mission,
  type PayloadLabAirframeOption,
} from './api';
import { KG_TO_LB } from './weight-units';

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

export function PayloadLabPanel(props: {
  busy: boolean;
  homeHubIcao?: string | null;
  activeLabMission?: Mission | null;
  onOpenDispatch: () => void;
  onMissionsUpdated: (missions: Mission[]) => void;
}) {
  const [options, setOptions] = useState<PayloadLabAirframeOption[]>([]);
  const [typeId, setTypeId] = useState('');
  const [cargoLb, setCargoLb] = useState(880);
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
      return airframeMatchesQuery(row, textFilter);
    });
  }, [options, classFilter, textFilter]);

  const selected = useMemo(
    () => options.find((row) => row.typeId === typeId),
    [options, typeId],
  );

  const selectedMaxLb =
    typeof selected?.maxCargoKg === 'number' && selected.maxCargoKg > 0
      ? kgToLb(selected.maxCargoKg)
      : undefined;

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
        setCargoLb(
          data.mission?.cargoKg && data.mission.cargoKg > 0
            ? kgToLb(data.mission.cargoKg)
            : defaultCargoLb(opt),
        );
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
    if (selectedMaxLb !== undefined && cargoLb > selectedMaxLb) {
      setCargoLb(selectedMaxLb);
    }
  }, [selected?.typeId, selectedMaxLb]);

  useEffect(() => {
    if (!typeId) return;
    if (filtered.some((row) => row.typeId === typeId)) return;
    const next = filtered[0];
    if (!next) {
      setTypeId('');
      return;
    }
    setTypeId(next.typeId);
    setCargoLb(defaultCargoLb(next));
  }, [filtered, typeId]);

  async function onStart() {
    setError(null);
    setWorking(true);
    try {
      const result = await postPayloadLab({
        airframeTypeId: typeId,
        cargoKg: lbToKg(cargoLb),
        originIcao,
        destIcao,
      });
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
            {formatLb(kgToLb(props.activeLabMission.cargoKg))}
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
              setCargoLb(defaultCargoLb(opt));
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
                  {row.maxCargoKg
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
                {selected.loadLayout === 'pax_and_cargo'
                  ? 'SKU fills cabin seats then leftover freight (SimBrief pax+cargo). Same for all glass variants on this Market card.'
                  : 'SKU is career freighter (omit/default). Cargo + Passengers glass share this — seats map as baggage. Not per-variant.'}
              </span>
            </p>
          ) : null}
        </label>

        <label className="field">
          <span>
            Payload (lb)
            {selectedMaxLb !== undefined
              ? ` · max ${formatLb(selectedMaxLb)}`
              : ''}
          </span>
          <input
            type="number"
            min={1}
            step={10}
            max={selectedMaxLb}
            value={cargoLb}
            disabled={disabled}
            onChange={(e) => setCargoLb(Number(e.target.value) || 0)}
          />
        </label>

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
          <li>Open SimBrief → Accept OFP → Skyline inject → watch Due vs Sim.</li>
          <li>Cancel the lab flight when finished (no settle).</li>
        </ol>

        <button
          type="button"
          className="primary"
          disabled={disabled || cargoLb < 1}
          onClick={() => void onStart()}
        >
          {working ? 'Starting…' : 'Start lab → Dispatch'}
        </button>
      </div>
    </section>
  );
}
