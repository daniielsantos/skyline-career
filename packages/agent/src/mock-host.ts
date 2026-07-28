#!/usr/bin/env node
/**
 * Node mock SimBridge host — same NDJSON Named Pipe protocol as the C# host.
 * Used when the .NET SDK is unavailable, or for fast TS-only iteration.
 */
import { createServer, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';

const pipeName = (() => {
  const idx = process.argv.indexOf('--pipe');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.MSFS_COMPAT_PIPE ?? 'msfs-compat-simbridge';
})();

const pipePath = pipeName.startsWith('\\\\.\\pipe\\') ? pipeName : `\\\\.\\pipe\\${pipeName}`;

type Snapshot = {
  onGround: boolean;
  enginesRunning: boolean;
  parkingBrake: boolean;
  paused: boolean;
  slewActive: boolean;
  simRate: number;
  cgPercent: number;
  grossWeightLb: number;
  fuelTotal: number;
  payloadTotal: number;
  vars: Record<string, number>;
};

const simVars = new Map<string, number>();
let connected = false;

function key(name: string, unit: string) {
  return `${name}|${unit}`.toLowerCase();
}

function get(name: string, unit: string) {
  return simVars.get(key(name, unit)) ?? 0;
}

function set(name: string, unit: string, value: number) {
  simVars.set(key(name, unit), value);
}

function seed() {
  set('SIM ON GROUND', 'Bool', 1);
  set('BRAKE PARKING POSITION', 'Bool', 1);
  set('ENG COMBUSTION:1', 'Bool', 0);
  set('IS PAUSED', 'Bool', 0);
  set('IS SLEW ACTIVE', 'Bool', 0);
  set('SIMULATION RATE', 'Number', 1);
  set('CG PERCENT', 'Percent over 100', 28);
  set('TOTAL WEIGHT', 'pounds', 2300);
  set('FUEL TANK LEFT MAIN QUANTITY', 'gallons', 20);
  set('FUEL TANK RIGHT MAIN QUANTITY', 'gallons', 20);
  set('FUEL TOTAL QUANTITY', 'gallons', 40);
  for (let i = 1; i <= 5; i++) set(`PAYLOAD STATION WEIGHT:${i}`, 'pounds', i === 1 ? 170 : i === 5 ? 30 : 0);
  set('TOTAL PAYLOAD WEIGHT', 'pounds', 200);
}

function syncDerived(name: string) {
  if (name.toUpperCase().includes('FUEL')) {
    const left = get('FUEL TANK LEFT MAIN QUANTITY', 'gallons');
    const right = get('FUEL TANK RIGHT MAIN QUANTITY', 'gallons');
    set('FUEL TOTAL QUANTITY', 'gallons', left + right);
  }
  if (name.toUpperCase().includes('PAYLOAD')) {
    let payload = 0;
    for (let i = 1; i <= 5; i++) payload += get(`PAYLOAD STATION WEIGHT:${i}`, 'pounds');
    set('TOTAL PAYLOAD WEIGHT', 'pounds', payload);
  }
}

function snapshot(): Snapshot {
  const left = get('FUEL TANK LEFT MAIN QUANTITY', 'gallons');
  const right = get('FUEL TANK RIGHT MAIN QUANTITY', 'gallons');
  let payload = 0;
  for (let i = 1; i <= 5; i++) payload += get(`PAYLOAD STATION WEIGHT:${i}`, 'pounds');

  return {
    onGround: get('SIM ON GROUND', 'Bool') > 0.5,
    enginesRunning: get('ENG COMBUSTION:1', 'Bool') > 0.5,
    parkingBrake: get('BRAKE PARKING POSITION', 'Bool') > 0.5,
    paused: get('IS PAUSED', 'Bool') > 0.5,
    slewActive: get('IS SLEW ACTIVE', 'Bool') > 0.5,
    simRate: get('SIMULATION RATE', 'Number'),
    cgPercent: get('CG PERCENT', 'Percent over 100'),
    grossWeightLb: get('TOTAL WEIGHT', 'pounds'),
    fuelTotal: left + right,
    payloadTotal: payload,
    vars: {
      'FUEL TANK LEFT MAIN QUANTITY': left,
      'FUEL TANK RIGHT MAIN QUANTITY': right,
      'FUEL TOTAL QUANTITY': left + right,
      'TOTAL PAYLOAD WEIGHT': payload,
      'CG PERCENT': get('CG PERCENT', 'Percent over 100'),
    },
  };
}

function ok(id: string, result: unknown) {
  return JSON.stringify({ id, type: 'response', ok: true, result });
}

function fail(id: string, code: string, message: string) {
  return JSON.stringify({ id, type: 'response', ok: false, error: { code, message } });
}

function ensureConnected(id: string): string | null {
  if (!connected) return fail(id, 'NOT_CONNECTED', 'Mock sim client is not connected');
  return null;
}

async function dispatch(msg: { id?: string; method?: string; params?: Record<string, unknown> }): Promise<string> {
  const id = msg.id ?? randomUUID();
  const method = msg.method ?? '';
  const params = msg.params ?? {};

  switch (method) {
    case 'ping':
      return ok(id, { pong: true, mode: 'mock', connected });
    case 'connect':
      connected = true;
      return ok(id, { connected: true, mode: 'mock' });
    case 'disconnect':
      connected = false;
      return ok(id, { connected: false });
    case 'status':
      return ok(id, {
        mode: 'mock',
        connected,
        aircraftTitle: connected ? 'Cessna 172 Skyhawk G1000' : undefined,
      });
    case 'readSimVar': {
      const err = ensureConnected(id);
      if (err) return err;
      return ok(id, { value: get(String(params.name), String(params.unit)) });
    }
    case 'writeSimVar': {
      const err = ensureConnected(id);
      if (err) return err;
      set(String(params.name), String(params.unit), Number(params.value));
      syncDerived(String(params.name));
      return ok(id, {});
    }
    case 'readLVar': {
      const err = ensureConnected(id);
      if (err) return err;
      return ok(id, { value: 0 });
    }
    case 'writeLVar':
    case 'triggerHVar':
    case 'triggerEvent': {
      const err = ensureConnected(id);
      if (err) return err;
      return ok(id, {});
    }
    case 'snapshot': {
      const err = ensureConnected(id);
      if (err) return err;
      return ok(id, snapshot());
    }
    case 'delay': {
      const err = ensureConnected(id);
      if (err) return err;
      await new Promise((r) => setTimeout(r, Number(params.ms ?? 0)));
      return ok(id, {});
    }
    case 'getAircraftIdentity': {
      const err = ensureConnected(id);
      if (err) return err;
      return ok(id, {
        title: 'Cessna 172 Skyhawk G1000',
        atcModel: 'C172',
        atcType: 'Cessna',
        icao: 'C172',
      });
    }
    default:
      return fail(id, 'UNSUPPORTED', `Unknown method: ${method}`);
  }
}

seed();
connected = true;

const server = createServer((socket: Socket) => {
  console.log('[mock-host] client connected');
  let buffer = '';
  socket.setEncoding('utf8');

  socket.on('data', async (chunk: string) => {
    buffer += chunk;
    let idx = buffer.indexOf('\n');
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) {
        try {
          const msg = JSON.parse(line) as { id?: string; method?: string; params?: Record<string, unknown> };
          const response = await dispatch(msg);
          socket.write(`${response}\n`);
        } catch (error) {
          socket.write(
            `${fail('unknown', 'INTERNAL', error instanceof Error ? error.message : String(error))}\n`,
          );
        }
      }
      idx = buffer.indexOf('\n');
    }
  });

  socket.on('close', () => console.log('[mock-host] client disconnected'));
});

server.listen(pipePath, () => {
  console.log(`[mock-host] listening on ${pipePath}`);
});

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
