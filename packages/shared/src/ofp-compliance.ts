import type {
  ComplianceBaseline,
  ComplianceFinding,
  CompliancePhase,
  ComplianceSnapshot,
  ComplianceVerdict,
  LiveFuelState,
  LivePayloadState,
  LiveWeightState,
  OfpExpectation,
  OfpFuelPlan,
  OfpLiveSources,
  OfpLoadSheet,
  OfpPayloadPlan,
  OfpStationRoleMap,
  OfpTolerances,
  OfpWeightUnit,
  LiveFuelSource,
  LivePayloadSourcePref,
  LiveWeightSourcePref,
} from './types/ofp-compliance.js';

export type {
  OfpLiveSources,
  LiveFuelSource,
  LivePayloadSourcePref,
  LiveWeightSourcePref,
};

export const KG_TO_LB = 2.2046226218;
/** Jet-A / Jet-A1 nominal density (lb/US gal). */
export const DEFAULT_JET_A_LB_PER_GAL = 6.7;
/** Avgas 100LL nominal density (lb/US gal) — light piston / GA. */
export const DEFAULT_AVGAS_LB_PER_GAL = 6.0;

/** Full probe cascade when pack does not declare liveSources (new aircraft). */
export const DISCOVERY_LIVE_SOURCES: Required<OfpLiveSources> = {
  fuel: ['pmdg-ng3', 'classic', 'mass-balance', 'tfdi-efb'],
  weights: ['pmdg-efb-lvars', 'tfdi-efb-lvars', 'classic-weights'],
  payload: ['pmdg-efb', 'tfdi-efb', 'classic-stations'],
};

/**
 * Resolve preference lists for live reads.
 * Declared pack → only those sources (missing keys default to classic-safe).
 * No liveSources → discovery cascade.
 */
export function resolveLiveSourcePrefs(
  liveSources: OfpLiveSources | undefined,
): Required<OfpLiveSources> {
  if (!liveSources) {
    return {
      fuel: [...DISCOVERY_LIVE_SOURCES.fuel],
      weights: [...DISCOVERY_LIVE_SOURCES.weights],
      payload: [...DISCOVERY_LIVE_SOURCES.payload],
    };
  }
  return {
    fuel: liveSources.fuel?.length ? [...liveSources.fuel] : ['classic', 'mass-balance'],
    weights: liveSources.weights?.length ? [...liveSources.weights] : ['classic-weights'],
    payload: liveSources.payload?.length ? [...liveSources.payload] : ['classic-stations'],
  };
}

export const DEFAULT_OFP_TOLERANCES: OfpTolerances = {
  fuelAbsLb: 200,
  fuelPct: 0.02,
  payloadAbsLb: 200,
  weightAbsLb: 300,
  passengerCountAbs: 2,
  maxFuelIncreaseLb: 0,
};

export function toLb(value: number, unit: OfpWeightUnit): number {
  return unit === 'kg' ? value * KG_TO_LB : value;
}

export function fuelToleranceLb(plannedLb: number, tolerances: OfpTolerances): number {
  return Math.max(tolerances.fuelAbsLb, Math.abs(plannedLb) * tolerances.fuelPct);
}

function weightUnit(u: OfpWeightUnit | undefined): OfpWeightUnit {
  return u === 'kg' ? 'kg' : 'lb';
}

function normalizeLoadSheet(sheet: OfpLoadSheet | undefined): OfpLoadSheet | undefined {
  if (!sheet) {
    return undefined;
  }
  return {
    unit: weightUnit(sheet.unit),
    blockFuel: sheet.blockFuel,
    enrouteBurn: sheet.enrouteBurn,
    passengerCount: sheet.passengerCount,
    baggage: sheet.baggage,
    payload: sheet.payload,
    emptyWeight: sheet.emptyWeight,
    zfw: sheet.zfw,
    tow: sheet.tow,
    lw: sheet.lw,
    maxZfw: sheet.maxZfw,
    maxTow: sheet.maxTow,
    maxLw: sheet.maxLw,
  };
}

function normalizePayload(plan: OfpPayloadPlan | undefined): OfpPayloadPlan | undefined {
  if (!plan) {
    return undefined;
  }
  const roles: OfpStationRoleMap | undefined = plan.stationRoles
    ? {
        passengerStations: plan.stationRoles.passengerStations,
        baggageStations: plan.stationRoles.baggageStations,
        crewStations: plan.stationRoles.crewStations,
        serviceStations: plan.stationRoles.serviceStations,
        averagePassengerWeight: plan.stationRoles.averagePassengerWeight,
      }
    : undefined;
  return {
    unit: weightUnit(plan.unit),
    stations: plan.stations,
    total: plan.total,
    stationRoles: roles,
  };
}

/**
 * Ensure fuel.total is populated from loadSheet.blockFuel when tanks omit total.
 */
export function normalizeOfpExpectation(
  raw: Omit<Partial<OfpExpectation>, 'tolerances' | 'fuel'> & {
    fuel?: OfpFuelPlan;
    loadSheet?: OfpLoadSheet;
    tolerances?: Partial<OfpTolerances>;
  },
): OfpExpectation {
  const loadSheet = normalizeLoadSheet(raw.loadSheet);
  const fuelUnit = weightUnit(raw.fuel?.unit ?? loadSheet?.unit);
  const fuel: OfpFuelPlan = {
    unit: fuelUnit,
    left: raw.fuel?.left,
    right: raw.fuel?.right,
    center: raw.fuel?.center,
    total: raw.fuel?.total,
  };

  if (fuel.total === undefined && loadSheet?.blockFuel !== undefined) {
    // blockFuel is in loadSheet.unit; convert into fuel.unit if needed
    if (loadSheet.unit === fuel.unit) {
      fuel.total = loadSheet.blockFuel;
    } else {
      fuel.total = fuel.unit === 'lb' ? toLb(loadSheet.blockFuel, 'kg') : loadSheet.blockFuel / KG_TO_LB;
    }
  }

  const payload = normalizePayload(raw.payload);
  // Fill averagePassengerWeight from load sheet when missing.
  if (payload?.stationRoles && payload.stationRoles.averagePassengerWeight === undefined) {
    const sheet = loadSheet;
    if (
      sheet?.payload !== undefined &&
      sheet.baggage !== undefined &&
      sheet.passengerCount !== undefined &&
      sheet.passengerCount > 0
    ) {
      const paxMass = sheet.payload - sheet.baggage;
      if (paxMass > 0) {
        const avg = paxMass / sheet.passengerCount;
        // Convert into payload.unit if load sheet unit differs.
        payload.stationRoles.averagePassengerWeight =
          sheet.unit === payload.unit ? avg : payload.unit === 'lb' ? toLb(avg, 'kg') : avg / KG_TO_LB;
      }
    }
  }
  if (loadSheet?.payload !== undefined) {
    if (!payload) {
      return finalizeExpectation(raw, fuel, loadSheet, {
        unit: loadSheet.unit,
        total: loadSheet.payload,
      });
    }
    if (payload.total === undefined) {
      if (loadSheet.unit === payload.unit) {
        payload.total = loadSheet.payload;
      } else {
        payload.total =
          payload.unit === 'lb' ? toLb(loadSheet.payload, 'kg') : loadSheet.payload / KG_TO_LB;
      }
    }
  }

  return finalizeExpectation(raw, fuel, loadSheet, payload);
}

function finalizeExpectation(
  raw: Omit<Partial<OfpExpectation>, 'tolerances' | 'fuel'> & {
    fuel?: OfpFuelPlan;
    loadSheet?: OfpLoadSheet;
    tolerances?: Partial<OfpTolerances>;
  },
  fuel: OfpFuelPlan,
  loadSheet: OfpLoadSheet | undefined,
  payload: OfpPayloadPlan | undefined,
): OfpExpectation {
  const hasFuel =
    fuel.left !== undefined ||
    fuel.right !== undefined ||
    fuel.center !== undefined ||
    fuel.total !== undefined;
  if (!hasFuel) {
    throw new Error('OFP requires fuel (fuel.* or loadSheet.blockFuel)');
  }

  return {
    source: raw.source === 'simbrief' ? 'simbrief' : 'manual',
    ofpId: raw.ofpId,
    icao: raw.icao,
    originIcao: raw.originIcao?.trim().toUpperCase() || undefined,
    destIcao: raw.destIcao?.trim().toUpperCase() || undefined,
    fuel,
    loadSheet,
    payload,
    liveSources: raw.liveSources,
    tolerances: {
      ...DEFAULT_OFP_TOLERANCES,
      ...(raw.tolerances ?? {}),
    },
  };
}

export function ofpFuelToLb(fuel: OfpFuelPlan): {
  left?: number;
  right?: number;
  center?: number;
  total?: number;
} {
  const u = fuel.unit;
  return {
    left: fuel.left !== undefined ? toLb(fuel.left, u) : undefined,
    right: fuel.right !== undefined ? toLb(fuel.right, u) : undefined,
    center: fuel.center !== undefined ? toLb(fuel.center, u) : undefined,
    total: fuel.total !== undefined ? toLb(fuel.total, u) : undefined,
  };
}

export function sumStationWeights(
  stations: Record<number, number>,
  indices: number[] | undefined,
): number | undefined {
  if (!indices || indices.length === 0) {
    return undefined;
  }
  let sum = 0;
  for (const i of indices) {
    sum += stations[i] ?? 0;
  }
  return sum;
}

export function enrichPayloadWithRoles(
  payload: LivePayloadState,
  roles: OfpStationRoleMap | undefined,
  roleWeightUnit: OfpWeightUnit = 'lb',
): LivePayloadState {
  if (!roles) {
    return payload;
  }
  const baggageLb = sumStationWeights(payload.stations, roles.baggageStations);
  const passengerWeightLb = sumStationWeights(payload.stations, roles.passengerStations);
  let estimatedPassengerCount: number | undefined;
  if (
    passengerWeightLb !== undefined &&
    roles.averagePassengerWeight !== undefined &&
    roles.averagePassengerWeight > 0
  ) {
    const avgLb = toLb(roles.averagePassengerWeight, roleWeightUnit);
    estimatedPassengerCount = Math.round(passengerWeightLb / avgLb);
  }
  /** SimBrief-style payload = pax + bags (excludes crew/galley). */
  const ofpPayloadLb =
    passengerWeightLb !== undefined || baggageLb !== undefined
      ? (passengerWeightLb ?? 0) + (baggageLb ?? 0)
      : undefined;
  return {
    ...payload,
    baggageLb,
    passengerWeightLb,
    estimatedPassengerCount,
    ofpPayloadLb,
  };
}

/**
 * Derive cargo from PMDG EFB ZFW LVar:
 * ZFW ≈ empty + pax + crew + service + cargo
 * (classic PAYLOAD STATION cargo is inflated vs EFB after SimBrief load).
 */
export function applyPmdgEfbPayloadCorrection(
  payload: LivePayloadState,
  weights: LiveWeightState,
  roles: OfpStationRoleMap | undefined,
): { payload: LivePayloadState; weights: LiveWeightState } {
  const zfw = weights.zfwLb;
  const empty = weights.emptyLb;
  if (zfw === undefined || empty === undefined || weights.source !== 'pmdg-efb-lvars') {
    return { payload, weights };
  }

  const paxWt = payload.passengerWeightLb ?? 0;
  const crew = sumStationWeights(payload.stations, roles?.crewStations) ?? 0;
  const service = sumStationWeights(payload.stations, roles?.serviceStations) ?? 0;
  const baggageLb = Math.max(0, zfw - empty - paxWt - crew - service);
  const ofpPayloadLb = paxWt + baggageLb;

  return {
    payload: {
      ...payload,
      source: 'pmdg-efb',
      baggageLb,
      ofpPayloadLb,
    },
    weights: {
      ...weights,
      payloadLb: ofpPayloadLb,
    },
  };
}

/**
 * Prefer loadSheet-derived average pax weight: (payload − baggage) / passengerCount.
 */
export function resolveAveragePassengerWeight(
  ofp: OfpExpectation,
): { weight: number; unit: OfpWeightUnit } | undefined {
  const roles = ofp.payload?.stationRoles;
  if (roles?.averagePassengerWeight !== undefined && roles.averagePassengerWeight > 0) {
    return { weight: roles.averagePassengerWeight, unit: ofp.payload?.unit ?? ofp.loadSheet?.unit ?? 'lb' };
  }
  const sheet = ofp.loadSheet;
  if (
    sheet?.payload !== undefined &&
    sheet.baggage !== undefined &&
    sheet.passengerCount !== undefined &&
    sheet.passengerCount > 0
  ) {
    const paxWeight = sheet.payload - sheet.baggage;
    if (paxWeight > 0) {
      return { weight: paxWeight / sheet.passengerCount, unit: sheet.unit };
    }
  }
  return undefined;
}

export interface SimGatingHints {
  onGround: boolean;
  enginesRunning: boolean;
}

export function deriveCompliancePhase(
  hints: SimGatingHints,
  opts: { locked?: boolean } = {},
): CompliancePhase {
  if (!hints.onGround || hints.enginesRunning) {
    return 'airborne';
  }
  if (opts.locked) {
    return 'locked';
  }
  return 'preflight';
}

export interface CompareOfpInput {
  ofp: OfpExpectation;
  liveFuel: LiveFuelState;
  livePayload?: LivePayloadState;
  liveWeights?: LiveWeightState;
  phase: CompliancePhase;
  baseline?: ComplianceBaseline;
  previousFuel?: LiveFuelState;
  previousAtMs?: number;
  nowMs?: number;
  at?: string;
}

function worstVerdict(findings: ComplianceFinding[]): ComplianceVerdict {
  if (findings.some((f) => f.severity === 'fail')) {
    return 'fail';
  }
  if (findings.some((f) => f.severity === 'warn')) {
    return 'warn';
  }
  return 'pass';
}

function pushWeightDelta(
  findings: ComplianceFinding[],
  code: string,
  label: string,
  expected: number,
  actual: number,
  tol: number,
  severityOutside: ComplianceFinding['severity'] = 'fail',
): void {
  const delta = actual - expected;
  if (Math.abs(delta) <= tol) {
    return;
  }
  findings.push({
    code,
    severity: severityOutside,
    message: `${label}: live ${actual.toFixed(1)} lb vs planned ${expected.toFixed(1)} lb (Δ=${delta.toFixed(1)}, tol±${tol.toFixed(1)})`,
    expected,
    actual,
    delta,
  });
}

function compareFuelToOfp(
  ofp: OfpExpectation,
  live: LiveFuelState,
  findings: ComplianceFinding[],
): void {
  const planned = ofpFuelToLb(ofp.fuel);
  const t = ofp.tolerances;

  if (planned.left !== undefined) {
    pushWeightDelta(
      findings,
      'FUEL_LEFT',
      'Fuel left',
      planned.left,
      live.left,
      fuelToleranceLb(planned.left, t),
    );
  }
  if (planned.right !== undefined) {
    pushWeightDelta(
      findings,
      'FUEL_RIGHT',
      'Fuel right',
      planned.right,
      live.right,
      fuelToleranceLb(planned.right, t),
    );
  }
  if (planned.center !== undefined) {
    pushWeightDelta(
      findings,
      'FUEL_CENTER',
      'Fuel center',
      planned.center,
      live.center,
      fuelToleranceLb(planned.center, t),
    );
  }
  if (planned.total !== undefined) {
    pushWeightDelta(
      findings,
      'FUEL_TOTAL',
      'Block fuel / fuel total',
      planned.total,
      live.total,
      fuelToleranceLb(planned.total, t),
    );
  }
}

function comparePayloadToOfp(
  ofp: OfpExpectation,
  live: LivePayloadState | undefined,
  findings: ComplianceFinding[],
): void {
  const plan = ofp.payload;
  const sheet = ofp.loadSheet;
  const tol = ofp.tolerances.payloadAbsLb;

  // Freighter OFPs often put cargo in loadSheet.baggage without payload.total.
  // Still treat that as the planned payload total so empty aircraft fail closed.
  const freighterCargoLb =
    sheet?.baggage !== undefined && (sheet.passengerCount ?? 0) <= 0
      ? toLb(sheet.baggage, sheet.unit)
      : undefined;
  const plannedPayloadTotalLb =
    plan?.total !== undefined
      ? toLb(plan.total, plan.unit)
      : sheet?.payload !== undefined
        ? toLb(sheet.payload, sheet.unit)
        : freighterCargoLb;

  if (plannedPayloadTotalLb === undefined && !plan?.stations && !sheet?.baggage && sheet?.passengerCount === undefined) {
    return;
  }

  if (!live) {
    findings.push({
      code: 'PAYLOAD_UNAVAILABLE',
      severity: 'warn',
      message: 'OFP includes payload/load sheet but live payload could not be read',
    });
    return;
  }

  if (plannedPayloadTotalLb !== undefined) {
    // Prefer SimBrief-style sum (pax + bags) when station roles are mapped —
    // full station total includes crew/galley and false-fails vs OFP Payload.
    const livePayloadForOfp = live.ofpPayloadLb ?? live.total;
    const label =
      live.ofpPayloadLb !== undefined
        ? 'Payload (pax+bags)'
        : 'Payload total (all stations)';
    pushWeightDelta(
      findings,
      'PAYLOAD_TOTAL',
      label,
      plannedPayloadTotalLb,
      livePayloadForOfp,
      tol,
    );
  }

  if (plan?.stations) {
    for (const [key, expectedRaw] of Object.entries(plan.stations)) {
      const index = Number(key);
      const expected = toLb(expectedRaw, plan.unit);
      const actual = live.stations[index] ?? 0;
      pushWeightDelta(
        findings,
        `PAYLOAD_STATION_${index}`,
        `Payload station ${index}`,
        expected,
        actual,
        tol,
      );
    }
  }

  // Baggage
  if (sheet?.baggage !== undefined) {
    const expected = toLb(sheet.baggage, sheet.unit);
    if (live.baggageLb === undefined) {
      // Freighter: fall back to ofpPayload/total so empty aircraft still fail.
      if ((sheet.passengerCount ?? 0) <= 0) {
        const liveCargo = live.ofpPayloadLb ?? live.total;
        pushWeightDelta(findings, 'BAGGAGE', 'Baggage (cargo)', expected, liveCargo, tol);
      } else {
        findings.push({
          code: 'BAGGAGE_UNMAPPED',
          severity: 'warn',
          message:
            'OFP has Baggage but payload.stationRoles.baggageStations is not set — cannot verify live',
          expected,
        });
      }
    } else {
      pushWeightDelta(findings, 'BAGGAGE', 'Baggage', expected, live.baggageLb, tol);
    }
  }

  // Passenger count
  if (sheet?.passengerCount !== undefined) {
    if (sheet.passengerCount === 0) {
      // Freighter / cargo OFP — no passengerStations map required.
      const livePax = live.estimatedPassengerCount ?? 0;
      const paxTol = ofp.tolerances.passengerCountAbs;
      if (livePax > paxTol) {
        findings.push({
          code: 'PAX_COUNT',
          severity: 'fail',
          message: `Passenger count: live ~${livePax} vs planned 0 (Δ=${livePax}, tol±${paxTol})`,
          expected: 0,
          actual: livePax,
          delta: livePax,
        });
      }
    } else if (live.estimatedPassengerCount === undefined) {
      findings.push({
        code: 'PAX_COUNT_UNMAPPED',
        severity: 'warn',
        message:
          'OFP has Passenger Count but stationRoles.passengerStations + averagePassengerWeight are required to estimate live count',
        expected: sheet.passengerCount,
      });
    } else {
      const delta = live.estimatedPassengerCount - sheet.passengerCount;
      const paxTol = ofp.tolerances.passengerCountAbs;
      if (Math.abs(delta) > paxTol) {
        findings.push({
          code: 'PAX_COUNT',
          severity: 'fail',
          message: `Passenger count: live ~${live.estimatedPassengerCount} vs planned ${sheet.passengerCount} (Δ=${delta}, tol±${paxTol})`,
          expected: sheet.passengerCount,
          actual: live.estimatedPassengerCount,
          delta,
        });
      }
    }
  }
}

function compareLoadSheetWeights(
  ofp: OfpExpectation,
  liveWeights: LiveWeightState | undefined,
  liveFuel: LiveFuelState,
  livePayload: LivePayloadState | undefined,
  findings: ComplianceFinding[],
): void {
  const sheet = ofp.loadSheet;
  if (!sheet) {
    return;
  }
  const tol = ofp.tolerances.weightAbsLb;
  const u = sheet.unit;

  if (sheet.emptyWeight !== undefined) {
    if (liveWeights?.emptyLb === undefined) {
      findings.push({
        code: 'EMPTY_WEIGHT_UNAVAILABLE',
        severity: 'warn',
        message: 'OFP has Empty Weight but EMPTY WEIGHT SimVar was unavailable',
        expected: toLb(sheet.emptyWeight, u),
      });
    } else {
      // SimBrief OEW and MSFS empty_weight often differ by design — advisory only.
      pushWeightDelta(
        findings,
        'EMPTY_WEIGHT',
        'Empty weight (OFP OEW vs MSFS; often differs)',
        toLb(sheet.emptyWeight, u),
        liveWeights.emptyLb,
        tol,
        'warn',
      );
    }
  }

  const efbWeights =
    liveWeights?.source === 'pmdg-efb-lvars' || liveWeights?.source === 'tfdi-efb-lvars';

  if (sheet.tow !== undefined || (sheet.zfw !== undefined && (sheet.blockFuel !== undefined || ofp.fuel.total !== undefined))) {
    // Prefer ramp = est_zfw + block. SimBrief est_tow is often post-taxi.
    const blockLb =
      sheet.blockFuel !== undefined
        ? toLb(sheet.blockFuel, u)
        : ofp.fuel.total !== undefined
          ? toLb(ofp.fuel.total, ofp.fuel.unit)
          : undefined;
    const rampTowLb =
      sheet.zfw !== undefined && blockLb !== undefined
        ? toLb(sheet.zfw, u) + blockLb
        : sheet.tow !== undefined
          ? toLb(sheet.tow, u)
          : undefined;
    if (liveWeights?.grossLb === undefined) {
      findings.push({
        code: 'TOW_UNAVAILABLE',
        severity: 'warn',
        message: efbWeights
          ? 'OFP has TOW/ZFW but L:GW_Lvar was unavailable'
          : 'OFP has Estimated TOW but TOTAL WEIGHT was unavailable',
        expected: rampTowLb,
      });
    } else if (rampTowLb !== undefined) {
      // Absolute ramp/TOW mixes SimBrief OEW into ZFW+block vs MSFS gross — hard-fail only with EFB LVars.
      pushWeightDelta(
        findings,
        'TOW',
        sheet.zfw !== undefined && blockLb !== undefined
          ? 'Ramp weight (gross vs ZFW+block)'
          : 'Takeoff weight (gross)',
        rampTowLb,
        liveWeights.grossLb,
        tol,
        efbWeights ? 'fail' : 'warn',
      );
    }
  }

  if (sheet.zfw !== undefined) {
    // PMDG EFB L:ZFW_Lvar matches SimBrief est_zfw after Load from Simbrief.
    // Classic path: empty+pax+bags is advisory (OEW basis differs).
    const roleZfw =
      !efbWeights &&
      liveWeights?.emptyLb !== undefined &&
      livePayload?.ofpPayloadLb !== undefined
        ? liveWeights.emptyLb + livePayload.ofpPayloadLb
        : undefined;
    const liveZfw = efbWeights
      ? liveWeights?.zfwLb
      : (roleZfw ??
        liveWeights?.zfwLb ??
        (liveWeights?.emptyLb !== undefined && livePayload
          ? liveWeights.emptyLb + livePayload.total
          : undefined));
    if (liveZfw === undefined) {
      findings.push({
        code: 'ZFW_UNAVAILABLE',
        severity: 'warn',
        message: efbWeights
          ? 'OFP has Estimated ZFW but L:ZFW_Lvar was unavailable'
          : 'OFP has Estimated ZFW but could not derive live ZFW',
        expected: toLb(sheet.zfw, u),
      });
    } else {
      pushWeightDelta(
        findings,
        'ZFW',
        efbWeights
          ? 'Zero fuel weight (EFB L:ZFW_Lvar)'
          : roleZfw !== undefined
            ? 'ZFW (MSFS empty + pax + bags)'
            : 'Zero fuel weight',
        toLb(sheet.zfw, u),
        liveZfw,
        tol,
        efbWeights ? 'fail' : 'warn',
      );
    }
  }

  // Soft consistency: planned ZFW ≈ empty + payload (info only when all present)
  if (
    sheet.zfw !== undefined &&
    sheet.emptyWeight !== undefined &&
    (sheet.payload !== undefined || ofp.payload?.total !== undefined)
  ) {
    const plannedZfw = toLb(sheet.zfw, u);
    const empty = toLb(sheet.emptyWeight, u);
    const payload =
      sheet.payload !== undefined
        ? toLb(sheet.payload, u)
        : toLb(ofp.payload!.total!, ofp.payload!.unit);
    const implied = empty + payload;
    if (Math.abs(plannedZfw - implied) > tol) {
      findings.push({
        code: 'OFP_ZFW_INCONSISTENT',
        severity: 'warn',
        message: `OFP ZFW ${plannedZfw.toFixed(0)} lb ≠ empty+payload ${implied.toFixed(0)} lb`,
        expected: plannedZfw,
        actual: implied,
        delta: implied - plannedZfw,
      });
    }
  }

  void liveFuel;
}

function compareFuelBurn(
  ofp: OfpExpectation,
  live: LiveFuelState,
  baseline: ComplianceBaseline | undefined,
  previousFuel: LiveFuelState | undefined,
  previousAtMs: number | undefined,
  nowMs: number,
  findings: ComplianceFinding[],
): void {
  const maxIncrease = ofp.tolerances.maxFuelIncreaseLb;
  const eps = Math.max(maxIncrease, 1);

  if (baseline) {
    const gain = live.total - baseline.fuel.total;
    if (gain > eps) {
      findings.push({
        code: 'FUEL_REFUEL_VS_BASELINE',
        severity: 'fail',
        message: `Fuel increased vs baseline: ${baseline.fuel.total.toFixed(1)} → ${live.total.toFixed(1)} lb (Δ=+${gain.toFixed(1)})`,
        expected: baseline.fuel.total,
        actual: live.total,
        delta: gain,
      });
    }
  }

  if (previousFuel) {
    const gain = live.total - previousFuel.total;
    if (gain > eps) {
      findings.push({
        code: 'FUEL_REFUEL_VS_PREVIOUS',
        severity: 'fail',
        message: `Fuel increased since last sample: ${previousFuel.total.toFixed(1)} → ${live.total.toFixed(1)} lb (Δ=+${gain.toFixed(1)})`,
        expected: previousFuel.total,
        actual: live.total,
        delta: gain,
      });
    }

    const burnCap = ofp.tolerances.maxBurnRateLbPerMin;
    if (burnCap !== undefined && previousAtMs !== undefined && nowMs > previousAtMs) {
      const dtMin = (nowMs - previousAtMs) / 60_000;
      if (dtMin > 0) {
        const drop = previousFuel.total - live.total;
        const rate = drop / dtMin;
        if (drop > 0 && rate > burnCap) {
          findings.push({
            code: 'FUEL_BURN_RATE',
            severity: 'fail',
            message: `Fuel drop rate ${rate.toFixed(0)} lb/min exceeds cap ${burnCap} lb/min (possible unload)`,
            expected: burnCap,
            actual: rate,
            delta: rate - burnCap,
          });
        }
      }
    }
  }
}

function comparePayloadFrozen(
  ofp: OfpExpectation,
  live: LivePayloadState | undefined,
  baseline: ComplianceBaseline | undefined,
  findings: ComplianceFinding[],
): void {
  if (!baseline?.payload) {
    return;
  }
  if (!live) {
    findings.push({
      code: 'PAYLOAD_UNAVAILABLE',
      severity: 'warn',
      message: 'Payload baseline set but live payload unavailable',
    });
    return;
  }

  const tol = ofp.tolerances.payloadAbsLb;
  const delta = live.total - baseline.payload.total;
  if (Math.abs(delta) > tol) {
    findings.push({
      code: 'PAYLOAD_DRIFT',
      severity: 'fail',
      message: `Payload changed after lock: ${baseline.payload.total.toFixed(1)} → ${live.total.toFixed(1)} lb (Δ=${delta.toFixed(1)}, tol±${tol})`,
      expected: baseline.payload.total,
      actual: live.total,
      delta,
    });
  }
}

/**
 * Pure OFP vs live compliance check. Testable without SimConnect.
 */
export function compareOfpToLive(input: CompareOfpInput): ComplianceSnapshot {
  const findings: ComplianceFinding[] = [];
  const nowMs = input.nowMs ?? Date.now();
  const at = input.at ?? new Date(nowMs).toISOString();
  const { ofp, liveFuel, livePayload, liveWeights, phase, baseline, previousFuel, previousAtMs } =
    input;

  if (phase === 'preflight' || phase === 'locked') {
    compareFuelToOfp(ofp, liveFuel, findings);
    comparePayloadToOfp(ofp, livePayload, findings);
    compareLoadSheetWeights(ofp, liveWeights, liveFuel, livePayload, findings);
  } else if (phase === 'airborne') {
    compareFuelBurn(ofp, liveFuel, baseline, previousFuel, previousAtMs, nowMs, findings);
    comparePayloadFrozen(ofp, livePayload, baseline, findings);
  }

  return {
    at,
    phase,
    ofp,
    liveFuel,
    livePayload,
    liveWeights,
    baseline,
    findings,
    verdict: worstVerdict(findings),
  };
}

export function captureBaseline(
  liveFuel: LiveFuelState,
  livePayload?: LivePayloadState,
  liveWeights?: LiveWeightState,
  at?: string,
): ComplianceBaseline {
  return {
    fuel: { ...liveFuel },
    payload: livePayload
      ? { ...livePayload, stations: { ...livePayload.stations } }
      : undefined,
    weights: liveWeights ? { ...liveWeights } : undefined,
    capturedAt: at ?? new Date().toISOString(),
  };
}
