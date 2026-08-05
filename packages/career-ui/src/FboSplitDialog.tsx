import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PlayerAircraft, PlayerFboHold } from './api';
import {
  displayToKg,
  kgToDisplay,
  massUnitLabel,
  type WeightSystem,
} from './weight-units';

export type FboSplitAircraftOption = {
  aircraft: PlayerAircraft;
  maxCargoKg: number;
  maxRangeNm: number;
};

const PRESETS = [0.25, 0.5, 0.75, 1] as const;

function displayFromKg(kg: number, system: WeightSystem): number {
  return Math.max(0, Math.round(kgToDisplay(kg, system)));
}

/** Assign cargo across parked airframes for company-crew legs. */
export function FboSplitDialog(props: {
  hold: PlayerFboHold;
  options: FboSplitAircraftOption[];
  weightSystem: WeightSystem;
  formatMoney: (n: number) => string;
  formatTonnes: (kg: number) => string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (legs: Array<{ aircraftId: string; cargoKg: number }>) => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const onCancelRef = useRef(props.onCancel);
  onCancelRef.current = props.onCancel;
  const unit = massUnitLabel(props.weightSystem);

  /** Internal allocation in kg (career source of truth). */
  const [allocById, setAllocById] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const opt of props.options) init[opt.aircraft.id] = 0;
    return init;
  });
  /** Raw input text while typing — avoids lb↔kg round-trip mangling. */
  const [draftById, setDraftById] = useState<Record<string, string>>({});

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const distanceNm = props.hold.distanceNm;
  const parsed = useMemo(() => {
    return props.options.map((opt) => {
      const cargoKg = Math.max(0, Math.floor(allocById[opt.aircraft.id] ?? 0));
      const overCargo = cargoKg > opt.maxCargoKg;
      const overRange =
        distanceNm != null &&
        Number.isFinite(distanceNm) &&
        distanceNm > opt.maxRangeNm;
      return { ...opt, cargoKg, overCargo, overRange };
    });
  }, [props.options, allocById, distanceNm]);

  const allocatedKg = parsed.reduce((sum, p) => sum + p.cargoKg, 0);
  const remainingKg = Math.max(0, props.hold.cargoKg - allocatedKg);
  const overHold = allocatedKg > props.hold.cargoKg;
  const activeLegs = parsed.filter((p) => p.cargoKg > 0);
  const payPreview = activeLegs.map((leg) => ({
    id: leg.aircraft.id,
    payUsd: Math.max(
      1,
      Math.round(props.hold.payUsd * (leg.cargoKg / props.hold.cargoKg) * 100) /
        100,
    ),
  }));

  const canConfirm =
    !props.busy &&
    !overHold &&
    activeLegs.length > 0 &&
    activeLegs.every((leg) => !leg.overCargo && !leg.overRange);

  function roomFor(aircraftId: string, maxCargoKg: number): number {
    const others = Object.entries(allocById).reduce((sum, [id, kg]) => {
      if (id === aircraftId) return sum;
      return sum + Math.max(0, Math.floor(kg));
    }, 0);
    const holdRoom = Math.max(0, props.hold.cargoKg - others);
    return Math.max(0, Math.min(maxCargoKg, holdRoom));
  }

  function setAircraftKg(aircraftId: string, nextKg: number, maxCargoKg: number) {
    const capped = Math.max(
      0,
      Math.min(roomFor(aircraftId, maxCargoKg), Math.round(nextKg)),
    );
    setAllocById((cur) => ({ ...cur, [aircraftId]: capped }));
    return capped;
  }

  function clearDraft(aircraftId: string) {
    setDraftById((cur) => {
      if (!(aircraftId in cur)) return cur;
      const next = { ...cur };
      delete next[aircraftId];
      return next;
    });
  }

  function commitDisplayValue(
    aircraftId: string,
    maxCargoKg: number,
    rawText: string,
  ) {
    const trimmed = rawText.trim();
    if (trimmed === '' || trimmed === '-') {
      setAircraftKg(aircraftId, 0, maxCargoKg);
      clearDraft(aircraftId);
      return;
    }
    const raw = Number(trimmed);
    if (!Number.isFinite(raw) || raw < 0) {
      clearDraft(aircraftId);
      return;
    }
    const nextKg = displayToKg(raw, props.weightSystem);
    setAircraftKg(aircraftId, nextKg, maxCargoKg);
    clearDraft(aircraftId);
  }

  function setFraction(
    aircraftId: string,
    maxCargoKg: number,
    fraction: number,
  ) {
    const room = roomFor(aircraftId, maxCargoKg);
    const next =
      fraction >= 1 ? room : Math.max(0, Math.round(room * fraction));
    setAllocById((cur) => ({ ...cur, [aircraftId]: next }));
    clearDraft(aircraftId);
  }

  return (
    <div
      className="confirm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancelRef.current();
      }}
    >
      <div
        className="confirm-dialog tone-warn fbo-split-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <p className="confirm-kicker">Check before continuing</p>
        <h2 id={titleId} className="confirm-title">
          Crew fly — assign cargo?
        </h2>
        <div id={bodyId} className="confirm-body">
          <p>
            {props.hold.originIcao}→{props.hold.destIcao}
            {distanceNm != null
              ? ` · ${Math.round(distanceNm).toLocaleString()} nm`
              : ''}{' '}
            · {props.formatTonnes(props.hold.cargoKg)} · contract{' '}
            {props.formatMoney(props.hold.payUsd)}
          </p>
          <p>
            Assign cargo to parked airframes at origin. Each leg becomes an
            Accepted mission — then send with Crew fly on the Accepted list
            below (or Hangar → Crew). Unassigned cargo stays bonded.
          </p>

          {props.options.length === 0 ? (
            <p className="confirm-quote is-error">
              No parked aircraft at {props.hold.originIcao}.
            </p>
          ) : (
            <ul className="fbo-split-list">
              {parsed.map((leg) => {
                const pay = payPreview.find((p) => p.id === leg.aircraft.id);
                const room = roomFor(leg.aircraft.id, leg.maxCargoKg);
                const draft = draftById[leg.aircraft.id];
                const displayValue =
                  draft !== undefined
                    ? draft
                    : leg.cargoKg > 0
                      ? String(displayFromKg(leg.cargoKg, props.weightSystem))
                      : '';
                return (
                  <li key={leg.aircraft.id} className="fbo-split-row">
                    <div className="fbo-split-meta">
                      <strong>{leg.aircraft.label}</strong>
                      <small>
                        max {props.formatTonnes(leg.maxCargoKg)} · range{' '}
                        {leg.maxRangeNm.toLocaleString()} nm
                        {leg.overRange ? ' · out of range' : ''}
                        {leg.overCargo ? ' · over cargo' : ''}
                      </small>
                      <div className="cargo-presets fbo-split-presets">
                        {PRESETS.map((fraction) => (
                          <button
                            key={fraction}
                            type="button"
                            disabled={
                              props.busy || leg.overRange || room <= 0
                            }
                            onClick={() =>
                              setFraction(
                                leg.aircraft.id,
                                leg.maxCargoKg,
                                fraction,
                              )
                            }
                          >
                            {fraction === 1 ? 'Max' : `${fraction * 100}%`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="fbo-split-kg">
                      <span>{unit}</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        disabled={props.busy || leg.overRange}
                        value={displayValue}
                        title={`Max ${displayFromKg(room, props.weightSystem).toLocaleString()} ${unit}`}
                        aria-label={`Cargo ${unit} for ${leg.aircraft.label}`}
                        onChange={(e) => {
                          const text = e.target.value.replace(/[^\d]/g, '');
                          setDraftById((cur) => ({
                            ...cur,
                            [leg.aircraft.id]: text,
                          }));
                          if (text === '') {
                            setAllocById((cur) => ({
                              ...cur,
                              [leg.aircraft.id]: 0,
                            }));
                            return;
                          }
                          const raw = Number(text);
                          if (!Number.isFinite(raw)) return;
                          // Live totals for pay/remaining; input text stays as typed.
                          setAircraftKg(
                            leg.aircraft.id,
                            displayToKg(raw, props.weightSystem),
                            leg.maxCargoKg,
                          );
                        }}
                        onBlur={(e) =>
                          commitDisplayValue(
                            leg.aircraft.id,
                            leg.maxCargoKg,
                            e.currentTarget.value,
                          )
                        }
                      />
                    </label>
                    {leg.cargoKg > 0 && pay ? (
                      <small className="fbo-split-pay">
                        ~{props.formatMoney(pay.payUsd)}
                      </small>
                    ) : (
                      <small className="fbo-split-pay muted">—</small>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="confirm-quote-slot" aria-live="polite">
            <p className={`confirm-quote${overHold ? ' is-error' : ''}`}>
              Allocated {props.formatTonnes(allocatedKg)}
              {' · '}
              remaining {props.formatTonnes(remainingKg)}
              {overHold ? ' · exceeds hold' : ''}
            </p>
          </div>
        </div>
        <div className="confirm-actions">
          <button
            type="button"
            className="action ghost"
            onClick={() => onCancelRef.current()}
            disabled={props.busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="action warn"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return;
              props.onConfirm(
                activeLegs.map((leg) => ({
                  aircraftId: leg.aircraft.id,
                  cargoKg: leg.cargoKg,
                })),
              );
            }}
          >
            Crew fly
          </button>
        </div>
      </div>
    </div>
  );
}
