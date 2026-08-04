import type { SimBridge, SimSnapshot } from '@msfs-compat/runtime';
import { DefaultProfileEngine } from '@msfs-compat/runtime';
import profile from '../../../../profiles/examples/nextgensim-emb-110p1f-bandeirante.json' with { type: 'json' };

/**
 * In-memory SimBridge for local tests before wiring real SimConnect.
 */
export class MockSimBridge implements SimBridge {
  private vars = new Map<string, number>();
  private lvars = new Map<string, number>();
  public state: SimSnapshot = {
    onGround: true,
    enginesRunning: false,
    parkingBrake: true,
    paused: false,
    slewActive: false,
    simRate: 1,
    vars: {},
  };

  async readSimVar(request: { name: string; unit: string }): Promise<number> {
    return this.vars.get(`${request.name}|${request.unit}`) ?? 0;
  }

  async writeSimVar(request: { name: string; unit: string; value: number }): Promise<void> {
    this.vars.set(`${request.name}|${request.unit}`, request.value);
    this.state.vars[request.name] = request.value;
  }

  async readLVar(name: string): Promise<number> {
    return this.lvars.get(name) ?? 0;
  }

  async writeLVar(request: { name: string; value: number }): Promise<void> {
    this.lvars.set(request.name, request.value);
  }

  async triggerHVar(_name: string): Promise<void> {}

  async triggerEvent(_request: { event: string; data?: number }): Promise<void> {}

  async snapshot(): Promise<SimSnapshot> {
    return { ...this.state, vars: { ...this.state.vars } };
  }

  async delay(_ms: number): Promise<void> {}
}

async function main() {
  const bridge = new MockSimBridge();
  const engine = new DefaultProfileEngine({ profile, bridge });

  const result = await engine.applyLoadPlan({
    fuel: { tanks: { LEFT_MAIN: 20, RIGHT_MAIN: 20 } },
    payload: {
      stations: { 1: 180, 2: 0, 3: 0, 4: 0, 5: 50 },
      total: 230,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
