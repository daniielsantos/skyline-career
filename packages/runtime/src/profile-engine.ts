import type { AircraftProfile, LoadPlanRequest } from '@msfs-compat/shared';
import { normalizeMacPercent } from '@msfs-compat/shared';
import { DefaultCapabilityDetector } from './capability/default-capability-detector.js';
import { DefaultGatingEvaluator } from './gating/default-gating-evaluator.js';
import { StrategyRegistry } from './registry/strategy-registry.js';
import { HybridSyncFuelStrategy, LvarBridgeFuelStrategy, SimConnectDirectFuelStrategy } from './strategies/fuel/simconnect-fuel-strategy.js';
import { StationWritebackPayloadStrategy } from './strategies/payload/station-payload-strategy.js';
import type { ProfileEngine, SimBridge } from './types.js';

export interface ProfileEngineOptions {
  profile: AircraftProfile;
  bridge: SimBridge;
  registry?: StrategyRegistry;
}

export class DefaultProfileEngine implements ProfileEngine {
  private readonly profile: AircraftProfile;
  private readonly bridge: SimBridge;
  private readonly registry: StrategyRegistry;
  private readonly gating = new DefaultGatingEvaluator();
  private readonly capabilityDetector = new DefaultCapabilityDetector();

  constructor(options: ProfileEngineOptions) {
    this.profile = options.profile;
    this.bridge = options.bridge;
    this.registry = options.registry ?? createDefaultProfileRegistry();
  }

  async applyLoadPlan(request: LoadPlanRequest) {
    // Fast path (skipVerify): one snapshot for gating, no capability re-probe.
    // Capability detect() itself calls snapshot() again and was doubling pipe
    // traffic on every CG rebalance round.
    const snapshot = await this.bridge.snapshot();
    const gate = this.gating.evaluate(this.profile.gating, snapshot);

    if (!gate.allowed) {
      const blocked = {
        success: false,
        strategyUsed: 'gating',
        fallbackUsed: false,
        durationMs: 0,
        errorCode: gate.reason,
      };

      return { fuel: request.fuel ? blocked : undefined, payload: request.payload ? blocked : undefined };
    }

    const writeGapMs =
      typeof request.writeGapMs === 'number' && request.writeGapMs > 0
        ? request.writeGapMs
        : undefined;
    const ctx = {
      profile: this.profile,
      bridge: this.bridge,
      snapshot,
      skipSettle: Boolean(request.skipVerify),
      writeGapMs,
    };
    if (!request.skipVerify) {
      await this.capabilityDetector.detect(this.profile, this.bridge);
    }

    const fuelStrategy =
      this.registry.resolveFuel(this.profile.fuel.strategy) ??
      this.registry.resolveFuel('simconnect-direct');

    const payloadStrategy =
      this.registry.resolvePayload(this.profile.payload.strategy) ??
      this.registry.resolvePayload('station-writeback');

    const results: Awaited<ReturnType<ProfileEngine['applyLoadPlan']>> = {};

    if (request.payload && payloadStrategy) {
      results.payload = await payloadStrategy.setPayload(request.payload, ctx);
      if (results.payload.success && !request.skipVerify) {
        results.payload = {
          ...results.payload,
          ...(await payloadStrategy.verify(request.payload, ctx).then((v) =>
            v.ok ? {} : { success: false, errorCode: 'PAYLOAD_VERIFY_FAILED' },
          )),
        };
      }
    }

    if (request.fuel && fuelStrategy) {
      results.fuel = await fuelStrategy.setFuel(request.fuel, ctx);
      if (results.fuel.success && !request.skipVerify) {
        const verified = await fuelStrategy.verify(request.fuel, ctx);
        if (!verified.ok) {
          results.fuel = { ...results.fuel, success: false, errorCode: 'FUEL_VERIFY_FAILED' };
        }
      }
    }

    if (this.profile.cg?.constraints && request.cgPolicy !== 'none') {
      // MSFS updates weight stations immediately, but its derived CG SimVar can
      // lag behind. Reading it too early can reject a valid load or falsely
      // report that a rollback failed.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      let cg = await this.bridge.readSimVar({
        name: this.profile.cg.readVar ?? 'CG PERCENT',
        unit: this.profile.cg.readUnit ?? 'Percent over 100',
      });
      cg = normalizeMacPercent(cg);

      // Prefer live envelope from CG FWD/AFT LIMIT (Mass & Balance tablet) when
      // readable — unless the profile deliberately pinned a manual/cfg envelope
      // (e.g. addon SimVars report a too-tight aft limit).
      let minMac = this.profile.cg.constraints.minMac;
      let maxMac = this.profile.cg.constraints.maxMac;
      const pinnedEnvelope =
        this.profile.cg.envelopeSource === 'manual' ||
        this.profile.cg.envelopeSource === 'cfg';
      if (!pinnedEnvelope) {
        try {
          const fwdRaw = await this.bridge.readSimVar({
            name: 'CG FWD LIMIT',
            unit: 'Percent over 100',
          });
          const aftRaw = await this.bridge.readSimVar({
            name: 'CG AFT LIMIT',
            unit: 'Percent over 100',
          });
          if (Number.isFinite(fwdRaw) && Number.isFinite(aftRaw)) {
            let fwd = normalizeMacPercent(fwdRaw);
            let aft = normalizeMacPercent(aftRaw);
            if (fwd > aft) [fwd, aft] = [aft, fwd];
            minMac = fwd;
            maxMac = aft;
          }
        } catch {
          // Keep profile constraints when live limits are unavailable.
        }
      }

      const toleranceMac = Math.min(
        1,
        Math.max(0, this.profile.cg.toleranceMac ?? 0.5),
      );
      const inEnvelope =
        (minMac === undefined || cg >= minMac - toleranceMac) &&
        (maxMac === undefined || cg <= maxMac + toleranceMac);
      const soft = request.cgPolicy === 'soft';
      const expectedCg = ((minMac ?? 0) + (maxMac ?? 0)) / 2;
      results.cg = {
        // Soft policy reports the measurement but does not fail the apply.
        ok: soft ? true : inEnvelope,
        failures: inEnvelope
          ? []
          : [
              {
                var: 'CG PERCENT',
                expected: expectedCg,
                actual: cg,
                tolerancePct: toleranceMac,
              },
            ],
      };
    }

    return results;
  }
}

export function createDefaultProfileRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();
  registry.registerFuel(new SimConnectDirectFuelStrategy());
  registry.registerFuel(new HybridSyncFuelStrategy());
  registry.registerFuel(new LvarBridgeFuelStrategy());
  registry.registerPayload(new StationWritebackPayloadStrategy());
  return registry;
}
