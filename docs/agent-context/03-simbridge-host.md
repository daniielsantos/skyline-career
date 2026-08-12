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

Arquivo: `native/SimBridgeHost/Sim/SimConnectClient.cs`

## Diagnóstico rápido

```
%APPDATA%\Skyline Career\logs\simbridge-host.log
%APPDATA%\Skyline Career\career\watch-debug.log
```

Sinais:

- `UNRECOGNIZED_ID` + `0xC00000B0` → sessão SimConnect morta.
- Após 0.3.17 deve aparecer algo como `session dropped — next client connect() will reopen`.
- Watch tick error `0xC00000B0` com pipe “ok” = Host zumbi (pré-fix) ou MSFS/sair do voo.

## Hot-swap (dev)

Build Release → copiar `SimBridgeHost.dll` (+ exe/pdb) para  
`%LOCALAPPDATA%\Programs\Skyline Career\resources\host\`  
(depois de matar o processo Host / fechar o app).
