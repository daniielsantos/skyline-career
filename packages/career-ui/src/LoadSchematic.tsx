import type { CSSProperties } from 'react';
import { formatMassExact, KG_TO_LB, type WeightSystem } from './weight-units';

type FuelTanks = { left: number; right: number; center: number };

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

/** Compact wing tank schematic: L | (C) | R with live Sim values. */
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
  return (
    <div className="load-schematic load-schematic-fuel" aria-label="Fuel tanks">
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
