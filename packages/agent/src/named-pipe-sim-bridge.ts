import type {
  EventTriggerRequest,
  LVarWriteRequest,
  SimBridge,
  SimSnapshot,
  SimVarReadRequest,
  SimVarWriteRequest,
} from '@msfs-compat/runtime';
import { NamedPipeClient, type NamedPipeClientOptions } from './ipc/named-pipe-client.js';

/**
 * SimBridge implementation that talks to the C# SimBridgeHost over Named Pipe IPC.
 */
export class NamedPipeSimBridge implements SimBridge {
  private readonly client: NamedPipeClient;
  private autoConnected = false;

  constructor(options: NamedPipeClientOptions = {}) {
    this.client = new NamedPipeClient(options);
  }

  async open(appName = 'MSFS Compat Agent'): Promise<void> {
    await this.client.connect();
    await this.client.call('connect', { appName });
    this.autoConnected = true;
  }

  async close(): Promise<void> {
    if (this.client.isConnected) {
      try {
        await this.client.call('disconnect');
      } catch {
        // ignore disconnect errors on shutdown
      }
    }
    await this.client.close();
    this.autoConnected = false;
  }

  async ping(): Promise<{ pong: boolean; mode: string; connected: boolean }> {
    await this.ensureOpen();
    return this.client.call('ping');
  }

  async status(): Promise<{ mode: string; connected: boolean; aircraftTitle?: string }> {
    await this.ensureOpen();
    return this.client.call('status');
  }

  async getAircraftIdentity(): Promise<{
    title: string;
    atcModel?: string;
    atcType?: string;
    icao?: string;
  }> {
    await this.ensureOpen();
    return this.client.call('getAircraftIdentity');
  }

  async readSimVar(request: SimVarReadRequest): Promise<number> {
    await this.ensureOpen();
    const result = await this.client.call<{ value: number }>('readSimVar', {
      name: request.name,
      unit: request.unit,
    });
    return result.value;
  }

  async writeSimVar(request: SimVarWriteRequest): Promise<void> {
    await this.ensureOpen();
    await this.client.call('writeSimVar', {
      name: request.name,
      unit: request.unit,
      value: request.value,
    });
  }

  async readLVar(name: string): Promise<number> {
    await this.ensureOpen();
    const result = await this.client.call<{ value: number }>('readLVar', { name });
    return result.value;
  }

  async writeLVar(request: LVarWriteRequest): Promise<void> {
    await this.ensureOpen();
    await this.client.call('writeLVar', {
      name: request.name,
      value: request.value,
    });
  }

  async triggerHVar(name: string): Promise<void> {
    await this.ensureOpen();
    await this.client.call('triggerHVar', { name });
  }

  async triggerEvent(request: EventTriggerRequest): Promise<void> {
    await this.ensureOpen();
    await this.client.call('triggerEvent', {
      event: request.event,
      data: request.data ?? 0,
    });
  }

  async snapshot(): Promise<SimSnapshot> {
    await this.ensureOpen();
    return this.client.call<SimSnapshot>('snapshot');
  }

  async delay(ms: number): Promise<void> {
    await this.ensureOpen();
    await this.client.call('delay', { ms });
  }

  async readPmdgNg3Fuel(): Promise<{
    available: boolean;
    leftLb?: number;
    rightLb?: number;
    centerLb?: number;
    weightInKg?: boolean;
    ageMs?: number;
    layoutOk?: boolean;
    layoutOffset?: number;
    nonzeroBytes?: number;
  }> {
    await this.ensureOpen();
    return this.client.call('readPmdgNg3Fuel');
  }

  async sendPmdgNg3Control(opts: {
    eventId?: number;
    key?: string;
    parameter?: number;
    release?: boolean;
    /** `event` = TransmitClientEvent (default); `control` = PMDG_NG3_Control SetClientData */
    method?: 'event' | 'control';
  }): Promise<{
    ok: boolean;
    eventId: number;
    parameter: number;
    release?: boolean;
    method?: string;
  }> {
    await this.ensureOpen();
    return this.client.call('sendPmdgNg3Control', {
      ...(opts.eventId !== undefined ? { eventId: opts.eventId } : {}),
      ...(opts.key !== undefined ? { key: opts.key } : {}),
      ...(opts.parameter !== undefined ? { parameter: opts.parameter } : {}),
      ...(opts.release !== undefined ? { release: opts.release } : {}),
      ...(opts.method !== undefined ? { method: opts.method } : {}),
    });
  }

  private async ensureOpen(): Promise<void> {
    if (!this.autoConnected) {
      await this.open();
    }
  }
}
