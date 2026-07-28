import type { FuelStrategy, PayloadStrategy } from '../types.js';

export class StrategyRegistry {
  private readonly fuelStrategies = new Map<string, FuelStrategy>();
  private readonly payloadStrategies = new Map<string, PayloadStrategy>();

  registerFuel(strategy: FuelStrategy): void {
    this.fuelStrategies.set(strategy.name, strategy);
  }

  registerPayload(strategy: PayloadStrategy): void {
    this.payloadStrategies.set(strategy.name, strategy);
  }

  resolveFuel(strategyName: string): FuelStrategy | undefined {
    return this.fuelStrategies.get(strategyName);
  }

  resolvePayload(strategyName: string): PayloadStrategy | undefined {
    return this.payloadStrategies.get(strategyName);
  }

  listFuel(): FuelStrategy[] {
    return [...this.fuelStrategies.values()];
  }

  listPayload(): PayloadStrategy[] {
    return [...this.payloadStrategies.values()];
  }
}

export function createDefaultRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();
  return registry;
}
