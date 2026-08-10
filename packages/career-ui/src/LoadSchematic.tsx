import { useRef, type CSSProperties } from 'react';
import { formatMassExact, KG_TO_LB, type WeightSystem } from './weight-units';

type FuelTanks = {
  left: number;
  right: number;
  center: number;
  leftAux?: number;
  rightAux?: number;
  leftTip?: number;
  rightTip?: number;
};

function massFromLb(lb: number | undefined, weightSystem: WeightSystem): string {
  if (lb === undefined || !Number.isFinite(lb)) return '—';
  return formatMassExact(lb / KG_TO_LB, weightSystem);
}

function fillRatio(current: number, max: number | undefined): number | undefined {
  if (max === undefined || !(max > 0) || !Number.isFinite(current)) return undefined;
  return Math.min(1, Math.max(0, current / max));
}

function SchematicCell(props: {
  className: string;
  label: string;
  valueLb: number;
  maxLb?: number;
  weightSystem: WeightSystem;
}) {
  const fill = fillRatio(props.valueLb, props.maxLb);
  const style =
    fill !== undefined
      ? ({ '--schematic-fill': String(fill) } as CSSProperties)
      : undefined;
  return (
    <div
      className={props.className}
      style={style}
      title={
        props.maxLb !== undefined && props.maxLb > 0
          ? `${massFromLb(props.valueLb, props.weightSystem)} / ${massFromLb(props.maxLb, props.weightSystem)}`
          : undefined
      }
    >
      {fill !== undefined ? (
        <span className="load-schematic-fill" aria-hidden="true" />
      ) : null}
      <span className="load-schematic-label">{props.label}</span>
      <strong>{massFromLb(props.valueLb, props.weightSystem)}</strong>
    </div>
  );
}

function sidePresent(
  qty: number | undefined,
  cap: number | undefined,
): boolean {
  return (qty !== undefined && qty > 0.5) || (cap !== undefined && cap > 0.5);
}

function outerSum(t: FuelTanks): number {
  return (
    (t.leftAux ?? 0) +
    (t.rightAux ?? 0) +
    (t.leftTip ?? 0) +
    (t.rightTip ?? 0)
  );
}

/**
 * Hold last non-zero tip/aux while mains stay loaded — stops the Learjet UI flash
 * (TL/TR → 0 lb, Sim 2508 = L+R only) when capacity still shows the tip cells.
 * Release when FUEL TOTAL already matches mains-only (tips truly drained).
 */
function stickyOuterTanks(
  tanks: FuelTanks,
  prevSticky: FuelTanks | undefined,
  totalFuelLb?: number,
): FuelTanks {
  const mains = tanks.left + tanks.right + tanks.center;
  if (mains < 50) return tanks;
  const prev = prevSticky;
  if (!prev || outerSum(prev) < 25) return tanks;
  if (outerSum(tanks) > outerSum(prev) * 0.15) return tanks;
  if (
    typeof totalFuelLb === 'number' &&
    Number.isFinite(totalFuelLb) &&
    Math.abs(totalFuelLb - mains) <= Math.max(40, totalFuelLb * 0.03)
  ) {
    return tanks;
  }
  return {
    ...tanks,
    ...(prev.leftAux != null ? { leftAux: prev.leftAux } : {}),
    ...(prev.rightAux != null ? { rightAux: prev.rightAux } : {}),
    ...(prev.leftTip != null ? { leftTip: prev.leftTip } : {}),
    ...(prev.rightTip != null ? { rightTip: prev.rightTip } : {}),
  };
}

/** Compact wing tank schematic: (Tip) (Aux) L | (C) | R (Aux) (Tip) with live Sim values. */
export function FuelTankSchematic(props: {
  tanks?: FuelTanks;
  tankCapacity?: FuelTanks;
  /** Live FUEL TOTAL — used to release sticky tip/aux after a real drain. */
  liveFuelLb?: number;
  weightSystem: WeightSystem;
}) {
  const stickyRef = useRef<FuelTanks | undefined>(undefined);
  const incoming = props.tanks;
  if (!incoming) return null;
  const tanks = stickyOuterTanks(
    incoming,
    stickyRef.current,
    props.liveFuelLb,
  );
  if (
    outerSum(tanks) >= 25 ||
    tanks.left + tanks.right + tanks.center < 50 ||
    // Clear sticky after a trusted empty-outer sample so residue does not stick.
    (outerSum(incoming) < 25 &&
      typeof props.liveFuelLb === 'number' &&
      Math.abs(
        props.liveFuelLb -
          (incoming.left + incoming.right + incoming.center),
      ) <= Math.max(40, props.liveFuelLb * 0.03))
  ) {
    stickyRef.current = tanks;
  }
  const cap = props.tankCapacity;
  const showLeftTip = sidePresent(tanks.leftTip, cap?.leftTip);
  const showRightTip = sidePresent(tanks.rightTip, cap?.rightTip);
  const showLeftAux = sidePresent(tanks.leftAux, cap?.leftAux);
  const showRightAux = sidePresent(tanks.rightAux, cap?.rightAux);
  // Jets with tip/aux: empty center is normal (fuel in mains+tips) — don't paint a red C.
  const hasWingOuters =
    showLeftTip || showRightTip || showLeftAux || showRightAux;
  const showCenter =
    tanks.center > 0.5 ||
    (cap !== undefined && cap.center > 0.5 && !hasWingOuters);
  // Many jets (e.g. Learjet) map tip tanks to AUX SimVars — label as Tip when no TIP exists.
  const auxAsTip = !showLeftTip && !showRightTip;
  const leftOuterLabel = showLeftTip ? 'TL' : auxAsTip ? 'TL' : 'AL';
  const rightOuterLabel = showRightTip ? 'TR' : auxAsTip ? 'TR' : 'AR';

  return (
    <div className="load-schematic load-schematic-fuel" aria-label="Fuel tanks">
      {showLeftTip ? (
        <SchematicCell
          className="load-schematic-tip load-schematic-tip-left"
          label="TL"
          valueLb={tanks.leftTip ?? 0}
          maxLb={cap?.leftTip}
          weightSystem={props.weightSystem}
        />
      ) : null}
      {showLeftAux ? (
        <SchematicCell
          className={
            auxAsTip
              ? 'load-schematic-tip load-schematic-tip-left'
              : 'load-schematic-aux load-schematic-aux-left'
          }
          label={leftOuterLabel}
          valueLb={tanks.leftAux ?? 0}
          maxLb={cap?.leftAux}
          weightSystem={props.weightSystem}
        />
      ) : null}
      <SchematicCell
        className="load-schematic-wing"
        label="L"
        valueLb={tanks.left}
        maxLb={cap?.left}
        weightSystem={props.weightSystem}
      />
      {showCenter ? (
        <SchematicCell
          className="load-schematic-center"
          label="C"
          valueLb={tanks.center}
          maxLb={cap?.center}
          weightSystem={props.weightSystem}
        />
      ) : (
        <div className="load-schematic-fuselage" aria-hidden="true" />
      )}
      <SchematicCell
        className="load-schematic-wing"
        label="R"
        valueLb={tanks.right}
        maxLb={cap?.right}
        weightSystem={props.weightSystem}
      />
      {showRightAux ? (
        <SchematicCell
          className={
            auxAsTip
              ? 'load-schematic-tip load-schematic-tip-right'
              : 'load-schematic-aux load-schematic-aux-right'
          }
          label={rightOuterLabel}
          valueLb={tanks.rightAux ?? 0}
          maxLb={cap?.rightAux}
          weightSystem={props.weightSystem}
        />
      ) : null}
      {showRightTip ? (
        <SchematicCell
          className="load-schematic-tip load-schematic-tip-right"
          label="TR"
          valueLb={tanks.rightTip ?? 0}
          maxLb={cap?.rightTip}
          weightSystem={props.weightSystem}
        />
      ) : null}
    </div>
  );
}

/** Format % MAC for UI (avoids float noise like 14.499999999999998). */
export function formatMacPct(mac: number, digits = 1): string {
  if (!Number.isFinite(mac)) return '—';
  return Number(mac.toFixed(digits)).toFixed(digits);
}

/** Vertical MAC bar: envelope band + live CG marker (aft = top). */
export function CgEnvelopeSchematic(props: {
  liveMac?: number;
  minMac?: number;
  maxMac?: number;
  ok?: boolean;
}) {
  const { liveMac, minMac, maxMac, ok } = props;
  if (
    minMac === undefined ||
    maxMac === undefined ||
    !Number.isFinite(minMac) ||
    !Number.isFinite(maxMac) ||
    maxMac <= minMac
  ) {
    return null;
  }

  const pad = Math.max(5, (maxMac - minMac) * 0.35);
  const extremes = [minMac, maxMac];
  if (liveMac !== undefined && Number.isFinite(liveMac)) extremes.push(liveMac);
  const scaleMin = Math.max(0, Math.min(...extremes) - pad);
  const scaleMax = Math.min(100, Math.max(...extremes) + pad);
  const span = scaleMax - scaleMin || 1;
  // Black Square / aircraft tablet: nose/FWD at top, tail/AFT at bottom
  // (higher % MAC is further aft → lower on the rail).
  const fromTop = (mac: number) =>
    `${((mac - scaleMin) / span) * 100}%`;
  const bandHeight = ((maxMac - minMac) / span) * 100;
  const liveKnown = liveMac !== undefined && Number.isFinite(liveMac);
  const outOfEnvelope =
    liveKnown && (liveMac < minMac || liveMac > maxMac);
  const tone =
    ok === false || outOfEnvelope ? 'warn' : ok === true ? 'ok' : 'neutral';
  const minLabel = formatMacPct(minMac);
  const maxLabel = formatMacPct(maxMac);

  return (
    <div
      className={`load-schematic load-schematic-cg load-schematic-cg-${tone}`}
      aria-label={
        liveKnown
          ? `CG ${formatMacPct(liveMac)}% MAC, envelope ${minLabel} to ${maxLabel}`
          : `CG envelope ${minLabel} to ${maxLabel}`
      }
    >
      <div className="cg-schematic-rail" aria-hidden="true">
        <span
          className="cg-schematic-band"
          style={{
            top: fromTop(minMac),
            height: `${bandHeight}%`,
          }}
        />
        {liveKnown ? (
          <span
            className="cg-schematic-marker"
            style={{ top: fromTop(liveMac) }}
          />
        ) : null}
      </div>
      <div className="cg-schematic-scale" aria-hidden="true">
        <span className="cg-schematic-fwd">FWD {minLabel}</span>
        {liveKnown ? (
          <span
            className="cg-schematic-live"
            style={{ top: fromTop(liveMac) }}
          >
            {formatMacPct(liveMac)}
          </span>
        ) : null}
        <span className="cg-schematic-aft">AFT {maxLabel}</span>
      </div>
    </div>
  );
}

/** Compact station row with live Sim payload per station. */
export function PayloadStationSchematic(props: {
  stations?: Record<number, number>;
  stationMax?: Record<number, number>;
  weightSystem: WeightSystem;
}) {
  const stations = props.stations;
  if (!stations) return null;
  const maxMap = props.stationMax;
  const indexes = new Set<number>([
    ...Object.keys(stations).map(Number),
    ...(maxMap ? Object.keys(maxMap).map(Number) : []),
  ]);
  const entries = [...indexes]
    .filter((index) => Number.isFinite(index))
    .map((index) => ({
      index,
      lb: stations[index] ?? 0,
      maxLb: maxMap?.[index],
    }))
    .sort((a, b) => a.index - b.index);
  if (entries.length === 0) return null;

  const showZeros = entries.length <= 8;
  const visible = showZeros
    ? entries
    : entries.filter((e) => e.lb > 0.5 || (e.maxLb !== undefined && e.maxLb > 0));
  if (visible.length === 0) return null;

  return (
    <div
      className="load-schematic load-schematic-stations"
      aria-label="Payload stations"
    >
      {visible.map((e) => (
        <SchematicCell
          key={e.index}
          className="load-schematic-station"
          label={`S${e.index}`}
          valueLb={e.lb}
          maxLb={e.maxLb}
          weightSystem={props.weightSystem}
        />
      ))}
    </div>
  );
}
