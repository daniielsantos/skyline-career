# Current state (2026-08-15)

## Desktop

| Versão | Tag | Notas |
|--------|-----|--------|
| **0.3.40** (latest) | [v0.3.40](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.40) | EN ROUTE: Aircraft/Origin alinhados; Cancel restilizado |
| **0.3.39** | [v0.3.39](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.39) | Fix tela EN ROUTE em branco (flex staging-panel) |
| **0.3.38** | [v0.3.38](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.38) | EN ROUTE: OFP/Cargo/live-load alinhados na mesma coluna |
| **0.3.37** | [v0.3.37](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.37) | Route header limpo; EN ROUTE side sem scroll |
| **0.3.36** | [v0.3.36](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.36) | Route header hubs coloridos; technical details colapsados |
| **0.3.35** | [v0.3.35](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.35) | EN ROUTE layout v2; footer fora do scroll; cruise burn kg/h |
| **0.3.34** | [v0.3.34](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.34) | EN ROUTE: capacity na seção Cargo; live load = preflight |
| **0.3.33** | [v0.3.33](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.33) | Dispatch EN ROUTE cockpit: mapa + live load sem scroll |
| **0.3.32** | [v0.3.32](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.32) | Status bar fixa + banners sem mission id |
| **0.3.31** | [v0.3.31](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.31) | SAVN → San Antonio Oeste; SAZN = Neuquén |
| **0.3.30** | [v0.3.30](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.30) | Freights: Load=lot total; Pay/Net primary sort; mercado aberto com frota |
| **0.3.29** | [v0.3.29](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.29) | Aerostar inject UI; BN2 Market; cargo ceilings |
| **0.3.28** | [v0.3.28](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.28) | light_ga `manualpayload`; Accept OFP em contract-pilot |
| **0.3.27** | [v0.3.27](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.27) | Origin gate + Accu-Sim CTRL+E notes |
| 0.3.24 | [v0.3.24](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.24) | Hybrid fill: equal first, then shift; leftover L/R |
| 0.3.23 | [v0.3.23](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.23) | Inject/preflight `readSimVars` + pack hard-fail |
| 0.3.22 | [v0.3.22](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.22) | Watch `readSimVars` batch + TIMEOUT abort + cruise gates |
| 0.3.21 | [v0.3.21](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.21) | Hang mole / ping honesto / TIMEOUT por código IPC |
| 0.3.19 | [v0.3.19](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.19) | Inject permanece armed até o write terminar |
| 0.3.18 | [v0.3.18](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.18) | Taxi fuel cap 50% Due; inject timeout 15s/180s + progress; DR400 delay 400ms |
| 0.3.17 | [v0.3.17](https://github.com/daniielsantos/skyline-career/releases/tag/v0.3.17) | Host: recovery após `0xC00000B0`, sem ClearDataDefinition dinâmico, serialize ops |
| 0.3.16 | v0.3.16 | Clamp fuel OFP → tank capacity |

## Branch

`main` — handoff em `docs/agent-context/`.

## Local (ainda sem release)

- **0.3.24 shipped:** equal-first até limite real do envelope; leftover
  split L/R (mesmo arm, Δarm ≤2 ft, LEFT/RIGHT, indexes consecutivos).
  Kodiak/Caravan/Bonanza validados localmente.
- **Pós-0.3.24 (local):** Host reusa defs de `readSimVars` iguais; quit do
  MSFS dá tear-down completo; Watch backoff 8–15s até o sim voltar.

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
  sequenciais antes do 1º write. Fill continua equal +50 (sem 16 station
  reads). CG é **um** `readSimVars` batch por round. Fill híbrido:
  equal primeiro em todas as stations (Kodiak/Caravan); no limite →
  shift e **continua o Due**; leftover no lado que ajuda.
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
- **0.3.22 Watch batch:** `sampleLiveFlight` / load / cruise usam `readSimVars`.
  1º TIMEOUT marca `pendingSimConnectReset`. Host velho (`UNSUPPORTED`) cai
  em sequential e ainda throw no 1º TIMEOUT.
- **Inject/preflight batch + fill híbrido:** tanks/stations/CG em `readSimVars`.
  Fill equal primeiro em todas as stations; no limite → shift e continua
  o Due. Pack recusa Host stale.

## O que validar após 0.3.22

1. Watch solo/ar: um `readSimVars` por tick; TIMEOUT ~5s + reset, não ~45s.
2. Inject não desarma cedo demais enquanto o write ainda corre.
3. Inject com Host doente → falha ≤ ~3 min com mensagem, não Writing infinito.
4. Host **0.3.22+** para batch; 0.3.21+ health ping; 0.3.17+ PIPE CLOSED.
5. `release:desktop` falha se SimBridgeHost.exe estiver locked (`start:local`).
