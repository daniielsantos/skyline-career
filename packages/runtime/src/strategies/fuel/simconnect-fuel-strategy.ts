import type { AircraftProfile, FuelTarget, OperationResult, WriteOperation } from '@msfs-compat/shared';
import type {
  CapabilityScore,
  FuelStrategy,
  StrategyContext,
  VerificationResult,
} from '../../types.js';

function evaluateExpr(expr: string, vars: Record<string, number>): number {
  const replaced = expr.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined) {
      throw new Error(`Missing expression variable: ${key}`);
    }
    return String(value);
  });

  // Safe-ish arithmetic evaluator for profile expressions only.
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
  const omit = new Set(
    (ctx.omitFuelTankWrites ?? []).map((id) => id.toUpperCase()),
  );
  const tankByWriteVar = new Map(
    ctx.profile.fuel.tanks
      .filter((t) => t.writeVar)
      .map((t) => [t.writeVar!.toUpperCase(), t.id]),
  );
  const localGap = () =>
    gapMs > 0
      ? new Promise<void>((resolve) => setTimeout(resolve, gapMs))
      : Promise.resolve();
  for (const step of plan) {
    switch (step.op) {
      case 'simvar_set': {
        const tankId = tankByWriteVar.get((step.var ?? '').toUpperCase());
        if (tankId && omit.has(tankId.toUpperCase())) {
          break;
        }
        await ctx.bridge.writeSimVar({
          name: step.var!,
          unit: step.unit!,
          value: evaluateExpr(step.valueExpr!, vars),
        });
        await localGap();
        break;
      }
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

async function runVerification(
  ctx: StrategyContext,
  vars: Record<string, number>,
): Promise<VerificationResult> {
  const verify = ctx.profile.fuel.verify;
  const timeoutMs = verify.timeoutMs ?? 3000;
  const pollIntervalMs = verify.pollIntervalMs ?? 200;
  const started = Date.now();
  const failures: VerificationResult['failures'] = [];

  while (Date.now() - started <= timeoutMs) {
    failures.length = 0;

    for (const check of verify.checks) {
      const expected = check.valueExpr
        ? evaluateExpr(check.valueExpr, vars)
        : vars[check.var] ?? 0;
      const actual = await ctx.bridge.readSimVar({ name: check.var, unit: check.unit });
      // Absolute floor: 1.5 gal covers typical MSFS unusable/offset residual on light GA.
      const tolerance = Math.max(expected * (check.tolerancePct / 100), 1.5, 0.01);

      if (Math.abs(actual - expected) > tolerance) {
        failures.push({
          var: check.var,
          expected,
          actual,
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

export class SimConnectDirectFuelStrategy implements FuelStrategy {
  readonly name: string = 'simconnect-direct';

  canHandle(profile: AircraftProfile): boolean {
    return profile.fuel.strategy === 'simconnect-direct';
  }

  async detect(ctx: StrategyContext): Promise<CapabilityScore> {
    return {
      strategy: this.name,
      score: this.canHandle(ctx.profile) ? 0.9 : 0.2,
      reasons: ['Direct SimVar fuel writes'],
    };
  }

  async setFuel(target: FuelTarget, ctx: StrategyContext): Promise<OperationResult> {
    const started = Date.now();
    const vars: Record<string, number> = {};

    for (const tank of ctx.profile.fuel.tanks) {
      const value = target.tanks?.[tank.id] ?? target.total ?? 0;
      vars[tank.id] = value;
      vars.total = (vars.total ?? 0) + value;
    }

    try {
      await executeWritePlan(ctx.profile.fuel.writePlan, vars, ctx);
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
        errorCode: 'FUEL_WRITE_FAILED',
        details: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async verify(target: FuelTarget, ctx: StrategyContext): Promise<VerificationResult> {
    const vars: Record<string, number> = {};
    for (const tank of ctx.profile.fuel.tanks) {
      vars[tank.id] = target.tanks?.[tank.id] ?? target.total ?? 0;
      vars[tank.readVar.replace(/[^a-zA-Z0-9_]/g, '_')] = vars[tank.id];
    }
    return runVerification(ctx, vars);
  }
}

export class HybridSyncFuelStrategy extends SimConnectDirectFuelStrategy {
  override readonly name: string = 'hybrid-sync';

  override canHandle(profile: AircraftProfile): boolean {
    return profile.fuel.strategy === 'hybrid-sync';
  }
}

/** Accu-Sim / vendor fuel via LVar writePlan; verify still uses classic SimVar mirrors. */
export class LvarBridgeFuelStrategy extends SimConnectDirectFuelStrategy {
  override readonly name: string = 'lvar-bridge';

  override canHandle(profile: AircraftProfile): boolean {
    return profile.fuel.strategy === 'lvar-bridge';
  }

  override async detect(ctx: StrategyContext): Promise<CapabilityScore> {
    return {
      strategy: this.name,
      score: this.canHandle(ctx.profile) ? 0.95 : 0.2,
      reasons: ['LVar fuel writes (Accu-Sim / vendor tablet)'],
    };
  }
}
