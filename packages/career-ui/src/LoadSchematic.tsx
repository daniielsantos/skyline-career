import { formatMassExact, KG_TO_LB, type WeightSystem } from './weight-units';

type FuelTanks = { left: number; right: number; center: number };

function massFromLb(lb: number | undefined, weightSystem: WeightSystem): string {
  if (lb === undefined || !Number.isFinite(lb)) return '—';
  return formatMassExact(lb / KG_TO_LB, weightSystem);
}

/** Compact wing tank schematic: L | (C) | R with live Sim values. */
export function FuelTankSchematic(props: {
  tanks?: FuelTanks;
  weightSystem: WeightSystem;
}) {
  const tanks = props.tanks;
  if (!tanks) return null;
  const showCenter = tanks.center > 0.5;
  return (
    <div className="load-schematic load-schematic-fuel" aria-label="Fuel tanks">
      <div className="load-schematic-wing">
        <span className="load-schematic-label">L</span>
        <strong>{massFromLb(tanks.left, props.weightSystem)}</strong>
      </div>
      {showCenter ? (
        <div className="load-schematic-center">
          <span className="load-schematic-label">C</span>
          <strong>{massFromLb(tanks.center, props.weightSystem)}</strong>
        </div>
      ) : (
        <div className="load-schematic-fuselage" aria-hidden="true" />
      )}
      <div className="load-schematic-wing">
        <span className="load-schematic-label">R</span>
        <strong>{massFromLb(tanks.right, props.weightSystem)}</strong>
      </div>
    </div>
  );
}

/** Compact station row with live Sim payload per station. */
export function PayloadStationSchematic(props: {
  stations?: Record<number, number>;
  weightSystem: WeightSystem;
}) {
  const stations = props.stations;
  if (!stations) return null;
  const entries = Object.entries(stations)
    .map(([k, v]) => ({ index: Number(k), lb: v }))
    .filter((e) => Number.isFinite(e.index) && Number.isFinite(e.lb))
    .sort((a, b) => a.index - b.index);
  if (entries.length === 0) return null;

  const showZeros = entries.length <= 8;
  const visible = showZeros ? entries : entries.filter((e) => e.lb > 0.5);
  if (visible.length === 0) return null;

  return (
    <div
      className="load-schematic load-schematic-stations"
      aria-label="Payload stations"
    >
      {visible.map((e) => (
        <div key={e.index} className="load-schematic-station">
          <span className="load-schematic-label">S{e.index}</span>
          <strong>{massFromLb(e.lb, props.weightSystem)}</strong>
        </div>
      ))}
    </div>
  );
}
