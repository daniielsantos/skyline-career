import type {
  EventTriggerRequest,
  LVarWriteRequest,
  SimBridge,
  SimSnapshot,
  SimVarReadRequest,
  SimVarWriteRequest,
} from '@msfs-compat/runtime';
import {
  NamedPipeClient,
  setNamedPipeDebugLog,
  type NamedPipeClientOptions,
} from './ipc/named-pipe-client.js';
import { IpcClientError } from './ipc/types.js';
import {
  simIpcSessionDied,
  type SimBridgeSessionPing,
} from './sim-session-health.js';

export { setNamedPipeDebugLog };

/** Host ReadSimVarsAsync pads to 8/16/24/32 FLOAT64. */
export const READ_SIMVARS_MAX = 32;

/**
 * SimBridge implementation that talks to the C# SimBridgeHost over Named Pipe IPC.
 */
export class NamedPipeSimBridge implements SimBridge {
  private readonly client: NamedPipeClient;
  private autoConnected = false;

  constructor(options: NamedPipeClientOptions = {}) {
    this.client = new NamedPipeClient(options);
  }

  async open(
    appName = 'MSFS Compat Agent',
    options: { resetSession?: boolean } = {},
  ): Promise<void> {
    await this.client.connect();
    if (options.resetSession) {
      // Drop the shared SimConnect handle and open a new one (IDs, recv loop,
      // pending). Pipe stays up — do not kill SimBridgeHost.exe.
      try {
        await this.client.call('disconnect');
      } catch {
        /* no live session */
      }
    }
    await this.client.call('connect', { appName });
    this.autoConnected = true;
  }

  /**
   * Close this IPC client. Short-lived readers can keep the host's shared
   * SimConnect session alive so they do not interrupt Watch or the next step.
   */
  async close(options: { disconnectHost?: boolean } = {}): Promise<void> {
    if (options.disconnectHost !== false && this.client.isConnected) {
      try {
        await this.client.call('disconnect');
      } catch {
        // ignore disconnect errors on shutdown
      }
    }
    await this.client.close();
    this.autoConnected = false;
  }

  async ping(
    timeoutMs?: number,
  ): Promise<SimBridgeSessionPing & { pong: boolean; mode: string }> {
    await this.ensureOpen();
    return this.client.call('ping', {}, timeoutMs);
  }

  async status(): Promise<SimBridgeSessionPing> {
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

  /** MSFS scenery airport by ICAO (Facilities) — sim must be connected; no need to be at the field. */
  async getAirportFacility(
    icao: string,
    opts?: { timeoutMs?: number },
  ): Promise<{
    icao: string;
    region?: string;
    name?: string;
    lat: number;
    lon: number;
    altMeters?: number;
    runways?: Array<{
      ident: string;
      identReciprocal?: string;
      headingTrueDeg: number;
      lengthM: number;
      widthM: number;
      lat: number;
      lon: number;
      surface?: string;
    }>;
  }> {
    await this.ensureOpen();
    return this.client.call(
      'getAirportFacility',
      { icao },
      opts?.timeoutMs,
    );
  }

  async readSimVar(
    request: SimVarReadRequest,
    timeoutMs?: number,
  ): Promise<number> {
    await this.ensureOpen();
    const result = await this.client.call<{ value: number }>(
      'readSimVar',
      {
        name: request.name,
        unit: request.unit,
      },
      timeoutMs,
    );
    return result.value;
  }

  /**
   * One Host SimConnect definition for many FLOAT64 vars (≤32 per request).
   * Longer lists are chunked. Old hosts without readSimVars fall back to
   * sequential reads; TIMEOUT still throws.
   */
  async readSimVars(
    requests: SimVarReadRequest[],
    timeoutMs?: number,
  ): Promise<number[]> {
    await this.ensureOpen();
    if (requests.length === 0) return [];
    if (requests.length > READ_SIMVARS_MAX) {
      const out: number[] = [];
      for (let i = 0; i < requests.length; i += READ_SIMVARS_MAX) {
        out.push(
          ...(await this.readSimVarsChunk(
            requests.slice(i, i + READ_SIMVARS_MAX),
            timeoutMs,
          )),
        );
      }
      return out;
    }
    return this.readSimVarsChunk(requests, timeoutMs);
  }

  private async readSimVarsChunk(
    requests: SimVarReadRequest[],
    timeoutMs?: number,
  ): Promise<number[]> {
    try {
      const result = await this.client.call<{ values: number[] }>(
        'readSimVars',
        {
          vars: requests.map((r) => ({ name: r.name, unit: r.unit })),
        },
        timeoutMs,
      );
      if (!Array.isArray(result.values) || result.values.length !== requests.length) {
        throw new IpcClientError(
          'SIM_ERROR',
          'readSimVars returned unexpected length',
        );
      }
      return result.values;
    } catch (err) {
      if (
        err instanceof IpcClientError &&
        (err.code === 'UNSUPPORTED' ||
          /Unknown method:\s*readSimVars/i.test(err.message))
      ) {
        return this.readSimVarsSequential(requests, timeoutMs);
      }
      throw err;
    }
  }

  private async readSimVarsSequential(
    requests: SimVarReadRequest[],
    timeoutMs?: number,
  ): Promise<number[]> {
    const values: number[] = [];
    for (const request of requests) {
      try {
        values.push(await this.readSimVar(request, timeoutMs));
      } catch (err) {
        if (simIpcSessionDied(err)) throw err;
        values.push(Number.NaN);
      }
    }
    return values;
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
    // Local sleep only — never round-trip through the named pipe. IPC delays
    // held the SimBridge Host busy and contributed to mid-inject disconnects
    // (STATUS_PIPE_DISCONNECTED / 0xC00000B0) under multi-step OFP loads.
    if (ms > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }
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
    /** `event` = TransmitClientEvent; `control` = NG3 SetClientData; `rotor` = 777 ROTOR_BRAKE */
    method?: 'event' | 'control' | 'rotor';
    /** Captain (left) or FO (right) CDU — GSX uses right. */
    cdu?: 'left' | 'right';
    /** `ng3` (737) or `777` (77X SDK event IDs). Default ng3. */
    cduFamily?: 'ng3' | '777';
    /** Keep key pressed before release/clear (ms). */
    holdMs?: number;
  }): Promise<{
    ok: boolean;
    eventId: number;
    parameter: number;
    release?: boolean;
    method?: string;
    cdu?: string;
    holdMs?: number | null;
  }> {
    await this.ensureOpen();
    return this.client.call('sendPmdgNg3Control', {
      ...(opts.eventId !== undefined ? { eventId: opts.eventId } : {}),
      ...(opts.key !== undefined ? { key: opts.key } : {}),
      ...(opts.parameter !== undefined ? { parameter: opts.parameter } : {}),
      ...(opts.release !== undefined ? { release: opts.release } : {}),
      ...(opts.method !== undefined ? { method: opts.method } : {}),
      ...(opts.cdu !== undefined ? { cdu: opts.cdu } : {}),
      ...(opts.cduFamily !== undefined ? { cduFamily: opts.cduFamily } : {}),
      ...(opts.holdMs !== undefined ? { holdMs: opts.holdMs } : {}),
    });
  }

  private async ensureOpen(): Promise<void> {
    // Pipe can drop (0xC00000B0 / host recycle) while autoConnected stays true.
    // Always re-open when the socket is gone so Watch ticks keep sampling load.
    if (this.client.isConnected && this.autoConnected) {
      return;
    }
    if (!this.client.isConnected) {
      this.autoConnected = false;
      try {
        await this.client.close();
      } catch {
        /* ignore */
      }
    }
    await this.open();
  }

  /** True when the NDJSON pipe socket is alive. */
  get isPipeConnected(): boolean {
    return this.client.isConnected;
  }
}
