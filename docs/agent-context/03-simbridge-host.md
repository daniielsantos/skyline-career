# SimBridge Host / PIPE CLOSED

## Waiting for Preflight com pipe em rajada (2026-09-30)

**Sintoma:** OFP gerado com o 777F ainda fora do solo; Dispatch fica em `Waiting for Preflight` / `Reading “777F”…` e não abre o card. Parece SimConnect morto.

**Causa:** SimConnect não travou. Host 0.3.403 (`SunRise`) sem `TIMEOUT`, sem `0xC00000B0`, sem `timeout storm`. `exception=7` só no boot (NAME_UNRECOGNIZED num índice do batch — sessão segue). Voo anterior `jeta_589` fez settle às 01:20Z e o Watch fechou o pipe. Às 01:23Z o pipe passa a abrir e fechar várias vezes por segundo (sessões de ~30–200 ms — probe, não um sample de fuel/payload). Probe ao vivo responde: `connected`, título `777F`, `onGround: true`, motores off, GS ~0. O card “Waiting for Preflight” **não é** o flag de solo: a copy de airborne não apareceu, então a UI já sabe que está no chão. O texto só troca quando `POST /api/preflight` grava `lastPreflightCheck`. O poll de 1,5 s existe, mas `inFlight` ignora o tick seguinte enquanto a chamada não volta, e a rajada fecha o pipe antes do sample pesado terminar. Por isso pousar não muda essa linha.

**Fix (código, ainda não no app instalado):** o efeito de Preflight guardava `inFlight` local e, ao remontar (`onGround`), marcava `cancelled` e descartava o sample. Cada remount abria outro pipe. Agora uma só `POST /api/preflight` por missão (ref que sobrevive ao remount); o resultado grava mesmo se o efeito limpou; abort do cliente em 20s. Servidor recusa um segundo sample com 409 (`preflight_active`) sem abrir outro client; SimBrief resolve antes do gate; leitura no pipe corta em 20s e solta o gate. Probe de status não reabre o pipe com menos de 7s entre chamadas, e corta em 8s. 409 / timeout / abort não viram erro sticky no card — o retry de 1,5 s continua. Este voo já preso: fechar e abrir o Airframe no solo (o processo velho não tem o patch). Não matar `SimBridgeHost.exe` no caminho quente.

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

### En route lento pós-takeoff (2026-09-20)

**Sintoma:** wheels-up no MSFS, Dispatch demora a sair de Ready → En route.
**Causa:** auto-depart só pintava `missionStatus=in_flight` **depois** do `withCareerWrite` (fila do world lock / pulse). UI espelhava só esse status.
**Fix:** no wheels-up, setar `missionStatus=in_flight` + `lastEvent=depart` e yield ~150ms (como Settling) **antes** do persist; pular `persistAirborneClock` no mesmo tick do depart (o write já grava o stamp). UI também trata `lastEvent=depart` como En route.

### Waiting for Preflight lento (2026-09-20)

**Sintoma:** Load inject mostra título live (“Reading …”) mas o card Preflight demora (às vezes ~15s+).
**Causa:** (1) `/api/preflight` lia originCoords com `withCareerRead` (world lock atrás do pulse); (2) SimBrief OFP serializado antes do pipe open; (3) UI retentava a cada 5s no bootstrap.
**Fix:** coords via `withCareerPeekRead`; poll bootstrap 1.5s até `lastPreflightCheck`, depois 5s. O OFP em paralelo *dentro* do gate segurava o pipe durante o SimBrief — revertido em 2026-09-30 (OFP antes do gate). Ver a seção do topo.

### RECONNECTING no rodapé a cada minuto (2026-09-26)

**Sintoma:** em voo (KMIA→KFLL, `msn_demand_3298`), o rodapé fica RECONNECTING por alguns segundos, sempre no segundo :43. Sim não caiu; fuel/fase/pipe estavam saudáveis no tick anterior (`phase: climb`, `lastError: null`).

**Causa:** um segundo cliente da UI (aba em background em `127.0.0.1:8788`, missão antiga `msn_demand_3294` ainda no estado local) manda `POST /api/watch/start` ~1×/min — timer de background do browser. `start()` de missão diferente faz `stop({ fromStart: true })` na missão ao vivo, fecha o pipe, e o cliente do voo reabre em ~5s. Log: `stop` 3298 → `start joined — already starting` 3294 → `client.close` → `start` 3298. Não é SimConnect exception 7 nem pause do sim (`playback freeze` / `paused: true` é o sim pausado; o relógio absoluto continua).

**Fix imediato:** fechar a aba extra. Depois de fechar, o ciclo parou (último `stop` 02:26:20Z; tick 02:28Z ainda em 3298, `pipeConnected: true`, sem `stop` no :43 seguinte). Endurecer depois (não feito): `start()` não deve derrubar um Watch `in_flight` com pipe ok só porque outro cliente pediu outra missão.

## Hot-swap (dev)

Build Release → copiar `SimBridgeHost.dll` (+ exe/pdb) para  
`%LOCALAPPDATA%\Programs\Skyline Career\resources\host\`  
(depois de matar o processo Host / fechar o app).
