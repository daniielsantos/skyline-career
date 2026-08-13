# Inject freeze / DR400 notes

## Sintoma

Skyline inject fica em **Writing…** / "Building fuel…" sem sair. DR400 (e outros) afetados quando SimConnect está doente.

## Bug visual do toggle (0.3.18+)

Durante o inject, live fuel/payload podiam bater Due no meio do ramp → header **PREFLIGHT READY** enquanto ainda Writing; o knob usava só `skylineInjectEnabled` e ia para Off no fim do HTTP parecendo cancel mid-payload.

Fix: enquanto `loadOfpAutoStatus === 'loading'` → header **INJECTING LOAD**; switch On se `enabled || loading`; após sucesso label **Done**.

## O que os logs mostraram (DR400 KMCO→KMIA)

1. Primeiro inject **completou** (`inject end ok`) — tanque CENTER 29 gal ≈ 174 lb avgas.
2. Re-inject após drenar: `begin` → **~2 min** até `plan ready` (timeouts IPC de 60s × leituras mortas).
3. Fuel ramp 4 rounds com `liveFuelLb: null` (reads falhando; writes skipVerify “ok”).
4. Host spam `UNRECOGNIZED_ID` / exception 11 — sessão SimConnect instável.
5. UI fica em loading até o POST `/api/load-ofp` retornar (sem deadline antigo).

DR400 profile: 1 tanque CENTER 29 gal; writePlan delay era 1000 ms (agora 400).

## Mitigações no código

- Progresso: "Fetching SimBrief…", "Connecting…", "Reading aircraft…"
- IPC inject timeout **15s** (era 60s)
- Budget total inject **180s** → `OfpLoadTimedOutError` com mensagem clara
- DR400 fuel delay 1000→400 ms
- **Baron / AUX idle (pós-0.3.19):** fuel rounds pintam a UI com o **target escrito**
  imediatamente; `readLiveTanks` só no round final. `omitFuelTankWrites` pula AUX/TIP
  ociosos (live≈0 e target≈0). Payload: se live stations colapsam para 0, confia no
  write (não entra em ghost-prune). Causa observada: ~20s/round em `readLiveTanks`
  + `UNRECOGNIZED_ID` após writes AUX=0.

## Reinject freeze after EFB unload (local)

Watch `stop()` closed the pipe while `tickInFlight` still ran `sampleLiveLoadLb`.
Inject then opened a second client and froze on **Reading live aircraft +
building load plan…**. `stop()` now waits up to 8s for the tick to finish.

On the ramp, Watch uses raw L/R tanks (no pickStable / sticky hold) so EFB
fuel-tank edits paint.

Reinject also froze on **Reading live aircraft + building load plan…**:
`resolveLiveAircraft` probed 8× FUELSYSTEM capacity (15s each) + catalog HTTP.
Inject now matches the local homologated profile by title (no structure
sample). Planning tank/station reads use 2.5s IPC. Watch `stop` waits 25s
and `sampleLiveLoadLb` aborts mid-loop when stop starts.

Reinject then froze on **Crew seeded — placing cargo +50 lb per seat…**:
each cargo round started with `readLiveCgState` + `readLiveStations`
(15s IPC). While cargo remains, fill is **equal +50** with no live CG/station
reads (trust the write). CG is read only after cargo is placed.

## Verify hang after reinject

Após unload+reinject o POST congelava em **Verifying load after N CG shift(s)**
(`compareOnce` + `runMissionPreflight`, IPC 15s). Fuel/payload já verdes.
Agora skip — Watch confirma Loaded vs Due.

## Caravan fill (v0.3.9 vs v0.3.10)

Última inject boa: **v0.3.9**. v0.3.10 mudou bias para “toward center”
(C408) → Caravan enche S7–S11 depois S3–S6. Restore local: envelope →
**equal** (todas as stations juntas). C408 CG fica para depois.

## Reinject freeze after EFB drain (Watch.stop)

POST `/api/load-ofp` esperava o tick (até 25s, 16 stations) **antes** de `inject begin`.
UI em INJECTING LOAD sem mensagem. Agora: marca inject active + progress
“Stopping Watch…”, `stop()` espera ≤1.5s e fecha o pipe (IPC in-flight falha).

## Host zumbi (pós-0.3.17)

Pipe up + SimConnect morto: ping antigo dizia `connected=true`, Watch nunca chamava `connect()`. Host agora tear-down em timeout/UNRECOGNIZED_ID storm; ping expõe `sessionHealthy`. Watch/inject reabrem a sessão no tick/`open()` seguinte. Recovery **não** depende de probe `FUELSYSTEM` nem de matar o exe.

## Idle Watch: UI freeze ~75s

Timeout é o **código IPC `TIMEOUT`** (Host `SimClientException` +
`IpcClientError.code`), nunca regex na message. lastError persiste
`TIMEOUT: …`. 1º miss aborta o loop de stations; next tick `resetSession`.

## Idle Watch: TIMEOUT mata detect de payload

Fuel lê ok (zera `_consecutiveTimeouts`) → 1 station TIMEOUT → sample
incompleto swallowed → tick sucesso. Host nunca chega a 3. Watch ping
continua healthy. Payload gruda no mapa anterior.

Fix: `sessionDied` ou ping `consecutiveTimeouts>0` → `open({ resetSession: true })`
no tick seguinte. Incomplete ainda não persiste crew-only.

## Idle Watch: schematic só Crew

Depois de ocioso, 3× TIMEOUT no loop de 16 stations derruba a sessão no meio.
O mapa `{1:170,2:170}` persistia; UI pinta S3+ como 0. Agora sample incompleto
não grava stations/payload — mantém o schematic anterior. Unload real precisa
das 16 keys com zeros explícitos.

Accu-Sim EFB (Pax 6/8, cargo pods) ≠ `PAYLOAD STATION WEIGHT`. Não detectar
via layout de stations.

## Workaround imediato (install atual)

1. Toggle inject **Off** (cancela).
2. Fechar Skyline + matar `SimBridgeHost` se necessário; reabrir com MSFS no solo.
3. Preferir desktop **≥ 0.3.17** (PIPE CLOSED). Hang mole / ping honesto precisa do Host **0.3.21+** (hot-swap `resources/host`).
4. Se voltar a congelar: Continue manually / EFB load.
