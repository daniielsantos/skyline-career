# SimBridge IPC Protocol (v1)

Newline-delimited JSON (NDJSON) over a Windows Named Pipe.

## Endpoint

```
\\.\pipe\msfs-compat-simbridge
```

Override with env `MSFS_COMPAT_PIPE` or host flag `--pipe <name>`.

## Framing

- One JSON object per line, UTF-8, terminated by `\n`
- Request/response correlated by `id` (UUID string)
- Host may push unsolicited events with `"type":"event"` (no response expected)

## Request envelope

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "request",
  "method": "snapshot",
  "params": {}
}
```

## Response envelope

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "response",
  "ok": true,
  "result": {}
}
```

Error:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "response",
  "ok": false,
  "error": {
    "code": "NOT_CONNECTED",
    "message": "SimConnect is not connected"
  }
}
```

## Methods

| Method | Params | Result |
|--------|--------|--------|
| `ping` | `{}` | `{ "pong": true, "mode": "mock\|simconnect", "connected": bool }` |
| `connect` | `{ "appName"?: string }` | `{ "connected": bool, "mode": string }` |
| `disconnect` | `{}` | `{ "connected": false }` |
| `status` | `{}` | `{ "mode": string, "connected": bool, "aircraftTitle"?: string }` |
| `readSimVar` | `{ "name": string, "unit": string }` | `{ "value": number }` |
| `writeSimVar` | `{ "name": string, "unit": string, "value": number }` | `{}` |
| `readLVar` | `{ "name": string }` | `{ "value": number }` |
| `writeLVar` | `{ "name": string, "value": number }` | `{}` |
| `triggerHVar` | `{ "name": string }` | `{}` |
| `triggerEvent` | `{ "event": string, "data"?: number }` | `{}` |
| `snapshot` | `{}` | `SimSnapshot` |
| `delay` | `{ "ms": number }` | `{}` |
| `getAircraftIdentity` | `{}` | identity fields used for fingerprinting |

## SimSnapshot

```json
{
  "onGround": true,
  "enginesRunning": false,
  "parkingBrake": true,
  "paused": false,
  "slewActive": false,
  "simRate": 1.0,
  "cgPercent": 28.5,
  "grossWeightLb": 2300,
  "fuelTotal": 40,
  "payloadTotal": 230,
  "vars": {
    "FUEL TOTAL QUANTITY": 40
  }
}
```

## Error codes

- `NOT_CONNECTED`
- `UNSUPPORTED`
- `INVALID_PARAMS`
- `SIM_ERROR`
- `TIMEOUT`
- `INTERNAL`
