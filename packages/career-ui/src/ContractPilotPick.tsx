import { useEffect, useRef, useState } from 'react';
import {
  fetchContractPilotOptions,
  type ContractPilotOptions,
  type ContractPilotPickAirframe,
} from './api';
import { BusyStatus } from './Busy';

export function flyableContractPilotAirframes(
  airframes: readonly ContractPilotPickAirframe[],
  isRepo: boolean,
): ContractPilotPickAirframe[] {
  return isRepo
    ? airframes.filter((a) => a.pilotFeeUsd > 0)
    : airframes.filter((a) => a.liftKg > 0);
}

export function preferredContractPilotAirframe(
  flyable: readonly ContractPilotPickAirframe[],
): ContractPilotPickAirframe | undefined {
  return (
    flyable.find((a) => a.coversOffer) ??
    flyable.slice().sort((a, b) => b.liftKg - a.liftKg)[0]
  );
}

function emptyFlyableMessage(
  options: ContractPilotOptions,
  isRepo: boolean,
  formatTonnes: (kg: number) => string,
): string {
  const classLabel = options.offer.aircraftClassId.replace(/_/g, ' ');
  if (isRepo) {
    return `No homologated ${classLabel} airframe for this ferry`;
  }
  return `No homologated ${classLabel} can fly this route with cargo (${formatTonnes(options.offer.cargoKg)} · ${Math.round(options.offer.distanceNm ?? 0)} nm) — fuel/MTOW leaves 0 lift`;
}

export function ContractPilotPick(props: {
  lotId: string;
  isRepo: boolean;
  originIcao?: string;
  destIcao?: string;
  cargoKg?: number;
  aircraftClassId?: string;
  formatTonnes: (kg: number) => string;
  formatMoney: (n: number) => string;
  selectedRef: { current: string };
  onReadyChange: (ready: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ContractPilotOptions | null>(null);
  const onReadyChangeRef = useRef(props.onReadyChange);
  onReadyChangeRef.current = props.onReadyChange;

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setOptions(null);
    props.selectedRef.current = '';
    onReadyChangeRef.current(false);
    void fetchContractPilotOptions({ lotId: props.lotId, signal: ac.signal })
      .then((payload) => {
        if (ac.signal.aborted) return;
        setOptions(payload);
        setLoading(false);
        const repo = Boolean(props.isRepo || payload.offer.crewReposition);
        const flyable = flyableContractPilotAirframes(payload.airframes, repo);
        if (flyable.length === 0) {
          setError(emptyFlyableMessage(payload, repo, props.formatTonnes));
          onReadyChangeRef.current(false);
          return;
        }
        const preferred = preferredContractPilotAirframe(flyable)!;
        props.selectedRef.current = preferred.typeId;
        onReadyChangeRef.current(true);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof Error && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
        onReadyChangeRef.current(false);
      });
    return () => ac.abort();
  }, [props.lotId, props.isRepo, props.formatTonnes, props.selectedRef]);

  const offer = options?.offer;
  const origin = offer?.originIcao ?? props.originIcao ?? '—';
  const dest = offer?.destIcao ?? props.destIcao ?? '—';
  const classId = offer?.aircraftClassId ?? props.aircraftClassId ?? '';
  const cargoKg = offer?.cargoKg ?? props.cargoKg;
  const isRepo = Boolean(props.isRepo || offer?.crewReposition);
  const flyable = options
    ? flyableContractPilotAirframes(options.airframes, isRepo)
    : [];
  const preferred = preferredContractPilotAirframe(flyable);

  return (
    <div className="contract-pilot-pick">
      <p>
        {origin} → {dest} ·{' '}
        {isRepo
          ? 'empty ferry'
          : cargoKg != null
            ? `${props.formatTonnes(cargoKg)} reserved`
            : 'loading lift…'}{' '}
        · {classId ? classId.replace(/_/g, ' ') : '…'}
      </p>
      <p className="muted">
        {isRepo
          ? 'Pick any homologated airframe of this class. Operator covers fuel.'
          : 'Pick any homologated airframe of this class. Lift is capped by route fuel/MTOW — leftover stays on the board for you to claim again until the window closes (then the operator flies what remains).'}
      </p>
      <label className="contract-pilot-pick-label">
        Aircraft
        {loading ? (
          <BusyStatus className="contract-pilot-pick-loading" label="Loading airframes…" />
        ) : (
        <select
          className="contract-pilot-pick-select"
          key={preferred?.typeId ?? 'loading'}
          defaultValue={preferred?.typeId}
          disabled={flyable.length === 0}
          onChange={(event) => {
            props.selectedRef.current = event.target.value;
          }}
        >
          {flyable.length === 0 ? (
            <option value="">No flyable airframe</option>
          ) : (
            flyable.map((a) => (
              <option key={a.typeId} value={a.typeId}>
                {a.label} · lift {props.formatTonnes(a.liftKg)}
                {a.routeLimited ? ' · route-limited' : ''}
                {a.remainderKg > 0
                  ? ` · ${props.formatTonnes(a.remainderKg)} left on board`
                  : ' · full offer'}
                {` · fee ${props.formatMoney(a.pilotFeeUsd)}`}
              </option>
            ))
          )}
        </select>
        )}
      </label>
      {error ? <p className="contract-pilot-pick-error">{error}</p> : null}
    </div>
  );
}
