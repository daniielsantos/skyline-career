import type { CSSProperties } from 'react';
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

/** Compact wing tank schematic: (Tip) (Aux) L | (C) | R (Aux) (Tip) with live Sim values. */
export function FuelTankSchematic(props: {
  tanks?: FuelTanks;
  tankCapacity?: FuelTanks;
  weightSystem: WeightSystem;
}) {
  const tanks = props.tanks;
  if (!tanks) return null;
  const cap = props.tankCapacity;
  const showCenter =
    tanks.center > 0.5 || (cap !== undefined && cap.center > 0.5);
  const showLeftTip = sidePresent(tanks.leftTip, cap?.leftTip);
  const showRightTip = sidePresent(tanks.rightTip, cap?.rightTip);
  const showLeftAux = sidePresent(tanks.leftAux, cap?.leftAux);
  const showRightAux = sidePresent(tanks.rightAux, cap?.rightAux);
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
  const fromTop = (mac: number) =>
    `${((scaleMax - mac) / span) * 100}%`;
  const bandHeight = ((maxMac - minMac) / span) * 100;
  const liveKnown = liveMac !== undefined && Number.isFinite(liveMac);
  const outOfEnvelope =
    liveKnown && (liveMac < minMac || liveMac > maxMac);
  const tone =
    ok === false || outOfEnvelope ? 'warn' : ok === true ? 'ok' : 'neutral';

  return (
    <div
      className={`load-schematic load-schematic-cg load-schematic-cg-${tone}`}
      aria-label={
        liveKnown
          ? `CG ${liveMac.toFixed(1)}% MAC, envelope ${minMac} to ${maxMac}`
          : `CG envelope ${minMac} to ${maxMac}`
      }
    >
      <div className="cg-schematic-rail" aria-hidden="true">
        <span
          className="cg-schematic-band"
          style={{
            top: fromTop(maxMac),
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
        <span className="cg-schematic-aft">AFT {maxMac}</span>
        {liveKnown ? (
          <span
            className="cg-schematic-live"
            style={{ top: fromTop(liveMac) }}
          >
            {liveMac.toFixed(1)}
          </span>
        ) : null}
        <span className="cg-schematic-fwd">FWD {minMac}</span>
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
