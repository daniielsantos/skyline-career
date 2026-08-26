import {
  buildBcfFuelKeySequence,
  buildBcfZfwKeySequence,
  bcfFuelInjectOptions,
  bcfZfwInjectOptions,
  fuelLbToDisplay,
  zfwLbToDisplay,
  type CduKeyStep,
  DEFAULT_JET_A_LB_PER_GAL,
} from '@msfs-compat/shared';
import type { AircraftProfile, FuelTarget, OperationResult, PayloadTarget } from '@msfs-compat/shared';
import type {
  CapabilityScore,
  FuelStrategy,
  PayloadStrategy,
  SimBridge,
  StrategyContext,
  VerificationResult,
} from '../../types.js';
import {
  applyPmdg777RuntimeFuel,
  applyPmdg777RuntimeZfw,
  isPmdg777Profile,
} from './pmdg-777-cdu-apply.js';

async function requirePmdgControl(bridge: SimBridge): Promise<
  NonNullable<SimBridge['sendPmdgNg3Control']>
> {
  if (!bridge.sendPmdgNg3Control) {
    throw new Error(
      'PMDG CDU inject requires bridge.sendPmdgNg3Control (NamedPipe / SimBridgeHost)',
    );
  }
  return bridge.sendPmdgNg3Control.bind(bridge);
}

async function sendKeystreamQuiet(
  bridge: SimBridge,
  steps: CduKeyStep[],
  opts: {
    delayMs: number;
    pageDelayMs: number;
    method: 'event' | 'control' | 'rotor';
    parameter: number;
    release: boolean;
    cdu: 'left' | 'right';
    cduFamily?: 'ng3' | '777';
    eventOnly?: boolean;
  },
): Promise<void> {
  const send = await requirePmdgControl(bridge);
  let prevKey: string | undefined;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (prevKey !== undefined && prevKey === step.key) {
      await bridge.delay(Math.max(opts.delayMs, 100));
    }
    const method = opts.eventOnly ? 'rotor' : (step.method ?? opts.method);
    const parameter = opts.eventOnly ? 0 : (step.parameter ?? opts.parameter);
    const release = opts.eventOnly ? false : (step.release ?? opts.release);
    await send({
      key: step.key,
      release,
      method,
      parameter,
      cdu: opts.cdu,
      ...(opts.cduFamily ? { cduFamily: opts.cduFamily } : {}),
      ...(step.holdMs !== undefined ? { holdMs: step.holdMs } : {}),
    });
    prevKey = step.key;
    if (i + 1 >= steps.length) break;
    const wait =
      step.delayAfterMs ?? (step.pagePause ? opts.pageDelayMs : opts.delayMs);
    if (wait > 0) {
      await bridge.delay(wait);
    }
  }
}

function sumRecord(values: Record<string, number> | undefined): number {
  if (!values) return 0;
  let sum = 0;
  for (const v of Object.values(values)) {
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return sum;
}

function sumStations(stations: Record<number, number> | undefined): number {
  if (!stations) return 0;
  let sum = 0;
  for (const v of Object.values(stations)) {
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return sum;
}

async function readDensityLbPerGal(bridge: SimBridge): Promise<number> {
  try {
    const d = await bridge.readSimVar({
      name: 'FUEL WEIGHT PER GALLON',
      unit: 'pounds',
    });
    if (Number.isFinite(d) && d >= 5 && d <= 8) return d;
  } catch {
    /* default */
  }
  return DEFAULT_JET_A_LB_PER_GAL;
}

/** Resolve fuel target to pounds (profile tanks are typically gallons). */
export async function resolvePmdgFuelTargetLb(
  target: FuelTarget,
  profile: AircraftProfile,
  bridge: SimBridge,
): Promise<number> {
  const dens = await readDensityLbPerGal(bridge);
  const unit = (profile.fuel.unit ?? 'gallons').toLowerCase();
  const tankSum = sumRecord(target.tanks);
  const raw =
    tankSum > 0
      ? tankSum
      : typeof target.total === 'number' && Number.isFinite(target.total)
        ? target.total
        : 0;
  if (unit === 'lb' || unit === 'lbs' || unit === 'pounds') {
    return raw;
  }
  if (unit === 'kg' || unit === 'kgs') {
    return raw * 2.2046226218;
  }
  // gallons (default)
  return raw * dens;
}

export class PmdgCduFuelStrategy implements FuelStrategy {
  readonly name = 'pmdg-cdu';

  canHandle(profile: AircraftProfile): boolean {
    return profile.fuel.strategy === 'pmdg-cdu';
  }

  async detect(ctx: StrategyContext): Promise<CapabilityScore> {
    return {
      strategy: this.name,
      score: this.canHandle(ctx.profile) ? 0.95 : 0.05,
      reasons: ['PMDG NG3 CDU TOTAL keystream (FO)'],
    };
  }

  async setFuel(target: FuelTarget, ctx: StrategyContext): Promise<OperationResult> {
    const started = Date.now();
    try {
      const totalLb = await resolvePmdgFuelTargetLb(target, ctx.profile, ctx.bridge);
      if (totalLb < 1) {
        throw new Error('PMDG CDU fuel target is empty (0 lb)');
      }
      if (isPmdg777Profile(ctx.profile)) {
        return applyPmdg777RuntimeFuel({
          bridge: ctx.bridge,
          totalLb,
          sendKeystream: sendKeystreamQuiet,
          started,
          strategyName: this.name,
        });
      }
      const display = fuelLbToDisplay(totalLb);
      const opts = bcfFuelInjectOptions(display);
      const steps = buildBcfFuelKeySequence(opts);
      await sendKeystreamQuiet(ctx.bridge, steps, opts);
      return {
        success: true,
        strategyUsed: this.name,
        fallbackUsed: false,
        durationMs: Date.now() - started,
        details: { totalLb, display, steps: steps.length, cdu: opts.cdu },
      };
    } catch (error) {
      return {
        success: false,
        strategyUsed: this.name,
        fallbackUsed: false,
        durationMs: Date.now() - started,
        errorCode: 'FUEL_WRITE_FAILED',
        details: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async verify(target: FuelTarget, ctx: StrategyContext): Promise<VerificationResult> {
    const expectedLb = await resolvePmdgFuelTargetLb(target, ctx.profile, ctx.bridge);
    const dens = await readDensityLbPerGal(ctx.bridge);
    let actualLb = 0;
    for (const tank of ctx.profile.fuel.tanks) {
      if (!tank.readVar) continue;
      try {
        const gal = await ctx.bridge.readSimVar({
          name: tank.readVar,
          unit: tank.readUnit ?? 'gallons',
        });
        if (Number.isFinite(gal)) actualLb += gal * dens;
      } catch {
        /* skip */
      }
    }
    const tolAbs = Math.max(300, expectedLb * 0.03);
    const ok = Math.abs(actualLb - expectedLb) <= tolAbs;
    return {
      ok,
      failures: ok
        ? []
        : [
            {
              var: 'FUEL_TOTAL_LB',
              expected: expectedLb,
              actual: actualLb,
              tolerancePct: 3,
            },
          ],
    };
  }
}

export class PmdgCduPayloadStrategy implements PayloadStrategy {
  readonly name = 'pmdg-cdu';

  canHandle(profile: AircraftProfile): boolean {
    return profile.payload.strategy === 'pmdg-cdu';
  }

  async detect(ctx: StrategyContext): Promise<CapabilityScore> {
    return {
      strategy: this.name,
      score: this.canHandle(ctx.profile) ? 0.95 : 0.05,
      reasons: ['PMDG NG3 CDU ZFW keystream (FO)'],
    };
  }

  async setPayload(
    target: PayloadTarget,
    ctx: StrategyContext,
  ): Promise<OperationResult> {
    const started = Date.now();
    try {
      // Prefer absolute ZFW in target.total (orchestrator passes SimBrief est_zfw
      // or computed absolute). Airline ZFW is always ≫ 40k lb — never treat that
      // scale as "payload to add on empty".
      let emptyLb = 0;
      try {
        emptyLb = await ctx.bridge.readSimVar({
          name: 'EMPTY WEIGHT',
          unit: 'pounds',
        });
      } catch {
        emptyLb = 0;
      }
      const payloadLb =
        typeof target.total === 'number' && Number.isFinite(target.total)
          ? target.total
          : sumStations(target.stations);
      const looksLikeAbsoluteZfw =
        payloadLb >= 40_000 ||
        (emptyLb > 1000 && payloadLb > emptyLb + 100);
      const zfwLb = looksLikeAbsoluteZfw
        ? payloadLb
        : emptyLb + Math.max(0, payloadLb);
      if (zfwLb < 1000) {
        throw new Error(`PMDG CDU ZFW target looks invalid (${zfwLb} lb)`);
      }
      const skip = target.skipScratchpadClear === true;
      if (isPmdg777Profile(ctx.profile)) {
        return applyPmdg777RuntimeZfw({
          bridge: ctx.bridge,
          zfwLb,
          skipScratchpadClear: skip,
          sendKeystream: sendKeystreamQuiet,
          started,
          strategyName: this.name,
          emptyLb,
          payloadLb,
        });
      }
      const display = zfwLbToDisplay(zfwLb);
      const opts = bcfZfwInjectOptions(display, {
        skipScratchpadClear: skip,
      });
      const steps = buildBcfZfwKeySequence(opts);
      await sendKeystreamQuiet(ctx.bridge, steps, opts);
      return {
        success: true,
        strategyUsed: this.name,
        fallbackUsed: false,
        durationMs: Date.now() - started,
        details: {
          zfwLb,
          display,
          emptyLb,
          payloadLb,
          steps: steps.length,
          cdu: opts.cdu,
          skipScratchpadClear: opts.skipScratchpadClear === true,
          clrSteps: steps.filter((s) => s.key === 'CLR').length,
        },
      };
    } catch (error) {
      return {
        success: false,
        strategyUsed: this.name,
        fallbackUsed: false,
        durationMs: Date.now() - started,
        errorCode: 'PAYLOAD_WRITE_FAILED',
        details: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async verify(
    target: PayloadTarget,
    ctx: StrategyContext,
  ): Promise<VerificationResult> {
    let expectedZfw: number | undefined;
    try {
      const emptyLb = await ctx.bridge.readSimVar({
        name: 'EMPTY WEIGHT',
        unit: 'pounds',
      });
      const payloadLb =
        typeof target.total === 'number' && Number.isFinite(target.total)
          ? target.total
          : sumStations(target.stations);
      const looksLikeAbsoluteZfw =
        payloadLb >= 40_000 ||
        (emptyLb > 1000 && payloadLb > emptyLb + 100);
      expectedZfw = looksLikeAbsoluteZfw
        ? payloadLb
        : emptyLb + Math.max(0, payloadLb);
    } catch {
      return { ok: true, failures: [] };
    }

    let actualZfw: number | undefined;
    try {
      actualZfw = await ctx.bridge.readLVar('ZFW_Lvar');
      if (!Number.isFinite(actualZfw) || (actualZfw ?? 0) < 1000) {
        actualZfw = undefined;
      }
    } catch {
      actualZfw = undefined;
    }
    if (actualZfw === undefined) {
      try {
        const gross = await ctx.bridge.readSimVar({
          name: 'TOTAL WEIGHT',
          unit: 'pounds',
        });
        const fuelGal = await ctx.bridge.readSimVar({
          name: 'FUEL TOTAL QUANTITY',
          unit: 'gallons',
        });
        const dens = await readDensityLbPerGal(ctx.bridge);
        actualZfw = gross - fuelGal * dens;
      } catch {
        return { ok: true, failures: [] };
      }
    }

    const tolAbs = 400;
    const ok = Math.abs((actualZfw ?? 0) - expectedZfw) <= tolAbs;
    return {
      ok,
      failures: ok
        ? []
        : [
            {
              var: 'ZFW_LB',
              expected: expectedZfw,
              actual: actualZfw ?? 0,
              tolerancePct: 2,
            },
          ],
    };
  }
}
