/** UI preference for mass display and SimBrief dispatch units. */
export type WeightSystem = 'metric' | 'imperial';

export const WEIGHT_SYSTEM_KEY = 'skyline.weightSystem';
export const DEV_MODE_KEY = 'skyline.devMode';
export const KG_TO_LB = 2.2046226218;

export function loadWeightSystem(): WeightSystem {
  try {
    const raw = localStorage.getItem(WEIGHT_SYSTEM_KEY);
    if (raw === 'imperial' || raw === 'metric') return raw;
  } catch {
    /* ignore */
  }
  return 'metric';
}

export function saveWeightSystem(system: WeightSystem): void {
  try {
    localStorage.setItem(WEIGHT_SYSTEM_KEY, system);
  } catch {
    /* ignore */
  }
}

/** Cheat / debug controls (time skip, wallet credit, manual settle, etc.). */
export function loadDevMode(): boolean {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveDevMode(enabled: boolean): void {
  try {
    localStorage.setItem(DEV_MODE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Convert stored kg → display mass for the selected system. */
export function kgToDisplay(kg: number, system: WeightSystem): number {
  return system === 'imperial' ? kg * KG_TO_LB : kg;
}

/** Convert a display mass back to kg. */
export function displayToKg(value: number, system: WeightSystem): number {
  return system === 'imperial' ? value / KG_TO_LB : value;
}

/** Bulk cargo / fuel label: metric tonnes or imperial thousands of pounds. */
export function formatMass(kg: number, system: WeightSystem = 'metric'): string {
  if (!Number.isFinite(kg)) return system === 'imperial' ? '0.0 klb' : '0.0 t';
  if (system === 'imperial') {
    return `${(kgToDisplay(kg, system) / 1000).toFixed(1)} klb`;
  }
  return `${(kg / 1000).toFixed(1)} t`;
}

/** Freights Load filter steps — labels match the board mass unit. */
export const LOAD_FILTER_STEPS = [1, 2, 5, 10, 20] as const;

export function loadFilterOptions(
  system: WeightSystem,
): Array<{ kg: number; label: string }> {
  return LOAD_FILTER_STEPS.map((n) => {
    if (system === 'imperial') {
      // n kilopounds → kg (same unit the Load column shows).
      const kg = Math.round((n * 1000) / KG_TO_LB);
      return { kg, label: `${n} klb` };
    }
    return { kg: n * 1000, label: `${n} t` };
  });
}

/** Exact mass for inputs / toasts: kg or lb. */
export function formatMassExact(
  kg: number,
  system: WeightSystem = 'metric',
): string {
  const value = kgToDisplay(kg, system);
  const unit = system === 'imperial' ? 'lb' : 'kg';
  return `${Math.round(value).toLocaleString('en-US')} ${unit}`;
}

export function massUnitLabel(system: WeightSystem): 'kg' | 'lb' {
  return system === 'imperial' ? 'lb' : 'kg';
}

export function massUnitLong(system: WeightSystem): string {
  return system === 'imperial' ? 'pounds' : 'kilograms';
}

/** Cruise fuel flow: stored kg/h → kg/h or lb/h. */
export function formatFuelFlow(
  kgPerHour: number,
  system: WeightSystem = 'metric',
): string {
  if (!Number.isFinite(kgPerHour) || kgPerHour <= 0) return '—';
  if (system === 'imperial') {
    const lbh = kgPerHour * KG_TO_LB;
    return `${lbh.toLocaleString(undefined, { maximumFractionDigits: 0 })} lb/h`;
  }
  return `${kgPerHour.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })} kg/h`;
}

/** Burn per nm: stored kg/nm → kg/nm or lb/nm. */
export function formatFuelBurnPerNm(
  kgPerNm: number,
  system: WeightSystem = 'metric',
): string {
  if (!Number.isFinite(kgPerNm) || kgPerNm <= 0) return '—';
  if (system === 'imperial') {
    const lbnm = kgPerNm * KG_TO_LB;
    return `${lbnm.toLocaleString(undefined, { maximumFractionDigits: 2 })} lb/nm`;
  }
  return `${kgPerNm} kg/nm`;
}

/** Convert weight values embedded in backend diagnostics for presentation. */
export function formatWeightText(
  text: string,
  system: WeightSystem,
): string {
  if (system === 'metric') return text;
  return text
    .replace(/(\d+(?:\.\d+)?)\s*kg\b/gi, (_match, raw: string) => {
      const kg = Number(raw);
      return Number.isFinite(kg)
        ? `${Math.round(kg * KG_TO_LB).toLocaleString('en-US')} lb`
        : _match;
    })
    .replace(/(\d+(?:\.\d+)?)\s*t\b/gi, (_match, raw: string) => {
      const tonnes = Number(raw);
      return Number.isFinite(tonnes)
        ? `${(tonnes * KG_TO_LB).toFixed(1)} klb`
        : _match;
    });
}

/** SimBrief Dispatch Redirect `units=` query value. */
export function simbriefUnits(system: WeightSystem): 'KGS' | 'LBS' {
  return system === 'imperial' ? 'LBS' : 'KGS';
}

/**
 * Cargo amount for SimBrief `cargo=` (thousands of the selected unit).
 * Domain storage is always kg.
 */
export function cargoKgToSimBriefThousands(
  cargoKg: number,
  system: WeightSystem,
): number {
  return kgToDisplay(cargoKg, system) / 1000;
}
