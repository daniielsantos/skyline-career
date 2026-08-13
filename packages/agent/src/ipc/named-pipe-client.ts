import { createConnection, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { IpcMethod, IpcRequest, IpcResponse } from './types.js';
import { IpcClientError } from './types.js';

// Optional debug hook — career-ui sets this to persist pipe events.
let pipeDebugLog:
  | ((message: string, data?: Record<string, unknown>) => void)
  | null = null;

export function setNamedPipeDebugLog(
  fn: ((message: string, data?: Record<string, unknown>) => void) | null,
): void {
  pipeDebugLog = fn;
}

function dbg(message: string, data?: Record<string, unknown>): void {
  try {
    pipeDebugLog?.(message, data);
  } catch {
    /* ignore */
  }
}

export interface NamedPipeClientOptions {
  pipeName?: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
}

type Pending = {
  resolve: (value: IpcResponse) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

/**
 * NDJSON client for \\\\.\\pipe\\&lt;name&gt;
 */
export class NamedPipeClient {
  private readonly pipePath: string;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private socket: Socket | null = null;
  private buffer = '';
  private readonly pending = new Map<string, Pending>();
  /** Serialize writes — concurrent call() was able to interleave NDJSON on the pipe. */
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: NamedPipeClientOptions = {}) {
    const pipeName = options.pipeName ?? process.env.MSFS_COMPAT_PIPE ?? 'msfs-compat-simbridge';
    this.pipePath = pipeName.startsWith('\\\\.\\pipe\\')
      ? pipeName
      : `\\\\.\\pipe\\${pipeName}`;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10000;
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      dbg('connect: already connected', { pipe: this.pipePath });
      return;
    }

    dbg('connect: opening', { pipe: this.pipePath });
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(this.pipePath);
      const timer = setTimeout(() => {
        socket.destroy();
        dbg('connect: timeout', { pipe: this.pipePath });
        reject(new IpcClientError('TIMEOUT', `Timed out connecting to ${this.pipePath}`));
      }, this.connectTimeoutMs);

      socket.once('connect', () => {
        clearTimeout(timer);
        this.socket = socket;
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => this.onData(chunk));
        socket.on('error', (err) => {
          dbg('socket error', { message: err.message });
          if (this.socket === socket) this.socket = null;
          this.failAll(err);
        });
        socket.on('close', () => {
          dbg('socket close', { pipe: this.pipePath });
          if (this.socket === socket) this.socket = null;
          this.failAll(new IpcClientError('NOT_CONNECTED', 'Pipe closed'));
        });
        dbg('connect: ok', { pipe: this.pipePath });
        resolve();
      });

      socket.once('error', (err) => {
        clearTimeout(timer);
        dbg('connect: error', { message: err.message });
        reject(new IpcClientError('NOT_CONNECTED', err.message));
      });
    });
  }

  async close(): Promise<void> {
    dbg('client.close', { wasConnected: this.isConnected });
    const socket = this.socket;
    this.socket = null;
    this.failAll(new IpcClientError('NOT_CONNECTED', 'Client closed'));
    if (socket && !socket.destroyed) {
      socket.destroy();
    }
  }

  async call<T = unknown>(
    method: IpcMethod,
    params: Record<string, unknown> = {},
    timeoutMs?: number,
  ): Promise<T> {
    const run = async (): Promise<T> => {
      if (!this.isConnected || !this.socket) {
        dbg('call: NOT_CONNECTED', { method });
        throw new IpcClientError('NOT_CONNECTED', 'Named pipe client is not connected');
      }

      const id = randomUUID();
      const request: IpcRequest = { id, type: 'request', method, params };
      const waitMs = timeoutMs ?? this.requestTimeoutMs;

      const response = await new Promise<IpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new IpcClientError('TIMEOUT', `Request timed out: ${method}`));
        }, waitMs);

        this.pending.set(id, { resolve, reject, timer });
        this.socket!.write(`${JSON.stringify(request)}\n`);
      });

      if (!response.ok) {
        throw new IpcClientError(
          response.error?.code ?? 'INTERNAL',
          response.error?.message ?? 'Unknown IPC error',
        );
      }

      return response.result as T;
    };

    const queued = this.writeChain.then(run, run);
    this.writeChain = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');

    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);

      if (line) {
        this.handleLine(line);
      }

      newline = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let message: IpcResponse;
    try {
      message = JSON.parse(line) as IpcResponse;
    } catch {
      return;
    }

    if (message.type !== 'response' || !message.id) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    pending.resolve(message);
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
