/**
 * Main-gear station from flight_model.cfg [CONTACT_POINTS].
 * Longitudinal feet are positive forward of the datum. The sim does not
 * publish this as a live SimVar — PLANE TOUCHDOWN LAT/LON is the datum.
 */

export type MainGearStationFt = {
  /** Feet, positive forward of the datum. */
  longitudinalFt: number;
  /** Feet, positive up from the datum. */
  verticalFt: number;
};

const WHEEL = 1;
const SKID = 3;
const SKI = 16;

function valueWithoutComment(raw: string): string {
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '"') quoted = !quoted;
    if (raw[i] === ';' && !quoted) return raw.slice(0, i).trim();
  }
  return raw.trim();
}

type ContactWheel = {
  cls: number;
  longitudinalFt: number;
  verticalFt: number;
  steerDeg: number;
};

function parseWheel(raw: string): ContactWheel | undefined {
  const fields = valueWithoutComment(raw)
    .split(',')
    .map((part) => part.trim().replace(/^"|"$/g, ''));
  let i = 0;
  if (fields.length < 4) return undefined;
  // MSFS 2024 rows may lead with a point name; the class is the first number.
  if (!Number.isFinite(Number(fields[0]))) i = 1;
  const cls = Number(fields[i]);
  if (cls !== WHEEL && cls !== SKID && cls !== SKI) return undefined;
  const longitudinalFt = Number(fields[i + 1]);
  const verticalFt = Number(fields[i + 3]);
  const steerRaw = Number(fields[i + 7]);
  if (!Number.isFinite(longitudinalFt) || !Number.isFinite(verticalFt)) {
    return undefined;
  }
  if (Math.abs(longitudinalFt) > 200 || Math.abs(verticalFt) > 40) {
    return undefined;
  }
  return {
    cls,
    longitudinalFt,
    verticalFt,
    steerDeg: Number.isFinite(steerRaw) ? steerRaw : 0,
  };
}

function aftCluster(wheels: ContactWheel[]): MainGearStationFt | undefined {
  if (wheels.length === 0) return undefined;
  const steerable = wheels.filter((w) => Math.abs(w.steerDeg) > 0.5);
  let mains = wheels.filter((w) => Math.abs(w.steerDeg) <= 0.5);
  if (mains.length === 0) {
    // No steer data: drop the single most-forward wheel (nose) when there
    // are at least three contacts.
    if (wheels.length < 3) return undefined;
    const nose = Math.max(...wheels.map((w) => w.longitudinalFt));
    mains = wheels.filter((w) => w.longitudinalFt < nose - 0.05);
    if (mains.length === 0 || steerable.length === wheels.length) return undefined;
  }
  const aftMost = Math.min(...mains.map((w) => w.longitudinalFt));
  // Aft axle of a bogey touches first. Left/right at the same station stay.
  const cluster = mains.filter((w) => w.longitudinalFt <= aftMost + 1.5);
  if (cluster.length === 0) return undefined;
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  return {
    longitudinalFt: mean(cluster.map((w) => w.longitudinalFt)),
    verticalFt: mean(cluster.map((w) => w.verticalFt)),
  };
}

/**
 * Station of the main-gear contact (not the nose, not a scrape point).
 * Undefined when the cfg has no usable wheel, skid, or ski row.
 */
export function parseMainGearStationFt(
  cfgText: string,
): MainGearStationFt | undefined {
  let section = '';
  const wheels: ContactWheel[] = [];
  for (const sourceLine of cfgText.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1]!.trim().toLowerCase();
      continue;
    }
    if (section !== 'contact_points') continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim().toLowerCase();
    if (!/^point\.\d+$/.test(key)) continue;
    const wheel = parseWheel(line.slice(equals + 1));
    if (wheel) wheels.push(wheel);
  }
  const tires = wheels.filter((w) => w.cls === WHEEL);
  if (tires.length > 0) return aftCluster(tires);
  const skis = wheels.filter((w) => w.cls === SKI);
  if (skis.length > 0) return aftCluster(skis);
  return aftCluster(wheels.filter((w) => w.cls === SKID));
}
