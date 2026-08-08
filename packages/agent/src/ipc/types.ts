export type IpcMethod =
  | 'ping'
  | 'connect'
  | 'disconnect'
  | 'status'
  | 'readSimVar'
  | 'writeSimVar'
  | 'readLVar'
  | 'writeLVar'
  | 'triggerHVar'
  | 'triggerEvent'
  | 'snapshot'
  | 'delay'
  | 'getAircraftIdentity'
  | 'getAirportFacility'
  | 'readPmdgNg3Fuel'
  | 'sendPmdgNg3Control';

export interface IpcRequest {
  id: string;
  type: 'request';
  method: IpcMethod;
  params?: Record<string, unknown>;
}

export interface IpcErrorBody {
  code: string;
  message: string;
}

export interface IpcResponse {
  id: string;
  type: 'response';
  ok: boolean;
  result?: unknown;
  error?: IpcErrorBody;
}

export interface IpcEvent {
  type: 'event';
  event: string;
  payload?: Record<string, unknown>;
}

export class IpcClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'IpcClientError';
  }
}
