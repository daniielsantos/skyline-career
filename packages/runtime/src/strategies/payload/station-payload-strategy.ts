import type { AircraftProfile, PayloadTarget, OperationResult, WriteOperation } from '@msfs-compat/shared';
import type {
  CapabilityScore,
  PayloadStrategy,
  StrategyContext,
  VerificationResult,
} from '../../types.js';
import { readBridgeSimVars } from '../../read-simvars.js';

function evaluateExpr(expr: string, vars: Record<string, number>): number {
  const replaced = expr.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined) {
      throw new Error(`Missing expression variable: ${key}`);
    }
    return String(value);
  });

  if (!/^[0-9+\-*/().\s]+$/.test(replaced)) {
    throw new Error(`Unsafe expression: ${expr}`);
  }

  return Function(`"use strict"; return (${replaced});`)() as number;
}

async function executeWritePlan(
  plan: WriteOperation[],
  vars: Record<string, number>,
  ctx: StrategyContext,
): Promise<void> {
  const gapMs = ctx.writeGapMs && ctx.writeGapMs > 0 ? ctx.writeGapMs : 0;
  const localGap = () =>
    gapMs > 0
      ? new Promise<void>((resolve) => setTimeout(resolve, gapMs))
      : Promise.resolve();
  for (const step of plan) {
    switch (step.op) {
      case 'simvar_set':
        await ctx.bridge.writeSimVar({
          name: step.var!,
          unit: step.unit!,
          value: evaluateExpr(step.valueExpr!, vars),
        });
        await localGap();
        break;
      case 'lvar_set':
        await ctx.bridge.writeLVar({
          name: step.name!,
          value: evaluateExpr(step.valueExpr!, vars),
        });
        await localGap();
        break;
      case 'hvar_trigger':
        await ctx.bridge.triggerHVar(step.name!);
        await localGap();
        break;
      case 'event':
        await ctx.bridge.triggerEvent({ event: step.event!, data: step.data });
        await localGap();
        break;
      case 'delay':
        if (!ctx.skipSettle) {
          await ctx.bridge.delay(step.ms ?? 0);
        }
        break;
      default:
        throw new Error(`Unsupported write operation`);
    }
  }
}

export class StationWritebackPayloadStrategy implements PayloadStrategy {
  readonly name: string = 'station-writeback';

  canHandle(profile: AircraftProfile): boolean {
    return (
      profile.payload.strategy === 'station-writeback' ||
      profile.payload.strategy === 'simconnect-direct' ||
      profile.payload.strategy === 'lvar-bridge'
    );
  }

  async detect(ctx: StrategyContext): Promise<CapabilityScore> {
    return {
      strategy: this.name,
      score: this.canHandle(ctx.profile) ? 0.88 : 0.2,
      reasons: ['Payload station writeback'],
    };
  }

  async setPayload(target: PayloadTarget, ctx: StrategyContext): Promise<OperationResult> {
    const started = Date.now();
    const vars: Record<string, number> = {};

    for (const station of ctx.profile.payload.stations) {
      const value = target.stations?.[station.index] ?? 0;
      if (value > station.maxLoad) {
        return {
          success: false,
          strategyUsed: this.name,
          fallbackUsed: false,
          durationMs: Date.now() - started,
          errorCode: 'STATION_OVER_MAX',
          details: { station: station.index, maxLoad: station.maxLoad, requested: value },
        };
      }
      vars[`station_${station.index}`] = value;
      vars.total = (vars.total ?? 0) + value;
    }

    if (target.total !== undefined) {
      vars.total = target.total;
    }

    try {
      await executeWritePlan(ctx.profile.payload.writePlan, vars, ctx);
      // Brief settle so station writes stick before verify / next step.
      // skipSettle: caller (multi-step inject) settles locally between rounds.
      if (!ctx.skipSettle) {
        await ctx.bridge.delay(400);
      }
      return {
        success: true,
        strategyUsed: this.name,
        fallbackUsed: false,
        durationMs: Date.now() - started,
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

  async verify(target: PayloadTarget, ctx: StrategyContext): Promise<VerificationResult> {
    const verify = ctx.profile.payload.verify;
    const timeoutMs = verify.timeoutMs ?? 3000;
    const pollIntervalMs = verify.pollIntervalMs ?? 200;
    const started = Date.now();

    const vars: Record<string, number> = {};
    for (const station of ctx.profile.payload.stations) {
      const value = target.stations?.[station.index] ?? 0;
      vars[`station_${station.index}`] = value;
      vars.total = (vars.total ?? 0) + value;
    }
    if (target.total !== undefined) {
      vars.total = target.total;
    }

    const failures: VerificationResult['failures'] = [];

    while (Date.now() - started <= timeoutMs) {
      failures.length = 0;

      const actuals = await readBridgeSimVars(
        ctx.bridge,
        verify.checks.map((check) => ({ name: check.var, unit: check.unit })),
      );
      for (let i = 0; i < verify.checks.length; i += 1) {
        const check = verify.checks[i]!;
        const expected = check.valueExpr
          ? evaluateExpr(check.valueExpr, vars)
          : (target.total ?? 0);
        const actual = actuals[i] ?? Number.NaN;
        const tolerance = Math.max(Math.abs(expected) * (check.tolerancePct / 100), 1);

        if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
          failures.push({
            var: check.var,
            expected,
            actual: Number.isFinite(actual) ? actual : 0,
            tolerancePct: check.tolerancePct,
          });
        }
      }

      if (failures.length === 0) {
        return { ok: true, failures: [] };
      }

      await ctx.bridge.delay(pollIntervalMs);
    }

    return { ok: false, failures };
  }
}
