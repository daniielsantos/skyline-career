/**
 * Parse hangar/selection UI stats from aircraft.cfg [FLTSIM.N] and
 * cruise_speed from flight_model.cfg [REFERENCE SPEEDS].
 *
 * These are catalog numbers (not live SimVars). ui_fuel_burn_rate is lbs/hour.
 * Values ≤ 0 (common placeholder: -1) are treated as missing.
 */
import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const LB_TO_KG = 0.45359237;

export type AircraftCfgUiStats = {
  aircraftCfgPath?: string;
  flightModelPath?: string;
  /** From ui_max_range (nm). */
  maxRangeNm?: number;
  /** From ui_certified_ceiling (ft). */
  certifiedCeilingFt?: number;
  /**
   * Raw ui_fuel_burn_rate as parsed (may be -1 / 0).
   * Prefer uiFuelBurnRateLbPerHour for the validated catalog value.
   */
  uiFuelBurnRateRaw?: number;
  /** From ui_fuel_burn_rate (lbs/hour) when > 0. */
  uiFuelBurnRateLbPerHour?: number;
  /** Converted burn (kg/hour). */
  cruiseFuelFlowKgPerHour?: number;
  /** From [REFERENCE SPEEDS] cruise_speed (KTAS). */
  cruiseSpeedKt?: number;
  /**
   * Derived kg/nm when both burn and cruise speed are known:
   * (kg/h) / (nm/h ≈ kt).
   */
  fuelBurnKgPerNm?: number;
  rangeSource?: 'cfg' | 'class';
  burnSource?: 'cfg' | 'class' | 'live';
};

function valueWithoutComment(raw: string): string {
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '"') quoted = !quoted;
    if (raw[i] === ';' && !quoted) return raw.slice(0, i).trim();
  }
  return raw.trim();
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = valueWithoutComment(raw).replace(/"/g, '').trim();
  const value = Number(cleaned.split(',')[0]?.trim());
  return Number.isFinite(value) ? value : undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Walk near flight_model.cfg looking for the best aircraft.cfg (modular-aware). */
export async function findAircraftCfgNearFlightModel(
  flightModelPath: string,
  maxUp = 10,
): Promise<string | undefined> {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const consider = async (path: string): Promise<void> => {
    const key = path.replace(/\\/g, '/').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (await pathExists(path)) candidates.push(path);
  };

  let dir = dirname(flightModelPath);
  for (let i = 0; i < maxUp; i++) {
    await consider(join(dir, 'aircraft.cfg'));
    await consider(join(dir, 'common', 'config', 'aircraft.cfg'));
    try {
      const entries = await readdir(dir);
      const lower = new Set(entries.map((e) => e.toLowerCase()));
      // Airplane root in modular layout: has common / presets / attachments.
      if (
        lower.has('common') ||
        lower.has('presets') ||
        lower.has('attachments')
      ) {
        await consider(join(dir, 'common', 'config', 'aircraft.cfg'));
        await consider(join(dir, 'aircraft.cfg'));
      }
    } catch {
      /* ignore */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  // Prefer the cfg that actually carries hangar UI stats (range/burn).
  let bestPath = candidates[0]!;
  let bestScore = -1;
  for (const path of candidates) {
    let score = 0;
    try {
      const text = await readFile(path, 'utf8');
      const ui = parseAircraftCfgUiText(text);
      if (ui.maxRangeNm != null && ui.maxRangeNm > 0) score += 10;
      if (isValidUiFuelBurnRateLbPerHour(ui.uiFuelBurnRateLbPerHour)) score += 5;
      else if (
        ui.uiFuelBurnRateRaw != null &&
        !isValidUiFuelBurnRateLbPerHour(ui.uiFuelBurnRateRaw)
      ) {
        // Still useful if it declares range with a placeholder burn.
        score += 1;
      }
      score += Math.min(4, Math.floor(text.length / 400));
    } catch {
      continue;
    }
    if (/[\\/]common[\\/]config[\\/]aircraft\.cfg$/i.test(path)) score += 3;
    if (score > bestScore) {
      bestScore = score;
      bestPath = path;
    }
  }
  return bestPath;
}

export function parseAircraftCfgUiText(text: string): Pick<
  AircraftCfgUiStats,
  'maxRangeNm' | 'certifiedCeilingFt' | 'uiFuelBurnRateLbPerHour' | 'uiFuelBurnRateRaw'
> {
  let maxRangeNm: number | undefined;
  let certifiedCeilingFt: number | undefined;
  let uiFuelBurnRateRaw: number | undefined;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('[')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1);
    if (key === 'ui_max_range') maxRangeNm = parseNumber(value);
    else if (key === 'ui_certified_ceiling') certifiedCeilingFt = parseNumber(value);
    else if (key === 'ui_fuel_burn_rate') uiFuelBurnRateRaw = parseNumber(value);
  }

  const uiFuelBurnRateLbPerHour = isValidUiFuelBurnRateLbPerHour(uiFuelBurnRateRaw)
    ? uiFuelBurnRateRaw
    : undefined;

  return {
    maxRangeNm,
    certifiedCeilingFt,
    uiFuelBurnRateRaw,
    uiFuelBurnRateLbPerHour,
  };
}

/** MSFS often ships ui_fuel_burn_rate=-1 as “unknown”. */
export function isValidUiFuelBurnRateLbPerHour(
  value: number | undefined,
): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function parseCruiseSpeedKtFromFlightModel(text: string): number | undefined {
  let inReference = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;
    if (trimmed.startsWith('[')) {
      inReference = /^\[REFERENCE\s+SPEEDS\]/i.test(trimmed);
      continue;
    }
    if (!inReference) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim().toLowerCase();
    if (key === 'cruise_speed') return parseNumber(trimmed.slice(eq + 1));
  }
  return undefined;
}

export function deriveFuelBurnKgPerNm(
  cruiseFuelFlowKgPerHour: number | undefined,
  cruiseSpeedKt: number | undefined,
): number | undefined {
  if (
    typeof cruiseFuelFlowKgPerHour !== 'number' ||
    !Number.isFinite(cruiseFuelFlowKgPerHour) ||
    cruiseFuelFlowKgPerHour <= 0
  ) {
    return undefined;
  }
  if (
    typeof cruiseSpeedKt !== 'number' ||
    !Number.isFinite(cruiseSpeedKt) ||
    cruiseSpeedKt <= 0
  ) {
    return undefined;
  }
  return Math.round((cruiseFuelFlowKgPerHour / cruiseSpeedKt) * 1000) / 1000;
}

/** kg/h from class kg/nm × cruise KTAS (nm/h ≈ kt). */
export function deriveCruiseFuelFlowKgPerHour(
  fuelBurnKgPerNm: number | undefined,
  cruiseSpeedKt: number | undefined,
): number | undefined {
  if (
    typeof fuelBurnKgPerNm !== 'number' ||
    !Number.isFinite(fuelBurnKgPerNm) ||
    fuelBurnKgPerNm <= 0
  ) {
    return undefined;
  }
  if (
    typeof cruiseSpeedKt !== 'number' ||
    !Number.isFinite(cruiseSpeedKt) ||
    cruiseSpeedKt <= 0
  ) {
    return undefined;
  }
  return Math.round(fuelBurnKgPerNm * cruiseSpeedKt * 10) / 10;
}

/**
 * Fill missing/invalid range & burn from CAREER class specs.
 * Re-applies class burn when burnSource is already `class` (user changed class).
 */
export function applyClassPerfFallback(
  perf: AircraftCfgUiStats,
  classSpecs: { maxRangeNm: number; fuelBurnKgPerNm: number },
): AircraftCfgUiStats {
  const next: AircraftCfgUiStats = { ...perf };

  if (next.maxRangeNm == null || !(next.maxRangeNm > 0)) {
    next.maxRangeNm = Math.round(classSpecs.maxRangeNm);
    next.rangeSource = 'class';
  } else {
    next.rangeSource ??= 'cfg';
  }

  const burnMissing =
    next.cruiseFuelFlowKgPerHour == null || !(next.cruiseFuelFlowKgPerHour > 0);

  if (next.burnSource === 'live' || next.burnSource === 'cfg') {
    next.fuelBurnKgPerNm = deriveFuelBurnKgPerNm(
      next.cruiseFuelFlowKgPerHour,
      next.cruiseSpeedKt,
    );
    return next;
  }

  if (burnMissing || next.burnSource === 'class') {
    next.fuelBurnKgPerNm = classSpecs.fuelBurnKgPerNm;
    next.burnSource = 'class';
    const fromClass = deriveCruiseFuelFlowKgPerHour(
      classSpecs.fuelBurnKgPerNm,
      next.cruiseSpeedKt,
    );
    if (fromClass != null) {
      next.cruiseFuelFlowKgPerHour = fromClass;
      next.uiFuelBurnRateLbPerHour =
        Math.round((fromClass / LB_TO_KG) * 10) / 10;
    }
  }

  return next;
}

/** Console rows for homologate (always include range/burn lines). */
export function catalogPerfPrintRows(
  perf: AircraftCfgUiStats,
): Array<[string, string | undefined]> {
  const rangeSrc = perf.rangeSource ? ` · ${perf.rangeSource}` : '';
  const burnSrc = perf.burnSource ? ` · ${perf.burnSource}` : '';
  const rawNote =
    perf.uiFuelBurnRateRaw != null &&
    !isValidUiFuelBurnRateLbPerHour(perf.uiFuelBurnRateRaw)
      ? ` (cfg ui_fuel_burn_rate=${perf.uiFuelBurnRateRaw} ignored)`
      : '';

  return [
    ['aircraft.cfg', perf.aircraftCfgPath],
    [
      'range',
      perf.maxRangeNm != null ? `${perf.maxRangeNm} nm${rangeSrc}` : '—',
    ],
    [
      'cruise burn',
      perf.cruiseFuelFlowKgPerHour != null
        ? `${perf.cruiseFuelFlowKgPerHour} kg/h${
            perf.uiFuelBurnRateLbPerHour != null && perf.burnSource === 'cfg'
              ? ` (${perf.uiFuelBurnRateLbPerHour} lb/h)`
              : ''
          }${burnSrc}${rawNote}`
        : `—${rawNote}${burnSrc}`,
    ],
    [
      'burn / nm',
      perf.fuelBurnKgPerNm != null
        ? `${perf.fuelBurnKgPerNm} kg/nm${burnSrc}`
        : '—',
    ],
    [
      'cruise speed',
      perf.cruiseSpeedKt != null ? `${perf.cruiseSpeedKt} KTAS` : '—',
    ],
  ];
}

export async function loadAircraftPerfFromCfg(opts: {
  flightModelPath?: string;
  aircraftCfgPath?: string;
}): Promise<AircraftCfgUiStats> {
  const out: AircraftCfgUiStats = {
    flightModelPath: opts.flightModelPath,
    aircraftCfgPath: opts.aircraftCfgPath,
  };

  let aircraftCfg = opts.aircraftCfgPath;
  if (!aircraftCfg && opts.flightModelPath) {
    aircraftCfg = await findAircraftCfgNearFlightModel(opts.flightModelPath);
  }
  if (aircraftCfg) {
    out.aircraftCfgPath = aircraftCfg;
    const ui = parseAircraftCfgUiText(await readFile(aircraftCfg, 'utf8'));
    if (ui.maxRangeNm != null && ui.maxRangeNm > 0) {
      out.maxRangeNm = ui.maxRangeNm;
      out.rangeSource = 'cfg';
    }
    out.certifiedCeilingFt = ui.certifiedCeilingFt;
    out.uiFuelBurnRateRaw = ui.uiFuelBurnRateRaw;
    if (ui.uiFuelBurnRateLbPerHour != null) {
      out.uiFuelBurnRateLbPerHour = ui.uiFuelBurnRateLbPerHour;
      out.cruiseFuelFlowKgPerHour =
        Math.round(ui.uiFuelBurnRateLbPerHour * LB_TO_KG * 10) / 10;
      out.burnSource = 'cfg';
    }
  }

  if (opts.flightModelPath) {
    try {
      const cruise = parseCruiseSpeedKtFromFlightModel(
        await readFile(opts.flightModelPath, 'utf8'),
      );
      if (cruise != null) out.cruiseSpeedKt = cruise;
    } catch {
      /* ignore */
    }
    // Preset stubs often omit REFERENCE SPEEDS — try sibling common/config.
    if (out.cruiseSpeedKt == null) {
      try {
        const aircraftCfg = out.aircraftCfgPath;
        if (aircraftCfg) {
          const commonFm = join(dirname(aircraftCfg), 'flight_model.cfg');
          if (commonFm !== opts.flightModelPath && (await pathExists(commonFm))) {
            const cruise = parseCruiseSpeedKtFromFlightModel(
              await readFile(commonFm, 'utf8'),
            );
            if (cruise != null) out.cruiseSpeedKt = cruise;
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  out.fuelBurnKgPerNm = deriveFuelBurnKgPerNm(
    out.cruiseFuelFlowKgPerHour,
    out.cruiseSpeedKt,
  );
  return out;
}
