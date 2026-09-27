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

**Decisão (2026-09-27): desempate manual implementado no Dispatch.** O casamento por título fica como está quando acerta. Quando falha: `structuralHash` ao vivo comparado **só** aos perfis do SKU comprado (`variant-tiebreak.ts`). Sem match, recusa. Match único ou empate com o mesmo mapa e a mesma row SimBrief (Asobo C208 Cargo e Super Cargomaster), segue sem pergunta e grava `liveVariantTitle`. Vários vidros (iFly 166/178/189/8200) → uma pergunta; a escolha manda o título canônico ao SimBrief. Preflight só aceita esse título se o hash ao vivo ainda estiver no grupo. O SimBrief do iFly não lê a escolha sozinho: o pack está em `Default` e a fileira sai de `inferIfly737MaxSimBriefMatch` no título canônico (`iFly 737-MAX8 (189Seats)` / `iFly 737-MAX8200`), não no título da livery. Sem passar esse título, o OFP fica no B38M Default. A lista de rows já existe em `https://www.simbrief.com/api/inputs.airframes.json` (`fetchSimBriefAirframesForIcao`). Mostrar o ICAO inteiro (B38M) mistura PMDG/Asobo/iFly; se a pessoa for escolher a row, filtrar pela família. No iFly a escolha do vidro já aponta a row (`189` → `737 MAX 8 - 189 Seats (LBS)`, `8200` → `197 Seats`). Caravan: packs `Default` / `C208` — o OFP não muda. A escolha só altera stations quando o hash é único (pax até S14, Gear até S11, Cargo Pod até S15). Asobo Cargo e Super Cargomaster empatam e o mapa é o mesmo (crew S1–S2, bagagem S3–S12); não há o que perguntar. Não usar hash global, varredura de Packages, `LIVERY NAME` nem ATC como portão (`B738` no iFly contra perfil `B38M`).

**Exemplo Ryanair (Dispatch, 2026-09-27):** título `HUES RYANAIR … B737-8200`, hash `9a97f574…`, ATC `B738` ignorado. Título não casa. Hash bate nos quatro iFly do SKU Max 8, não no Asobo. Lista: 166 / 178 / 189 / 8200. Escolha 8200 → título canônico `iFly 737-MAX8200` → SimBrief `737 MAX 8200 - 197 Seats (LBS)`. Stations S1–S11 iguais nos quatro. Escolher 189 no lugar do 8200 não quebra o inject (mesmo flight model, `injectCapable: false`); o OFP sai com peso/payload da row de 189. O inject não detecta esse erro: tanques, stations e peso vazio ao vivo são os mesmos nos quatro, e a lista já foi filtrada por esse hash. No Caravan, escolher um mapa diferente (11 vs 15 stations) compara e escreve carga nas stations erradas.

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

- **Market labels Passengers/Pax (2026-09-26):** sintoma = Hangar/Market cards `CESSNA 208B PASSENGERS`, `TBM 930 Passengers`, `Boeing 737-800 PAX`, `A340-600 PRO Preset Pax`. Causa = top-level catalog `label` baked glass/cabin wording. Fix = short type names only; `refreshAircraftMarket` syncs `listing.label` from catalog; fleet already preferred `airframe.label` on normalize. typeIds / matchTitles / config `Passenger` intact.

- **A300-600 iniBuilds promote (2026-09-23):** sintoma = 4 glasses homologated (Passenger/Freighter × GE/PW) still fora do Market / OFP Default. Fix = SKU `inibuilds-a300-600` + family packs pax/freighter; SimBrief **A306** `iniBuilds (MSFS) - A300-600R GE/PW` via title inference (pack match Default so PW não fica preso em GE). Sem Preighter no SimBrief — freighter usa a row do motor. Arte de card: prompt em `docs/market-airframe-card-prompts.md` (PNG pendente).

- **L1011-500 iniBuilds promote (2026-09-23):** sintoma = 4 glasses (Standard/Lounge × Regular/Engine Pod) fora do Market. Fix = SKU `inibuilds-l1011-500` + packs Regular/Pod; SimBrief **L101** Regular vs Pod Ferry via `Engine Pod` no título; normalize `L-1011`→`L1011`; variant tokens `lounge`/`pod`. Arte: prompt pendente PNG.

- **iFly 737 MAX promote (2026-09-24):** sintoma = 4 glasses homologados (MAX8 166/178/189 + MAX8200) fora do Market / SimBrief Default. Fix = packs iFly + merge no SKU `asobo-737-max-8-passengers` (`familyRolesPackRelPaths`); aliases `ifly-737-max-8` / `ifly-737-max-8200`; live title → seat rows LBS; Market “i” lista Asobo + iFly. Arte: `737-max-8.png` (SKU) / `ifly-737-max-8.png` (legado). Preflight Sim≪Due: S1–S11 baggage (não crew) — ver `12-pax-efb-due.md`.

## Hubs (aeroportos career)

Não é o mesmo que airframe. Seed + facilities MSFS ≤25 nm + ICAO catalog.  
Ver `04-hubs-simbrief.md` + `.cursor/rules/career-map-expansion.mdc`.
