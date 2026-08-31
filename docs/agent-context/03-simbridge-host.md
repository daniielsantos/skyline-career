# SimBridge Host / PIPE CLOSED

## Arquitetura

- Desktop sobe `SimBridgeHost.exe` (named pipe `msfs-compat-simbridge`).
- Career Watch + probes + inject usam `NamedPipeSimBridge`.
- Gate Node: `packages/career-ui/server/simbridge-gate.ts` (`withSimBridgeExclusive`) — reduz thrash de open/close.
- Host ainda permite **múltiplos** clients IPC no mesmo `SimConnectClient`.

## Falha observada (pré-0.3.17)

1. Spam `exception=3 UNRECOGNIZED_ID` (muitas vezes por `ClearDataDefinition` pós read/write).
2. `ReceiveMessage error: 0xC00000B0`.
3. Host **aceitava pipe** mas SimConnect ficava morto (`ConnectAsync` early-return se `_sim != null`).
4. Watch: `RECONNECTING…` / `PIPE CLOSED — retry in Ns` em loop.
5. Dual `[ipc] client connected` logo antes do die (Watch + probe/preflight).

## Fix em 0.3.17 (`SimConnectClient.cs`)

- **Não** chamar `ClearDataDefinition` após read/write dinâmicos (IDs monotônicos até reconnect).
- `SemaphoreSlim _simOpGate` serializa read/write entre clients.
- Em falha de `ReceiveMessage`: `TearDownAfterRecvFailure()` — dispose, `IsConnected=false`, pending → `NOT_CONNECTED`.
- `ConnectAsync` junta loop antigo e **reabre** sessão se handle estiver morto; reset `_nextDefId` / `_nextReqId`.

## Hang mole + ping honesto (Host 0.3.21+)

`ReceiveMessage` às vezes **não throwa** — pending cai em `TIMEOUT`, pipe continua up, `IsConnected` interno ainda true. Watch só reabria o pipe, nunca `connect()`.

- `_lastHealthyRecvUtc` em `OnRecvOpen` / dados úteis. Idle sem TIMEOUT continua healthy; recv &gt;8s só conta se já há TIMEOUTs (hang mole).
- 5× `UNRECOGNIZED_ID` seguidos ou 3× `TIMEOUT` sem recv → `TearDownAfterRecvFailure` (log `unrecognized_id storm` / `timeout storm`).
- IPC ping/status: `sessionHealthy`, `lastRecvAgeMs`, `consecutiveTimeouts`. `ConnectAsync` **não** early-return se a sessão estiver doente.
- Watch: código IPC `TIMEOUT` / `sessionHealthy===false` → backoff + `open()` no tick seguinte (IPC `connect()`). Não reabrir no handler de erro. Host velho sem os campos = comportamento anterior.
- Inject **manda** na sessão: `open({ resetSession: true })` faz IPC `disconnect` + `connect` (SimConnect novo, IDs zerados). Pipe e `SimBridgeHost.exe` ficam vivos.
- **Não** matar `SimBridgeHost.exe` no caminho quente. **Não** voltar probe `FUELSYSTEM TANK CAPACITY` no inject.
- IPC `readSimVars` (0.3.22+): um `RequestDataOnSimObject` para ≤32 FLOAT64 (pad 8/16/24/32, slots extra = `SIM ON GROUND`). Sem `ClearDataDefinition`. Watch **e** inject/preflight usam isso. Host antigo responde `UNSUPPORTED` → Node lê sequential. TIMEOUT ainda throw. Listas >32 são fatiadas.
- **Def cache (pós-0.3.24):** batches/singles idênticos reusam o mesmo `AddToDataDefinition` até `ConnectAsync` / tear-down. Log `cached batch def id=…`. Ainda sem `ClearDataDefinition`.
- **MSFS quit:** `OnRecvQuit` faz `TearDownAfterRecvFailure` (dispose handle, zera cache). Watch espera 8s → 15s em `NOT_CONNECTED` / open-fail e tenta de novo quando o sim voltar. TIMEOUT hang-mole continua 2s→20s. Dual-client IPC **não** mudou.
- **Open-fail UX (2026-08-31):** Host não anexa HRESULT; mensagem curta `MSFS not connected — start MSFS 2024 and load a flight.` Node `sanitizeSimBridgeUserMessage` / `formatIpcError` colapsa builds antigos com `Details: Error HRESULT E_FAIL…` no footer.
- **Pack:** `pack-desktop` **falha** se `dotnet build` do Host falhar (exe locked / bin stale). Não copia `bin/Release` velho. Feche `start:local` antes de `release:desktop`.

Arquivo: `native/SimBridgeHost/Sim/SimConnectClient.cs`

## Diagnóstico rápido

```
%APPDATA%\Skyline Career\logs\simbridge-host.log
%APPDATA%\Skyline Career\career\watch-debug.log
```

Sinais:

- `UNRECOGNIZED_ID` + `0xC00000B0` → sessão SimConnect morta.
- Após 0.3.17 deve aparecer algo como `session dropped — next client connect() will reopen`.
- `timeout storm` / `unrecognized_id storm` → tear-down do hang mole (0.3.21+).
- Watch tick error `0xC00000B0` ou `TIMEOUT` com pipe “ok” = Host zumbi; ping deve mostrar `sessionHealthy=false`.

## Hot-swap (dev)

Build Release → copiar `SimBridgeHost.dll` (+ exe/pdb) para  
`%LOCALAPPDATA%\Programs\Skyline Career\resources\host\`  
(depois de matar o processo Host / fechar o app).
