# Current state (2026-08-13)

## Desktop

| Versão | Tag | Notas |
|--------|-----|--------|
| **0.3.21** (latest) | [v0.3.21](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.21) | Hang mole / ping honesto / TIMEOUT por código IPC |
| 0.3.19 | [v0.3.19](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.19) | Inject permanece armed até o write terminar |
| 0.3.18 | [v0.3.18](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.18) | Taxi fuel cap 50% Due; inject timeout 15s/180s + progress; DR400 delay 400ms |
| 0.3.17 | [v0.3.17](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.17) | Host: recovery após `0xC00000B0`, sem ClearDataDefinition dinâmico, serialize ops |
| 0.3.16 | v0.3.16 | Clamp fuel OFP → tank capacity |

## Branch

`main` — handoff em `docs/agent-context/`.

## Local (ainda sem release)

- **Inject Caravan flicker / S7–S11 primeiro:** última release boa = **v0.3.9**.
  Quebrou em v0.3.10 (`2d73837`, C408 “CG toward center”). Restaurado:
  envelope→equal. Step 400 lb (C408) **não** vale em zona maxLoad 500 —
  Caravan voltou a +50 lb/station. Watch no solo amostra **todo tick**
  (EFB); App pinta station drift; inject Done faz `postWatchStart` na hora.
- **CG card no 1º open Dispatch:** o card só pintava se `view.cg` existisse.
  Preflight lia CG **depois** de `compareOnce` (IPC pesado) → `CG PERCENT`
  timeout → sem card. Agora lê CG **antes**; mostra envelope mesmo sem MAC
  live. Watch também persiste `cg` no tick de load.
- **EFB fuel/payload após 1º inject:** READY grudava no snapshot do inject.
  Causa: MB atrasado vs stations, density flicker sem olhar tanques, sticky
  da UI re-filtrando o Watch, persist só em total ±15 lb. Agora stations
  que andaram mandam no payload; tanques que andaram mandam no fuel;
  Watch pinta direto (sem sticky) no solo.
- **Só a 1ª edição EFB pintava:** o tick persistia e depois **esperava CG**
  (3 SimVars) com `tickInFlight` — ticks seguintes não rodavam. CG saiu do
  load tick. MB também não pode mais reverter o 1º sample no tick seguinte.
- **Reinject freeze + tanques:** `Watch.stop` fechava o pipe no meio do tick
  → inject travava em "Reading live aircraft…". Agora espera o tick. No solo
  L/R vêm do sample cru (EFB tank edits).
- **Reinject freeze em "placing cargo +50":** round lia CG + 16 stations
  antes do 1º write. Cargo fill agora é equal sem essas reads; CG só no fim.
- **Reinject freeze em "Reading live aircraft…":** fingerprint probe 8×
  FUELSYSTEM 15s + Watch tick ainda vivo. Inject resolve por título local;
  stop 25s + abort do sample.
- **Host zumbi (hang mole):** 0.3.17 só tear-down se `ReceiveMessage` throw.
  Agora Host admite sessão morta (5× UNRECOGNIZED_ID / 3× TIMEOUT; recv
  &gt;8s só conta se já há TIMEOUT — idle não mente). Ping expõe
  `sessionHealthy`. Watch reabre via IPC `connect()` após backoff — não
  mata o processo. Inject: um `open()` extra se o primeiro read falhar.
  Sem probe FUELSYSTEM.
- **Idle → schematic S1/S2 only:** Host 3× TIMEOUT no meio das 16 stations
  persiste mapa truncado; UI pinta keys faltando como 0. Sample incompleto
  agora descarta o mapa e mantém o anterior. Accu-Sim EFB (Pax/pods) **não**
  é `PAYLOAD STATION WEIGHT` — não detectar via layout.
- **TIMEOUT engole detect:** fuel `NoteHealthyRecv` zera o counter; station
  TIMEOUT era swallowed → tick “ok”, Host nunca storm, Watch nunca reabre.
  Agora `sessionDied` / `consecutiveTimeouts>0` faz IPC disconnect+connect
  no tick seguinte para voltar a ler payload.
- **Accu-Sim esvazia e Skyline não pinta:** fuel tanks atualizam; classic
  stations ficam no inject (ghost). Watch forçava station sum por cima do
  mass-balance. Agora MB (gross−empty−fuel) ganha quando o gross despenca;
  MB é lido **antes** do loop de 16 stations (sobrevive TIMEOUT).
- **WIP pós-0.3.21 (ainda sem release):** `sampleLiveFlight` não engole
  TIMEOUT — 1º miss marca `pendingSimConnectReset`. Solo: um IPC
  `readSimVars` (tanks + empty/gross + stations 1–16). Host velho
  (`UNSUPPORTED`) cai em sequential e ainda throw no 1º TIMEOUT.
  Precisa Host novo (hot-swap) para o batch.

## O que validar após 0.3.21

1. Inject não desarma cedo demais enquanto o write ainda corre.
2. Drenar fuel no EFB com OFP curto → Preflight **não** fica READY (taxi cap).
3. Inject com Host doente → falha ≤ ~3 min com mensagem, não Writing infinito.
4. Host **0.3.21+** (health ping) para recovery de hang mole / TIMEOUT; 0.3.17+ ainda cobre PIPE CLOSED.
