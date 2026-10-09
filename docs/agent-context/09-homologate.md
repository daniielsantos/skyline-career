# Homologar aeronave (player inject)

Objetivo: perfil em `profiles/examples/` que o Career resolve pelo título live e consegue **escrever** fuel + payload.

## Fluxo padrão

```powershell
npm run build
npm run build:native
npm run host:simconnect   # MSFS no avião, solo

node packages/agent/dist/cli.js writetest
node packages/agent/dist/cli.js draft-profile --calibrate
node packages/agent/dist/cli.js smoke --profile profiles/drafts\<arquivo>.json
# promover drafts → profiles/examples, semver 1.0.0, notes em profiles/notes/
```

## O que o perfil precisa

- `match.title` / `liveTitles` alinhados ao título MSFS
- Tanques com `readVar`/`writeVar` que o **writetest** confirmou (não inventar AUX/TIP)
- Stations com índices writáveis + `maxLoad` razoável
- `writePlan` + `verify` (offset de fuel via calibrate)
- `gating`: on ground; engines off se o airframe exigir para drenar tanques

## Armadilhas

- Vars de tanque **não registradas** → `UNRECOGNIZED_ID` → Host morto (ver Twin Otter AUX).
- Densidade: Jet-A ~6.7 vs avgas ~6.0 — OFP em lb / tanque em gal.
- Capacidade do hangar (`fuelCapacityKg`) deve bater com tanques homologados.
- Career inject: `clampFuelToCapacity` quando OFP > tanques.
- **`maxLoad` placeholder 500:** inject Due = Σ maxLoad. Wizard cascade: cfg (`station_load` >500) → **split SimBrief/useful-load** nas bag stations (S1/S2 ≥750). Sem probe de clamp live (MSFS quase sempre aceita qualquer peso). Market `maxCargoKg` via SimBrief **não** substitui maxLoad no inject (YS-11: 6×500 capava o avião).
- Stations **>16** (EMB-110 pax / Saab): Watch overflow batch; wizard avisa no discovery. Discovery/fingerprint/probe CLI cap = **48** (`PAYLOAD_STATION_DISCOVERY_MAX`; Saab COUNT≈37). Saab **Passenger**: S1–2 crew, S3–36 as `baggageStations` maxLoad 500 (não soft-max 300), S37 excluded; **`cg.policy: none`** (braços ruins + ballast estourava Due). Vidro **Cargo** continua freighter 6-station.
- Soft re-probe: holds que grudam e esvaziam (C408) saem do draft antes do promote.
- Force-include AUX com write falho: **não** (Host risk); remap para MAIN sticky.
- **Contrail Falcon 50 fuel (2026-09-23):** sintoma = classic MAIN ok, CENTER/AUX “partial write”. Causa = EFB escreve `FUELSYSTEM 1–6` e desliga `L:CTL_FA50_FUEL_PANEL_*_SW`; com switches on o sistema rebalanceia. Fix = profile@1.1.0 FUELSYSTEM + switches off no writePlan (não Accu-Sim LVar qty). Classe `light_jet`; SimBrief Falcon 50B.
- **Contrail Falcon 50 smoke FUEL_VERIFY_FAILED (2026-09-23):** payload/CG ok; engines **on**; GW bateu ~alvo (~1907 gal) mas FS:1/2 readback ~20 gal abaixo (tol 3%). `FUEL TOTAL QUANTITY` sub-reporta. Fix @1.1.1 = `requireEnginesOff` + dual write + settle 2s + tol 8%. **Re-smoke engines off → success.**
- `maxCargoKg` com stations ainda em placeholder 500: wizard prefere SimBrief. Catálogo antigo: `npm run airframes:backfill-simbrief-cargo` / `-- --apply`.
- **Fingerprint structural igual ≠ mesmo vidro:** A340-300 pax/VIP/Freighter × EIS1/EIS2 partilham `structuralHash`. Resolve só com `liveTitles` / `titlesMatchForCatalog` — freighter não pode aceitar título sem `Freighter`/`Cargo` (bug: `A340-300 EIS1` → perfil Freighter EIS1).
- **C152 Manifest max 0 lb (2026-09-17):** starter C152 em hop curto mostrou `max 0.0 klb` / `Choose between 1 and 0 lb`. Não é endpoint travado — `/api/cargo-limit` (`light_ga`) consulta SimBrief; C152 usa proxy **C172**. OEW SimBrief C172 (~740–767 kg) + `resolveConservativeOpsWeights` `max(OEW)+min(MTOW)` vs MTOW catálogo **760** → useful ~0/− → `operationalMaxCargoKg: 0`. Audit live SimBrief proxies: **colapsam** C152, Arrow III, DR400; Norden colapsa mesmo com catálogo (useful 210 kg < 2-crew~154 + margin 50); Warrior/Dakota finos mas >0; Corvalis SR2T / DA50→DA42 / Commander→C182 OK. Fix: se mixed headroom ≤ crew+100 kg, cargo-limit usa OEW/MTOW/fuel do catálogo (SimBrief ainda manda em `maxCargoKg` / BN2 soft). Pós-fix VPS: hop curto ~**28 kg / 62 lb** ops (reserva 2×170 + margin) — esperado, não bug de troca.
- **Manifest load stuck at 0 after aircraft switch (2026-09-17):** Duke shows “Choose between 1 and 992 lb” with Load=0 / pay $1; switching aircraft again “fixes” it. Cause: live `maxCargoKg` state from previous tail (C152 ops=0) still applied while Duke selected; `clampDraftToCapacity` only clamps **down** (`min(cargo, max)`), so 0 stays 0 after Duke limit arrives. Fix: bind cargo-limit to `aircraftId` + ignore stale fetches; clear ops cap on `changeStagingAircraft` and refill empty lines with `defaultStagingKg` when capacity becomes >0.
- **C152 still max 0 on 0.3.72 MP (2026-09-17):** desktop 0.3.72 embeds the proxy-weight fix, but World deploy for `v0.3.72` **failed** (wait step treated cancelled sibling `workflow_run` as failure → VPS not promoted). MP `/api/cargo-limit` still served pre-fix world-api → C152 `operationalMaxCargoKg: 0`. Local/SP path com o fix ~28 kg ops. **VPS promoted** via `workflow_dispatch` production on `a685e88` ([run 35261991788](https://github.com/daniielsantos/skyline-career/actions/runs/35261991788)).
- **World release freeze 0.3.73 (2026-09-17):** vários World deploy = 1 por CI verde em cada push (`4cd01eb` feature, `e3e39ef` bump, `e274f20` note) + 1 no evento `release`. O bump CI foi **cancelled** pelo push da nota; a release esperava forever `workflow_run` success no SHA `e3e39ef`. Fix: release **builda** amd64 direto (sem wait/retag). Run stuck cancelado.

## Market SKU (família vs vidro)

**Market `label`:** short type name only (e.g. `Cessna 208B`, `TBM 930`, `Boeing 737-800`, `A340-600 PRO`). Never bake `Passengers` / `Pax` / `Preset Pax` into the display label — cabin role stays in `configurations[].label`; glass titles stay in OFP `matchTitles`. Wizard already strips via `suggestShortMarketLabel`. Fleet normalize + Market refresh re-read catalog label so Hangar/board pick up renames without save migration.

Não criar um `typeId` de catálogo por Highline/Passenger/Stol. Um SKU + um (ou poucos) OFP pack(s):

| SKU | Classe | Pack / roles | SimBrief |
|-----|--------|----------------|----------|
| `microsoft-atr-72-600` | `light_turboprop` | `profiles/ofp/microsoft-atr-72-600.json` | AT76 |
| `microsoft-atr-42-600` | `light_turboprop` | `profiles/ofp/microsoft-atr-42-600.json` | AT46 |
| `microsoft-404-titan` | `light_ga` | cargo + passengers (`familyRolesPackRelPaths`) | (pack) |
| `microsoft-c400-corvalis` | `light_ga` | `profiles/ofp/microsoft-c400-corvalis.json` | **SR2T** (COL4 não existe no SimBrief) |
| `inibuilds-a330-200` | `wide_freighter` | `profiles/ofp/inibuilds-a330-200.json` (GE/RR/VIP) | **A332** `iniBuilds (MSFS) - A330-200 GE/RR` (not Default) |
| `inibuilds-a330-300` | `wide_freighter` | `profiles/ofp/inibuilds-a330-300.json` (GE/RR/VIP/P2F) | **A333** `iniBuilds (MSFS) - A330-300 GE/RR` (+ P2F rows) |
| `inibuilds-a300-600` | `wide_freighter` | pax + freighter packs (`familyRolesPackRelPaths`) | **A306** `iniBuilds (MSFS) - A300-600R GE/PW` (not Default; freighter glass uses same engine row — no Preighter) |
| `inibuilds-l1011-500` | `wide_freighter` | Regular + Engine Pod packs (`familyRolesPackRelPaths`) | **L101** `iniBuilds (MSFS) - L1011-500 Regular` / `Pod Ferry` (not Default; Engine Pod glass → Pod Ferry) |
| `inibuilds-a340-300` | `wide_freighter` | pax + freighter + VIP packs (`familyRolesPackRelPaths`) | **A343** Passenger / Preighter / VIP (not Default; Freighter glass → Preighter) |
| `asobo-737-max-8-passengers` | `narrow_freighter` | Asobo + iFly MAX 8 / 8200 (`familyRolesPackRelPaths`) | **B38M** Default (Asobo); iFly live → `iFly (MSFS) - 737 MAX 8 - N Seats (LBS)` / `…8200 - 197 Seats (LBS)` |
| `fss-embraer-e170` | `narrow_freighter` | `profiles/ofp/fss-embraer-e170.json` | **E170** `FlightSim Studio (MSFS) - Dual Class Configuration` (not Default) |
| `fss-embraer-e175` | `narrow_freighter` | `profiles/ofp/fss-embraer-e175.json` | **E175** `FlightSim Studio (MSFS) - Dual Class Configuration` (not Default) |
| `fss-embraer-e190` | `narrow_freighter` | pax + freighter (`familyRolesPackRelPaths`) | **E190** Dual Class / Cargo Configuration (not Default) |
| `fss-embraer-e195` | `narrow_freighter` | pax + freighter (`familyRolesPackRelPaths`) | **E195** Dual Class / Cargo Configuration (not Default) |
| `synaptic-a220-300` | `narrow_freighter` | `profiles/ofp/synaptic-a220-300.json` | **BCS3** `Synaptic / iniBuilds (MSFS) - A220-300` (not Default) |
| `skyward-cessna-c680` | `light_jet` | `profiles/ofp/skyward-cessna-c680.json` | **C680** `Skyward Simulations (MSFS) - C680 Sovereign+` (not Default); passenger **`inject_verified`** + `efbPaxWeightLb: 210` / S14–S16 ghosts omitted |
| `contrail-contrail-falcon-50` | `light_jet` | `profiles/ofp/contrail-contrail-falcon-50.json` | **FA50** `Contrail (MSFS) - Falcon 50B` (not Default); fuel = FUELSYSTEM 1–6 + panel SW off; engines off (@1.1.1) |
| `justflight-146-100` | `narrow_freighter` | `justflight-146-100` + Statesman family | **B461** JF MSFS (Statesman → CC2) |
| `justflight-146-200` | `narrow_freighter` | `justflight-146-200` + QC/QT freighter family | **B462** JF MSFS (QT → QC/QT) |
| `justflight-146-300` | `narrow_freighter` | `justflight-146-300` + QT freighter family | **B463** JF MSFS (QT → QT) |

Vidros: `profiles/examples/microsoft-atr-*-highline-*.json` etc. + `matchTitles` no pack. Alias de typeId legado → família em `LEGACY_AIRFRAME_ALIASES`.

**Livery ≠ identidade:** Market/Dispatch/OFP casam pelo **TITLE** SimConnect (`aircraft.cfg` `title=`), não pela textura. Paint custom costuma manter o título base (`iFly 737-MAX8 (189Seats) …`) → `liveTitleMatchesMarketSku` / `matchTitlePattern` ainda batem (regex sem âncora, ordem da frase importa). O resolve de perfil (`titlesMatchForCatalog`) é por token: ordem pode mudar e palavra extra (companhia, matrícula) passa, desde que o código do modelo e as variantes conhecidas coincidam. `189seats` não é variante — 166/178/189 empatam. Título só com a companhia (`LATAM 737 MAX` sem `iFly` / modelo) não casa.

**Varredura de Packages rejeitada (2026-09-27):** sintoma = HUES Ryanair no iFly 737-MAX8200 reescreve o TITLE e o preflight recusa o 737 Max 8. Fingerprint inclui o título; `structuralHash` não separa vidros irmãos; ATC MODEL veio `B738`. Tentativa de seguir `base_container` lendo `aircraft.cfg` em Community/Official foi **descartada** — varre a instalação do sim (gigabytes). Não repetir. SimConnect não manda o pacote.

**Hash estável à livery não é único (2026-09-27):** `structuralHash` (índice+capacidade dos tanques, índices das stations) já ignora o título e não muda com pintura. Medido em `profiles/examples` (190 perfis): 96 hashes, 40 grupos colidem. O mesmo hash junta iFly MAX8 166/178/189 + MAX8200; A340 pax/VIP/freighter × EIS; ATR 42 com ATR 72; 777-200LR com 300ER e 777F; e **C208B Cargo (Asobo) com Black Square Super Cargomaster** (tanques 167,8+167,8 gal, 12 stations). Os outros Caravan se separam pelo número de stations: Asobo pax 14, Black Square Cargo Pod 15, Gear 11. As variáveis que separam esses vidros (título, cabine, peso vazio de config) não entram no hash — maxLoad/braço são placeholder no sampler. TITLE, ATC MODEL, ATC TYPE e ATC ID são o que a livery reescreve. Dentro de um SKU só (iFly 166/178/189/8200 no Max 8) escolher um vidro ou outro quase não muda o inject — o estrago é o SimBrief (fileira de assentos / OEW). O problema real do hash é cruzar aviões: ATR 42↔72, 777-200LR↔300ER↔777F, A340 pax↔freighter.

**SDK 2024 não manda o container do usuário (checado 2026-09-27, release notes até 1.6.9):** desde o SDK 1.1.1 existem `LIVERY NAME` / `LIVERY FOLDER` (simvar, `livery.cfg`) e `SimConnect_EnumerateSimObjectsAndLiveries` (lista título + livery para spawnar AI). Isso separa pintura e avião só no SimObject modular, em que o `TITLE` não muda. O Host não pede essas simvars (identidade = TITLE, ATC MODEL, ATC TYPE, ATC ID). `readSimVar` só devolve float. Probe avulso (2026-09-27): HUES GOL legado `iFly 737-MAX8 GOL … (189Seats)` → `LIVERY NAME` e `LIVERY FOLDER` vazios. Phenom 300E streamed → `TITLE` ficou `FSReborn Phenom 300E PRO Manchester Interior`, `LIVERY NAME` = `FSReborn Aurora`, `LIVERY FOLDER` = `FSREBORN_AURORA`. No modular o título base não é reescrito; a pintura vem à parte. No legado as duas strings vêm vazias. Não ligar `LIVERY NAME`/`FOLDER` no resolve: no Phenom o `TITLE` já casa o pack (`FSReborn Phenom 300E`); a livery é a pintura (`FSReborn Aurora`), não o vidro. Nada nas notes expõe o pacote ou o `base_container` da aeronave do usuário.

**Desempate por hash removido (2026-09-27):** chegou a ir para o desktop (pergunta “Which version is in the sim?”, `liveVariantTitle`, gateway amostrando o sim). Sintoma no HUES Ryanair: o título não casa, o hash casa o iFly, a pergunta deixava passar, e o Preflight marcava Sim 22 225 lb com stations = Due 39 683 lb. No 8200 de fábrica, mesmo OFP, Sim 39 681 lb. Não há outro sinal de clone (hash igual, `LIVERY NAME` vazio, SDK sem pacote). Fix: removidos `variant-tiebreak.ts`, a pergunta, o intercepto de `POST /api/dispatch` no gateway e a cópia de `profiles/ofp` no `Dockerfile.world`. Dispatch volta a usar o título live. Pintura da aba Livery mantém `iFly 737-MAX8200` e segue. Título que não casa o pack, no Preflight estrito, recusa com “not homologated”.

**HUES Ryanair é variante, não pintura da aba Livery (2026-09-27):** no 8200 de fábrica a aba Livery só lista `737-MAX8200`. O pacote HUES não entra ali. Ele publica outro avião, com título próprio `HUES RYANAIR (MALTA AIR) … B737-8200`. Isso é o padrão legado (`[FLTSIM]` / simobject com `title=` novo), não o de toda livery. Pintura modular fica na aba Livery do mesmo vidro e o `TITLE` não muda (`LIVERY NAME`). No legado o título muda e o cfg pode trazer outro peso vazio; o hash (tanques + stations) continua o do iFly. Preflight no mesmo OFP: com essa variante Sim 22 225 lb e stations = Due; no 8200 de fábrica Sim 39 681 lb. Ver `12-pax-efb-due.md`.

**Exemplo Ryanair (Dispatch, 2026-09-27):** título `HUES RYANAIR … B737-8200`, hash `9a97f574…`, ATC `B738` ignorado. Título não casa. Hash bate nos quatro iFly do SKU Max 8, não no Asobo. A pergunta 166/178/189/8200 foi removida no mesmo dia — ver o parágrafo acima.

**Hash “técnico” completo também não é único (2026-09-27):** candidatos estáveis à pintura (herdam o flight model, não o título) = `EMPTY WEIGHT`, `MAX GROSS WEIGHT`, envergadura, área da asa, comprimento, CG vazio, empuxo, além de tanques e stations. No iFly instalado, 166/178/189/8200 têm os mesmos números (empty 99360 lb, MTOW 181200, span 117.83, fuselage 112). No A340 iniBuilds, pax/VIP/freighter herdam um único `common/config/flight_model.cfg`. Acrescentar esses campos não separa vidro nem livery. Pode separar tipos que só empataram em tanque (42 vs 72, 200LR vs 300ER) quando o sim reporta o simvar — não fecha identidade.

**iFly GOL 189 aliasa no 166 (2026-09-27):** título live `iFly 737-MAX8 GOL … (189Seats)`. `LIVERY NAME`/`LIVERY FOLDER` vazios. Fingerprint muda com o título. `titlesMatchForCatalog` não trata `166seats`/`189seats` como variante — os três MAX8 empatam em 0.9 `title_alias` e o catálogo devolve o 166 (primeiro). O 8200 fica de fora (`max8200` é token de modelo). Pack OFP `iFly\s*737-MAX8\s*\(\d+Seats\)` exige os assentos colados no MAX8, então esse título não escolhe a fileira 189 no SimBrief.

**Identify live (Airframes):** botão ghost **In the sim** no canto da página (sem faixa de texto) → `POST /api/simbridge/identify-aircraft` (probe TITLE) → Market SKU / pack OFP / perfil inject. Helper: `packages/career-ui/server/identify-live-aircraft.ts`. Não é homologação colaborativa (`13`).

Prompts de arte de card: `docs/market-airframe-card-prompts.md` (kit da classe, 16:9, PNG em `career-ui/public/airframes/`).

Jets de passageiro no Market (`loadLayout: pax_and_cargo`): Loaded vs Due vs tablet — **não** é o mesmo que inject writetest. Ver [`12-pax-efb-due.md`](./12-pax-efb-due.md).

### Charter / passenger (obrigatório em homologações futuras)

Homologação **não** é só cargo writetest. Se o SKU tem assentos (ou `loadLayout: pax_and_cargo`):

1. Stamp `configurations` com `role: passenger`, `certificationState: dispatch_ready` (mínimo), `passengerCapacity`, bag = seats×55 lb, pack OFP.
2. Classes Charter-eligible: `light_ga` / `light_turboprop` / `light_jet` / `medium_piston` / `narrow_freighter`. Fit ainda exige config passenger — freighter puro na mesma classe **sem** stamp pax fica fora do board.
3. Smoke: Charter Fit numa oferta 1–N pax (N ≤ seats / `CHARTER_GROUP_SIZE_MAX`); Dispatch SimBrief `pax=N` + bagwgt (sem `cargo=`).
4. Se `pax_and_cargo`: Due/Loaded playbook em [`12-pax-efb-due.md`](./12-pax-efb-due.md).
5. `inject_verified` para inject nativo de charter = passo **posterior** (Phenom/C680); board unlock não exige.

Pure freighter SKUs (BCF, C-130, …): cargo-only — **não** inventar passenger stamp.

Captura por jogador / fila de review (On Air–like): **não shipado**. Esboço em [`13-collaborative-homologation.md`](./13-collaborative-homologation.md).

- **FSLabs A321 promote (2026-10-09):** sintoma = quatro vidros homologados (`A321-211` CFM, `A321-231` IAE, `A321-251N` LEAP, `A321-271N` PW; native-simbrief, 24 stations, 6 tanques iguais) fora do Market. Não cabem no Fenix A321 (16 stations, row Fenix, combustível diferente) nem no A321LR da iniBuilds (lista A21N, row LEAP LR). Ceo e neo também não são o mesmo SKU: o despacho usa o ICAO do catálogo, e o SimBrief separa **A321** de **A21N**. Fix = `fslabs-a321` (Airbus A321, 220 assentos, row `FSLabs (MSFS) - A321-211/231 (0 ACT)`) e `fslabs-a321neo` (Airbus A321neo). O vidro diz 251N/271N; o SimBrief não tem essa row — o CFM vai para `A321-251NX LEAP-32 (0 ACT)` (235) e o PW para `A321-271NX PW1133G (0 ACT)` (239). Sem token SL/ACT no título, fica na row 0 ACT. Tanques homologados somam 31256 kg. Arte ligada em `AIRFRAME_CARD_ART`: `fslabs-a321.png`, `fslabs-a321neo.png`.

- **PMDG 737-700 BDSF promote (2026-10-09):** sintoma = vidro `737-700BDSF BW` homologado (native-simbrief, tanques iguais ao passageiro) fora do Market, e o título estava em `matchTitles` do DC-6. Não é a família de passageiros: SimBrief **B737** tem a row `PMDG (MSFS) - BEDEK Special Freighter` (carga 39162 lb, 4 assentos de fila, OEW 77080 lb). O 737-800 BDSF usa Converted Freighter; essa row não existe no 700. Fix = SKU cargo-only `pmdg-737-bdsf-family` (Boeing 737-700 BDSF), sem config de charter. Carga 17764 kg, combustível 20894 kg. Zonas 1–4 como main deck, igual ao 800 BDSF. Arte ligada em `AIRFRAME_CARD_ART`: `b737-bdsf.png`.

- **PMDG 737-700 promote (2026-10-09):** sintoma = seis vidros homologados (PAX SSW/BW × TC/SC e BBJ SSW/BW, native-simbrief, inject vazio) ainda fora do Market. O pack do DC-6 tinha esses títulos em `matchTitles`, então o resolve exato caía no DC-6. Fix = dois SKUs. `pmdg-737-pax-family` (Boeing 737-700): TC → SimBrief **B737** `PMDG (MSFS) - Dual Class` (124 assentos, config Two Class); SC → `PMDG (MSFS) - Single Class` (132, config Single Class). `maxPaxSeats` 132 para o OFP do Single Class passar; charter default continua Two Class 124. Tanques 1288+1288+4299 gal → 20894 kg. `pmdg-737-bbj-family` (Boeing 737-700 BBJ): lista **BBJ1**, row `PMDG (MSFS) - 9 Aux Tanks` (30 assentos). O OFP imprime `B737`; alias só `BBJ1` → `B737` (sem o inverso, senão o passageiro aceitaria um código BBJ1). Combustível do catálogo é o tanque homologado (mains + center + CENTER2 1563 gal → 25644 kg). A row de 9 aux publica 71662 lb — mais do que o vidro carrega. `0 Aux Tanks` ignora o CENTER2. Sem inject. Mapa de estações = zonas NG3 do 737-800 (o wizard gravou 31 stations sem nome, maxLoad 500). Arte ligada em `AIRFRAME_CARD_ART`: `b737-pax.png`, `b737-bbj.png`.

- **FSS E175 OFP ICAO E75L (2026-10-08):** sintoma = Lab E175, OFP type `FSSE175`, fail `OFP airframe E75L is not compatible with mission airframe fss-embraer-e175 (E175)`. Causa = a row FSS na lista SimBrief `E175` imprime `airframe_icao` **E75L** (E175LR). O despacho continua na chave E175. A checagem só aceitava o código da ficha. E170/E190/E195 imprimem o mesmo código da lista. Fix = alias `E175` ↔ `E75L` em `AIRFRAME_ICAO_ALIASES`. Não trocar `simbriefIcao` para E75L — a lista do SimBrief é E175.

- **FSS E170/E175 assentos (2026-10-08):** sintoma = Lab SBCT→SBGR, OFP `pax=76` e fail `mission expects pax≤70`. O dropdown da FSS Dual Class mostra Full (76). Causa = `maxPaxSeats` foi a ficha Embraer (E170 70, E175 78), enquanto o Open SimBrief enche a cabine com `airframe_passengers` da row `FlightSim Studio (MSFS) - Dual Class Configuration` (76 nos dois). A checagem do OFP usa o teto do catálogo. Fix = E170 e E175 em 76 assentos / bagagem 4180 lb. E190 96 e E195 100 já batiam com essa row.

- **FSS E-Jets promote (2026-10-07):** sintoma = E170, E175 LW, E190, E190 Freighter, E195 e E195 Freighter homologados (native-simbrief, 6 stations, sem inject) ainda fora do Market, e o OFP cairia em Default. Fix = quatro SKUs `fss-embraer-e170/175/190/195`. E190 e E195 são família pax + cargo. SimBrief **E170/E175/E190/E195** usa `FlightSim Studio (MSFS) - Dual Class Configuration` no vidro de passageiros e `… Cargo Configuration` no freighter. Single Class e High Density existem no SimBrief e no EFB da FSS, mas não há vidro homologado separado — o OFP fica no Dual Class. Carga nativa continua no EFB. Arte de card ligada em `AIRFRAME_CARD_ART`: `embraer-e170.png`, `embraer-e175.png`, `embraer-e190.png`, `embraer-e195.png`. Freighter usa o PNG da família.

- **Market labels Passengers/Pax (2026-09-26):** sintoma = Hangar/Market cards `CESSNA 208B PASSENGERS`, `TBM 930 Passengers`, `Boeing 737-800 PAX`, `A340-600 PRO Preset Pax`. Causa = top-level catalog `label` baked glass/cabin wording. Fix = short type names only; `refreshAircraftMarket` syncs `listing.label` from catalog; fleet already preferred `airframe.label` on normalize. typeIds / matchTitles / config `Passenger` intact.

- **A300-600 iniBuilds promote (2026-09-23):** sintoma = 4 glasses homologated (Passenger/Freighter × GE/PW) still fora do Market / OFP Default. Fix = SKU `inibuilds-a300-600` + family packs pax/freighter; SimBrief **A306** `iniBuilds (MSFS) - A300-600R GE/PW` via title inference (pack match Default so PW não fica preso em GE). Sem Preighter no SimBrief — freighter usa a row do motor. Arte de card: prompt em `docs/market-airframe-card-prompts.md` (PNG pendente).

- **L1011-500 iniBuilds promote (2026-09-23):** sintoma = 4 glasses (Standard/Lounge × Regular/Engine Pod) fora do Market. Fix = SKU `inibuilds-l1011-500` + packs Regular/Pod; SimBrief **L101** Regular vs Pod Ferry via `Engine Pod` no título; normalize `L-1011`→`L1011`; variant tokens `lounge`/`pod`. Arte: prompt pendente PNG.

- **iFly 737 MAX promote (2026-09-24):** sintoma = 4 glasses homologados (MAX8 166/178/189 + MAX8200) fora do Market / SimBrief Default. Fix = packs iFly + merge no SKU `asobo-737-max-8-passengers` (`familyRolesPackRelPaths`); aliases `ifly-737-max-8` / `ifly-737-max-8200`; live title → seat rows LBS; Market “i” lista Asobo + iFly. Arte: `737-max-8.png` (SKU) / `ifly-737-max-8.png` (legado). Preflight Sim≪Due: S1–S11 baggage (não crew) — ver `12-pax-efb-due.md`.

## Hubs (aeroportos career)

Não é o mesmo que airframe. Seed + facilities MSFS ≤25 nm + ICAO catalog.  
Ver `04-hubs-simbrief.md` + `.cursor/rules/career-map-expansion.mdc`.
