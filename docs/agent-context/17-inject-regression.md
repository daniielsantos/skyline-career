# Inject regression pack (GA / TP / light jet)

Pacote mínimo para **não quebrar um airframe ao consertar outro** quando o diff mexe em código compartilhado:

- `packages/career-ui/server/watch-helpers.ts`
- `packages/career-ui/server/ofp-load-helpers.ts`
- `packages/shared/src/career-live-load.ts`
- `packages/career-ui/src/load-verification.ts`
- Host SimConnect / `readSimVars` batch

Perfis são isolados (`profiles/examples/*.json`); o risco real é **policy compartilhada** (soma de estações, mass-balance, Due vs Sim).

Ver também: [`09-homologate.md`](./09-homologate.md), [`12-pax-efb-due.md`](./12-pax-efb-due.md).

---

## Leitura de payload (Sim) — como funciona

**Não existe um SimVar único confiável de “payload total”** no fluxo clássico. O Watch lê:

- Batch 1 (≤32 Host): fuel/empty/gross + `PAYLOAD STATION COUNT` + `PAYLOAD STATION WEIGHT:1` … `:16`
- **Overflow batch** quando COUNT ou `keepStationIndexes` &gt; 16: `WEIGHT:17`…`N` (EMB-110 pax = 20)
- `EMPTY WEIGHT`, `TOTAL WEIGHT`, fuel (tanques + `FUEL TOTAL QUANTITY WEIGHT`)

Implementação: `sampleLiveLoadLb()` em `watch-helpers.ts` → `mergeOverflowPayloadStations` / `resolveClassicPayloadStationNeedMax` em `career-live-load.ts`.

### Camadas (ordem conceitual)

| Camada | O que é | Quando manda |
|--------|---------|--------------|
| **Soma bruta stations** | Σ estações lidas (1–N, overflow se N&gt;16) | Base; UI schematic por station |
| **`resolveLivePayloadLb`** | Escolhe **stations** vs **mass-balance** | Stations ~zero mas avião pesado → MB; stations infladas vs gross → MB; senão stations |
| **Mass-balance** | `TOTAL WEIGHT − EMPTY WEIGHT − fuel` | Accu-Sim / tablet que não atualiza `PAYLOAD STATION WEIGHT`; PMDG ghost stations |
| **Vendor** | TFDi EFB Lvars, A2A Accu-Sim Lvars | Perfil/pack pede `preferTfdiEfb` / `preferA2aLvars` |
| **Due vs Sim (roles)** | Não é a soma crua 1–16 | Freighter: bags (+ seats-as-cargo) + excess crew above 170. `pax_and_cargo`: cabine+holds (ou ZFW−OEW) |

Para **Preflight Loaded vs Due**:

- **Freighter / cargo clássico** (`careerFreighterLivePayloadLb`): Sim = bags (+ passenger stations usadas como cargo) + **excesso** em crew stations acima de 170 lb (lastro CG). Floor 170 fica fora do Due.
- **Due + inject (freighter e `pax_and_cargo`):** **não** re-clampa MTOW/EMPTY live. Due = payload OFP/missão. Inject coloca esse alvo; hard caps = `maxLoad` das stations (freighter) ou hold/EFB (`clampPaxAndCargoDueToHoldsLb` / `efbPaxWeightLb`). MTOW fica no SimBrief + Accept (e route ops no Dispatch). EMPTY live pós-inject / troca de vidro encolhia alvo (Baron 1264 vs ~1.5 klb). `ofpCargoKg`: `pax===1` + bag token (≤~bagwgt) → **Payload** (BE36 175+26); bag real + 1 pax → **Freight** (Duke 734/909). Nunca tratar gap pax=0 como oneStandardPax.
- **Bonanza SimBrief ICAO:** SKU pistão A36/A36TC → live **BE36** / **BT36** (mesmo Market SKU). B36TP é SKU `light_turboprop` separado → **B36T**. Live TP com Lab pistão **não** troca o ICAO p/ B36T (preflight rejeita). Open/Re-open SimBrief manda `liveTitle` do SimBridge e **sempre** regenera a URL (cache antigo ficava em BE36).
- **Duke SimBrief ICAO:** SKU pistão B60/Grand → live **BE60** / **BE6G**. Turbine Duke é SKU separado → **B60T**.
- **BN2 SimBrief:** não há Default `type=BN2P` (fica Aircraft Type vazio). Dispatch resolve o internal id **Black Box Simulation (MSFS) - BN-2 Islander** (como F28).
- **BN2 cargo tip-tanks:** S3 `maxLoad` **1500** (era 1200 — Due ~1630 lb batia no cap); S1/S2 **750** para lastro de CG no nariz (MAC perto do aft). S4 fica **500** (bay aft).
- **BN2 passenger tip-tanks fuel:** perfil tinha só LEFT/RIGHT_AUX — inject não enchia mains (Sim ~573 vs Due ~701). Alinhado ao cargo: mains 65+65 + tips 27.5+27.5.
- **Engines running:** Preflight/`readLiveLoad` + inject `beforeLive` usam a mesma inferência N1/RPM/combustion/flow que Watch e o probe SimBridge (`inferEnginesRunning` / `ENGINE_RUNNING_PROBE_SIMVARS`). Host `ENG COMBUSTION:1` sozinho **não** manda — sem evidência positiva de spool/flow → `false`. Tile Aircraft no Dispatch: só Watch → probe (nunca o bit sticky guardado em `lastPreflightCheck`). Watch **não** usa `ENG FUEL FLOW GPH`/`GENERAL ENG FUEL FLOW` no gate de motores (BN2 gruda GPH após inject/cutoff); parked + parking brake + N1/RPM mortos → off (ignora spike de flow pós-inject). Cruise burn continua a ler GPH.
- **Schematic sticky após zerar:** se Sim payload ≈ 0 e o sample de stations falha/omite, zerar as keys do último mapa (`schematicStationsForLivePayload`) — senão S1–S8 ficam no snapshot do inject com “Sim 0 lb”.
- **Stations &gt;16 (EMB-110 pax):** primeiro batch Host para em 16; overflow lê 17…COUNT/`keepStationIndexes`. Sem overflow, Due planeja S17–S20 e Preflight mostra Sim curto (~4×200 lb).
- **Freighter Sim:** bags (+ pax-as-cargo) + **excesso** em crew stations acima de 170 lb (lastro de CG no nariz). Não conta o floor 170 — senão Sim = bags+crew vs Due = bags (Bonanza: S1/S2 @ 295 → Due 1052 / Sim bags-only 802).
- **Bonanza A36/A36TC tip-up:** sem bagageiro no nariz; simvar aft 32% ainda empina. Perfil pina CG `calibrated-live` maxMac **28** + S1/S2 maxLoad **750** para o inject empurrar lastro para a frente (não subir cap de S3–S7).
- **Family packs + `liveTitle`:** Watch e inject devem passar o título MSFS em `resolveMissionRolesPack`. Sem isso o Due pode vir do pack Passengers (S3–S15) enquanto o Sim soma só o pack Cargo default (S3–S4 ≈ 300 lb no 404 Titan).
- **`pax_and_cargo`** (`careerPaxAndCargoLivePayloadLb`): Sim = cabine+holds; opcional residual `ZFW − OFP empty` quando EFB injetou ZFW (PMDG/Fenix).

Tolérance READY: fuel ±50 lb; payload ±75 lb (ou % do Due) — `evaluateLoadVerification`.

### Está sólido?

| Faixa | Status |
|-------|--------|
| **Inject direct + freighter + classic stations** (C172, Caravan, Kodiak, ATR, Bandeirante, BN2, Learjet cargo…) | **Sólido** — path principal; **light_ga** revalidado live 2026-08-29 (engines sticky, Corvalis proxy, BN2) |
| **Mass-balance fallback** | **Sólido com regras** — cobre under-read Accu-Sim e ghost stations; testes em `career-live-load.test.ts` |
| **Watch no solo + edição EFB após inject** | **Sólido** — stations que andaram mandam; não gruda READY no snapshot do inject |
| **`pax_and_cargo` + EFB nativo** (Phenom inject, CJ4/Longitude WT, PMDG pax…) | **Médio** — Due/Sim depende de roles + às veis ZFW; ver [`12-pax-efb-due.md`](./12-pax-efb-due.md) |
| **Wide/narrow airline** (Fenix/Maddog/PMDG monitor) | **Fora deste pack** — track A / quirks por família |

**Regra:** mudou `resolveLivePayloadLb`, `careerFreighterLivePayloadLb`, ou o loop de stations no Watch → rodar **P0** abaixo.

---

## Lista canônica — âncoras de regressão

Não é o Market inteiro (`career-player-airframes.json` tem dezenas de SKUs). São **âncoras** que cobrem layouts e code paths diferentes.

Legenda **tier**:

- **P0** — obrigatório antes de merge em código compartilhado de inject/read
- **P1** — smoke spot-check se o diff tocar fuel/tanks/stations da família
- **P2** — amostragem periódica / release GA+TP

### light_ga

| Tier | typeId | Por quê | Profile exemplo | Pack OFP |
|------|--------|---------|-----------------|----------|
| P0 | `asobo-c172sp-cargo` | 6 stations, family merge Classic/G1000/IFD | `asobo-c172sp-g1000-cargo.json` | `asobo-c172sp-cargo.json` |
| P0 | `blacksquare-bonanza-professional` | Black Square inject, envelope equal-first | `blacksquare-bonanza-professional.json` | idem |
| P1 | `blackbox-bn2-islander-cargo-tip-tanks` | Tip tanks (fuel schematic + payload) | `blackbox-bn2-islander-cargo-analogue-tip-tanks.json` | `blackbox-bn2-islander-cargo-tip-tanks.json` |
| P1 | `microsoft-c400-corvalis` | SimBrief **SR2T** (não Default) | `microsoft-c400-corvalis.json` | idem |
| P1 | `microsoft-404-titan` | Family cargo 4st + pax 15st; **Cargo** bags S3–S4 maxLoad **1750** each (Due can reach catalog cargo); **Passengers** S3–S15 | `microsoft-404-titan-passengers.json` | cargo + passengers packs |
| P2 | `a2a-piper-pa-24-250-comanche` | Accu-Sim Lvars (`preferA2aLvars`) | `a2a-piper-pa-24-250-comanche.json` | idem |
| P2 | `asobo-robin-dr400` | Delay inject 400 ms histórico | `asobo-robin-dr400.json` | idem |

### light_turboprop

| Tier | typeId | Por quê | Profile exemplo | Pack OFP |
|------|--------|---------|-----------------|----------|
| P0 | `c208-caravan-cargo` | Multi-station + BS/Asobo family; flicker S7–S11 | `blacksquare-caravan-professional-gear.json` | `blacksquare-caravan-cargo-pod.json` (+ family paths) |
| P0 | `sws-kodiak-100-commuter-cargopod-tundra-wheels` | 11 variant packs, combi/cargo | `sws-kodiak-100-cargo.json` | family under SKU |
| P0 | `microsoft-atr-72-600` | 11 stations, Highline merge, crew S1–S2 | `microsoft-atr-72-600-highline-03.json` | `microsoft-atr-72-600.json` |
| P0 | `nextgensim-emb-110p1f-bandeirante` | TP freighter recente, family E110 | `nextgensim-emb-110p1f-bandeirante.json` | idem |
| P1 | `nextgensim-emb-110p2-bandeirante` | Pax **20 stations** — Watch overflow S17–S20 | `nextgensim-emb-110p2-bandeirante.json` | idem |
| P1 | `microsoft-dhc-6-300-twin-otter-wheels` | Wing outers = LEFT/RIGHT MAIN (37 gal); not AUX | `microsoft-dhc-6-300-twin-otter-wheels.json` | idem |
| P1 | `microsoft-c408-skycourier-cargo` | Empty only; **S3 cargo** (S4/S5 dead); pre-fill writability probe (no clamp) | C408 profile | `microsoft-c408-skycourier-cargo.json` |
| P1 | `microsoft-atr-42-600` | Stol vs Highline fingerprint | `microsoft-atr-42-600-stol.json` | `microsoft-atr-42-600.json` |
| P2 | `workingtitle-tbm-930-passengers` | Single-engine jet-fuel TP | `workingtitle-tbm-930-passengers.json` | idem |
| P2 | `microsoft-pc-12-ngx-passengers` | VIP/cargo family | `microsoft-pc-12-ngx-vip.json` | family paths |

### light_jet

| Tier | typeId | Por quê | Profile exemplo | Pack OFP |
|------|--------|---------|-----------------|----------|
| P0 | `flysimware-learjet-35a-cargo` | Tip tank fuel flicker + cargo inject | `flysimware-learjet-35a-cargo.json` | idem |
| P0 | `fsreborn-phenom-300e` | **`pax_and_cargo`** + inject (cabin seats = freight) | `fsreborn-phenom-300e.json` | idem |
| P1 | `workingtitle-cessna-citation-cj4` | WT light jet, classic stations | `workingtitle-cessna-citation-cj4.json` | idem |
| P1 | `microsoft-pc-24-cargo` | Cargo jet family VIP/cargo | `microsoft-pc-24-cargo.json` | idem |
| P2 | `flightfx-citation-x` | Fuel strategy / range variants | `flightfx-citation-x.json` | idem |
| P2 | `skyward-cessna-c680` | Third-party light jet | `skyward-cessna-c680.json` | idem |

**Fora do pack (proposital):** narrow/wide (PMDG/Fenix/Maddog), `pmdg-738-bbj2-family` (`enabled: false`).

---

## Checklist por airframe (homologação + regressão)

Use para **promover profile novo** ou **revalidar âncora P0** após diff compartilhado.

### A — CLI / perfil (`direct-injection`)

```powershell
npm run build
npm run build:native
npm run host:simconnect   # MSFS, no avião, solo, engines off se o pack exige

node packages/agent/dist/cli.js writetest
node packages/agent/dist/cli.js draft-profile --calibrate
node packages/agent/dist/cli.js smoke --profile profiles/examples\<profile>.json
```

| # | Gate | Pass |
|---|------|------|
| A1 | `writetest` | Tanques + stations writable; sem `UNRECOGNIZED_ID` |
| A2 | `draft-profile --calibrate` | Fuel offset / verify dentro do envelope |
| A3 | `smoke` | Write + read back; payload/fuel dentro da tol do profile |

### B — Career Preflight (Due vs Sim)

MSFS no avião, missão staging, OFP aceito.

| # | Gate | Pass |
|---|------|------|
| B1 | **Inject auto** (se `injectCapable`) | Fuel + payload → READY sem hang |
| B2 | **Loaded vs Due fuel** | Sim ≈ Due (±50 lb ou taxi slack) |
| B3 | **Loaded vs Due payload** | Sim ≈ Due (±75 lb ou % Due) |
| B4 | **Station schematic** | Pesos por station batem com inject (não truncar mid-16) |
| B5 | **EFB edit pós-inject** | Esvaziar/adicionar cargo no tablet → Sim atualiza; READY reflete |
| B6 | **CG card** | Envelope visível no 1º open (advisory) |

### C — Watch / EN ROUTE (solo)

| # | Gate | Pass |
|---|------|------|
| C1 | Tick no solo | Payload/fuel drift ≥15 lb persiste |
| C2 | IPC timeout | Não zera stations parciais como unload real |
| C3 | Post-inject | Não gruda READY se user mudou carga no EFB |

### D — Família / Market

| # | Gate | Pass |
|---|------|------|
| D1 | `matchTitles` | Título MSFS resolve profile certo |
| D2 | Roles pack | `stationRoles` alinhado ao profile |
| D3 | Catálogo | `career-player-airframes.json` upsert OK; `maxCargoKg` vs stations reais |

---

## Matriz rápida — o que testar em cada âncora P0

| Âncora | A (smoke) | B3 payload | B5 EFB | C2 watch | Nota |
|--------|-----------|------------|--------|----------|------|
| C172 G1000 cargo | ✓ | classic freighter sum | opcional | ✓ | Family 6 st |
| Bonanza BS | ✓ | ✓ | ✓ | ✓ | equal-first |
| Caravan BS Gear | ✓ | ✓ | ✓ | ✓ | multi-st, no flicker S7–S11 |
| Kodiak cargo | ✓ | ✓ | ✓ | ✓ | pick one variant |
| ATR 72 HL03 | ✓ | crew excluído do Sim | MS EFB se pax | ✓ | 11 st |
| Bandeirante P1F | ✓ | ✓ | ✓ | ✓ | family E110 |
| Learjet 35A cargo | ✓ | ✓ | ✓ | tip fuel | tip schematic |
| Phenom 300E | ✓ | **pax_and_cargo** | ✓ | ✓ | cabin+hold Due |

---

## Quando rodar o quê

| Mudança | Pack mínimo |
|---------|-------------|
| `resolveLivePayloadLb` / freighter / pax_and_cargo helpers | **Todos P0** (GA+TP+jet) |
| `sampleLiveLoadLb` / `LOAD_SAMPLE_VARS` | **Todos P0** + Learjet (tips) |
| Inject write plan / equal-first / station step | Airframe tocado + **Caravan + Kodiak + C408** |
| Fuel tanks / density / outer tank sticky | **Learjet + BN2 + Twin Otter** |
| Só profile isolado (`profiles/examples/foo.json`) | **Smoke + Preflight só foo** |
| Só UI Career (sem server/shared load) | Smoke opcional |

---

## Comandos úteis

```powershell
# Smoke um profile
node packages/agent/dist/cli.js smoke --profile profiles/examples/blacksquare-caravan-professional-gear.json

# Compare OFP (track monitor / native-simbrief)
npm run compare-ofp -- --simbrief-user YOUR_ALIAS
```

Notas por airframe: `profiles/notes/*.md` — criar ao promover (`09-homologate.md`).

---

## Payload Lab (dev)

Settings → **Developer → On** → sidebar **Lab** (`/lab`).

Cria missão sintética (`payloadLab` + `contractPilot`) **sem** comprar / ferry / settle:

1. Escolhe SKU + payload kg + OD  
2. **Start lab → Dispatch**  
3. No Dispatch: Open SimBrief → Accept OFP → inject → Due vs Sim (UI real)  
4. **Cancel flight** quando terminar  

API: `GET|POST|DELETE /api/dev/payload-lab`. Requer nenhum outro Dispatch player ativo.

**Não** aplica o clamp de route ops (fuel+MTOW Career) no Open SimBrief — o Lab mantém o payload escolhido (economia corta; Lab testa inject).

---

## freighter vs `pax_and_cargo` — quando usar

São **duas camadas** — não confundir:

| Camada | Onde vive | O que decide |
|--------|-----------|--------------|
| **`loadLayout`** (catálogo) | `career-player-airframes.json` | Como o **Dispatch monta o OFP** (pax×175+bags vs freight puro) e ajustes Due (`efbPaxWeightLb`, hold cap…) |
| **`stationRoles`** (pack OFP) | `profiles/ofp/*.json` | Como o **Watch soma Sim** (`careerFreighterLivePayloadLb` vs `careerPaxAndCargoLivePayloadLb`) |

Watch escolhe freighter vs pax_and_cargo pelo catálogo (`loadLayout === 'pax_and_cargo'`), **não** pelo nome “Passengers” do vidro.

### Use **`freighter`** (omitido = freighter) quando

- Variante **cargo / combi / cargomaster** sem missão de pax simulada (C172 Cargo, Caravan pod, Kodiak cargo, ATR Freighter, BN2 cargo, Learjet cargo, BCF…).
- Inject **direct** e o OFP pode ser **freight-only** (`pax=0` ou só piloto) sem estourar MZFW/CG.
- Cabine vira **slots de carga** no pack (`passengerStations: []`, assentos mapeados em `baggageStations`).
- Due = **freight da missão** (+ crew fora do Due); Sim = bags + seats-as-cargo + excess crew above 170. Sem re-clamp EMPTY×MTOW live.

**Hoje:** quase todo `light_ga` + `light_turboprop` inject está aqui — **correto** para Career cargo.

### Use **`pax_and_cargo`** quando

- Fuseleiro **passageiro** (cabine + holds) e o freight da missão deve **ocupar assentos primeiro** (175+55 lb/assento) para CG/envelope no SimBrief/EFB.
- EFB/tablet do addon é a fonte de verdade (Fenix, iniBuilds, JF, Maddog, Phenom com cabine real…).
- Precisa de campos extra no catálogo: `maxPaxSeats`, às veis `efbPaxWeightLb`, `simconnectCabinSeats`, `simconnectCargoHoldMaxLb`, `simconnectEmptyPayloadBiasLb`.
- Due = **payload OFP inteiro** (pax+bags+cargo); Sim = cabine+holds (ou ZFW−OEW). Sem re-clamp EMPTY×MTOW live (hold/EFB caps só).

**Hoje:** narrow/wide airline + Phenom + alguns jets — ~18 SKUs com flag explícita.

### O que **não** fazer na revalidação

- Não marcar **todos** os aviões como `pax_and_cargo` só porque têm assentos no modelo 3D.
- Caravan **Passengers** com Career freight em S7–S11 continua **freighter layout** + seats-as-baggage no pack — funciona e é mais simples.
- Migrar GA/TP para `pax_and_cargo` **só** se SimBrief MZFW/CG falhar ou Due≠Sim após inject; senão aumenta complexidade (pax fake no OFP) sem ganho.

### SimBrief: Freight vs Payload (cap de carga)

SimBrief Dispatch tem **dois campos** na UI:

| Campo API | UI SimBrief | Significado típico |
|-----------|-------------|-------------------|
| `cargo=` | **Freight [LBS]** | Compartimento freight / maxcargo “soft” (EMB-110 Full ≈ **3 500 lb**) |
| `manualpayload=` | **Payload [LBS]** | Carga útil total mzfw−oew (EMB-110 Full ≈ **4 740 lb**) |

Career **inject freighters** (GA / TP / light jet, não `pax_and_cargo`) enviam **`manualpayload=`** no Open SimBrief — mesmo motivo do BN2/ATR. O catálogo `maxCargoKg` (Bandeirante **2150 kg ≈ 4740 lb**) alinha com **Payload**, não com Freight.

`loadLayout: freighter` continua correto; o bug era só qual campo SimBrief recebia.

### Checklist para “bater o martelo” por SKU

1. Aceitar OFP freight-only no inject → **freighter**.
2. MZFW/CG estoura ou EFB exige pax≥1 com freight na cabine → **`pax_and_cargo` + `maxPaxSeats`**.
3. Preflight: medir Sim vs Due; gravar no máximo **um** bias (`12-pax-efb-due.md`).
4. Alinhar `stationRoles` ao layout escolhido (crew sempre fora do Sim freighter).

### UI: label “Light GA” no Dispatch

Header usa `logbookAircraftLabel` → precisa de `airframeLabel` (enrich `withMissionClientView`) ou `airframeTypeId`. Paths que devolviam missão crua (inject OFP, FBO/crew, Lab POST, settle/depart/cancel…) apagavam o label e caíam na classe. Corrigido: enrich nas respostas + fallback typeId no client.

### UI: schematic Cargo grudado após trocar para Passengers (404)

Watch fazia `pickStationMax(undefined, prev)` — `stationMax` do glass Cargo (S1–S4) ficava sticky. Inject/Due podiam estar corretos no Passengers (Sim ~1893) enquanto o schematic só pintava 4 boxes. Corrigido: refresh `stationMax` via título vivo + schematic une estações com peso.
