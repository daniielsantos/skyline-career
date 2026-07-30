import type { AircraftProfile, LoadPlanRequest } from '@msfs-compat/shared';
import { DefaultCapabilityDetector } from './capability/default-capability-detector.js';
import { DefaultGatingEvaluator } from './gating/default-gating-evaluator.js';
import { StrategyRegistry } from './registry/strategy-registry.js';
import { HybridSyncFuelStrategy, LvarBridgeFuelStrategy, SimConnectDirectFuelStrategy } from './strategies/fuel/simconnect-fuel-strategy.js';
import { StationWritebackPayloadStrategy } from './strategies/payload/station-payload-strategy.js';
import type { ProfileEngine, SimBridge } from './types.js';

const CG_TOLERANCE_MAC_PERCENT = 1;

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

    const ctx = { profile: this.profile, bridge: this.bridge, snapshot };
    await this.capabilityDetector.detect(this.profile, this.bridge);

    const fuelStrategy =
      this.registry.resolveFuel(this.profile.fuel.strategy) ??
      this.registry.resolveFuel('simconnect-direct');

    const payloadStrategy =
      this.registry.resolvePayload(this.profile.payload.strategy) ??
      this.registry.resolvePayload('station-writeback');

    const results: Awaited<ReturnType<ProfileEngine['applyLoadPlan']>> = {};

    if (request.payload && payloadStrategy) {
      results.payload = await payloadStrategy.setPayload(request.payload, ctx);
      if (results.payload.success) {
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
      if (results.fuel.success) {
        const verified = await fuelStrategy.verify(request.fuel, ctx);
        if (!verified.ok) {
          results.fuel = { ...results.fuel, success: false, errorCode: 'FUEL_VERIFY_FAILED' };
        }
      }
    }

    if (this.profile.cg?.constraints) {
      // MSFS updates weight stations immediately, but its derived CG SimVar can
      // lag behind. Reading it too early can reject a valid load or falsely
      // report that a rollback failed.
      await new Promise((resolve) => setTimeout(resolve, 750));
      let cg = await this.bridge.readSimVar({
        name: this.profile.cg.readVar ?? 'CG PERCENT',
        unit: this.profile.cg.readUnit ?? 'Percent over 100',
      });

      // MSFS returns Percent-over-100 as 0.24 for 24%; normalize to MAC percent.
      if (cg <= 1.5) {
        cg *= 100;
      }

      const { minMac, maxMac } = this.profile.cg.constraints;
      const ok =
        (minMac === undefined || cg >= minMac - CG_TOLERANCE_MAC_PERCENT) &&
        (maxMac === undefined || cg <= maxMac + CG_TOLERANCE_MAC_PERCENT);
      const expectedCg = ((minMac ?? 0) + (maxMac ?? 0)) / 2;
      results.cg = {
        ok,
        failures: ok
          ? []
          : [
              {
                var: 'CG PERCENT',
                expected: expectedCg,
                actual: cg,
                tolerancePct: CG_TOLERANCE_MAC_PERCENT,
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
