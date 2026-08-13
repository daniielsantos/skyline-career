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
 * True when the empty outers are a real drain rather than a read hole: either
 * the sim reported them explicitly as zero, or FUEL TOTAL already accounts for
 * the mains alone. The tolerance is bounded by the vanished outer amount so a
 * heavy airframe cannot swallow a whole tip pair inside a percentage band.
 */
function outerDrainConfirmed(
  tanks: FuelTanks,
  prev: FuelTanks,
  totalFuelLb?: number,
): boolean {
  if (
    tanks.leftAux != null ||
    tanks.rightAux != null ||
    tanks.leftTip != null ||
    tanks.rightTip != null
  ) {
    return true;
  }
  if (typeof totalFuelLb !== 'number' || !Number.isFinite(totalFuelLb)) {
    return false;
  }
  const mains = tanks.left + tanks.right + tanks.center;
  const lostOuter = outerSum(prev) - outerSum(tanks);
  if (lostOuter < 25) return false;
  const tol = Math.max(
    20,
    Math.min(Math.max(40, totalFuelLb * 0.03), lostOuter * 0.5),
  );
  return Math.abs(totalFuelLb - mains) <= tol;
}

/**
 * Hold last non-zero tip/aux while mains stay loaded — stops the Learjet UI flash
 * (TL/TR → 0 lb, Sim 2508 = L+R only) when capacity still shows the tip cells.
 * Release as soon as the drain is confirmed (tips truly empty).
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
  if (outerDrainConfirmed(tanks, prev, totalFuelLb)) return tanks;
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
  const prevSticky = stickyRef.current;
  const tanks = stickyOuterTanks(incoming, prevSticky, props.liveFuelLb);
  if (
    outerSum(tanks) >= 25 ||
    tanks.left + tanks.right + tanks.center < 50 ||
    // Commit the empty read once the drain is confirmed, so it stops sticking.
    (prevSticky !== undefined &&
      outerDrainConfirmed(incoming, prevSticky, props.liveFuelLb))
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

/** Rail span for the CG schematic — must include negative %MAC (Accu-Sim). */
export function cgEnvelopeScale(
  minMac: number,
  maxMac: number,
  liveMac?: number,
): { scaleMin: number; scaleMax: number } {
  const pad = Math.max(4, (maxMac - minMac) * 0.15);
  const extremes = [minMac, maxMac];
  if (liveMac !== undefined && Number.isFinite(liveMac)) extremes.push(liveMac);
  return {
    scaleMin: Math.min(...extremes) - pad,
    scaleMax: Math.max(...extremes) + pad,
  };
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

  const { scaleMin, scaleMax } = cgEnvelopeScale(minMac, maxMac, liveMac);
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
  const maxKeys = maxMap
    ? Object.keys(maxMap)
        .map(Number)
        .filter((index) => Number.isFinite(index) && (maxMap[index] ?? 0) > 0)
    : [];
  const indexes = new Set<number>(
    maxKeys.length > 0
      ? maxKeys
      : Object.keys(stations).map(Number),
  );
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
