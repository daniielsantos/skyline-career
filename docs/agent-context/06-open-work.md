# Open work / backlog curto

Atualizado 2026-08-13: A2A liveSource `a2a-lvars` (Preflight/Watch lê tablet). Dual-client IPC de fora.

## Validar (manual)

- [ ] Watch CG card: após editar EFB, `% MAC` atualiza (não congela no Validate); Loaded vs Due não trava
- [x] Footer Phase taxi: Accu-Sim COMBUSTION=0 não prende em "On ground"; taxi por GS ≥5 kt (`taxi_out`)
- [ ] Preflight longe do origin → **NOT AT ORIGIN** + status line; Watch não auto-decola; spawn no hub certo limpa o card sem novo Validate
- [ ] Aerostar inject: Sim ≈ Due sem flick 672/535→751 (densidade resolveFuelDensity na pintura); tablet PAYLOAD = Due
- [ ] Aerostar schematic: Character* + BaggageWeight, não só S1/S7 clássicos
- [ ] Contract-pilot inject: não exige fuelAuthorizedOfpId (Accept OFP não trava Preflight/inject)

- [ ] Hot-swap Host novo (`resources/host`) — log `timeout storm` / `unrecognized_id storm` + `connect() will reopen`
- [ ] Watch solo: um pedido `readSimVars` (não 16 stations em série)
- [ ] Watch no ar: tick de cruise ~5s no TIMEOUT (não ~45s); next tick `force: true`
- [ ] Cruise burn: sample **antes** do weather ambient (wx TIMEOUT não pula o chip); TAS no flight batch; fallback se combustion flags zeram flow
- [ ] Cruise sample 180s: VS 400 fpm / TAS 10% / flow 20% / alt 1200 ft — não zerar em bump mínimo; spike BURN (ghost Eng2+) não reseta `Cruise 0s`
- [ ] Watch: TIMEOUT não fica em loop com pipe “up”; após backoff, sample volta
- [ ] Reinject no solo após editar EFB: matching profile → fuel/cargo sem freeze em “Reading live aircraft…”
- [ ] Caravan: leftover do Due divide L/R da fileira (não 192 num assento e 100 no outro)
- [ ] Install &lt; 0.3.17: warning atual; Node não piora sem `sessionHealthy`
- [ ] Host antigo sem `readSimVars`: fallback sequential ainda throw no 1º TIMEOUT
- [ ] Idle no solo + editar EFB: schematic **não** colapsa para só Crew (S1/S2)
- [ ] Depois de um TIMEOUT, o tick seguinte faz disconnect+connect
  e volta a detectar mudança de payload (não gruda no mapa anterior)
- [ ] Black Square Accu-Sim: cargo no tablet (Pax/pods) **não** aparece nas
  stations clássicas — esperado, não é bug de detect via layout

## Possível próximo engenharia

1. ~~**FBO spot inventory**~~ — removido (wipe stock); Warehouses nos hubs de pickup + Demand Board.
2. ~~**Ports (Santos / Paranaguá)**~~ — buy → pickup / auto-WH; Store in WH; Demand Board fulfill (não Fly to FBO spot).
3. ~~**Port dynamic price + WH lots**~~ — listing price = hub spot × frac + jitter/clamp (frozen at spawn); warehouse deposits keep separate cost lots (±3% merge band).
3b. ~~**Port concession v1**~~ — inventory restock + reactive price; claim/renew lease; operator buffs; 1/company; gates T3+25k shipped.
3c. **Port P2/P3 + specials market (backlog)** — depois de playtest; ver roadmap *Port endgame backlog* (não bloquear mapa).
4. ~~**Company tenant contract (doc)**~~ — roadmap + `08-economy`: company vs world vs pilot; sem schema members ainda.
5. ~~**Ground staff (Ports/WH)**~~ — shipped **0.3.47**: inbound + hire + grades + all 5 perks; WH T1/T2/T3.
6. ~~**América do Sul completa (seed)**~~ — UY/PY/PE/BO/EC/CO/VE/GY/SR/GF + BR/AR/CL; ports costeiros; SimBrief allowlist regenerada.
7. ~~**América Central completa (seed)**~~ — PA/CR/NI/HN/GT/SV/BZ; ports costeiros; lanes MX/US/CO.
8. ~~**Caribe (seed, intl-first)**~~ — CU/DO/HT/JM/BS/TT/BB/LC/GD/AG; ring + KMIA/MMUN/CO/VE.
9. ~~**Dependências caribenhas**~~ — GP/MQ/CW + US-PR (região US); ports + lanes.
10. **Tick perf (Fase 1 + formLots)** — lane indexes + formLots caches. Bench: +1 day ~**20–22s** in-memory. UX: `+1 day` em chunks de 8 ticks com progresso no toast/clock.
11. ~~**Leftovers SX/AW/VI**~~ — SX/AW light countries + US-VI region; ports Philipsburg / Oranjestad / Charlotte Amalie; seed **551**.
12. ~~**EU-1 Western core**~~ — PT/ES/FR/GB/DE/NL/BE/IT; seed **629**; ports EU; fuel trucks 85; Americas bridge lanes.
13. ~~**EU-2 Nordics + Alps + IE**~~ — IE/DK/NO/SE/FI/CH/AT; seed **672**; ports **66**; fuel trucks **100**.
14. ~~**EU-3 Central-East + Baltics**~~ — PL/CZ/SK/HU/EE/LV/LT; seed **706**; ports **70**; fuel trucks **115**.
15. ~~**EU-4 Balkans**~~ — HR/SI/RO/BG/GR/RS; seed **734**; ports **74**; fuel trucks **130**.
16. ~~**EU-5 Iceland**~~ — IS; seed **738**; ports **75**; fuel trucks **134**.
17. ~~**EU-6 W. Balkans**~~ — BA/ME/AL/MK; seed **748**; ports **77**; fuel trucks **140**.
18. ~~**EU-7 East**~~ — TR/UA; seed **762**; ports **80**; fuel trucks **148**.
19. ~~**EU-8 Europe gaps**~~ — BY/MD/GE/AM/AZ/LU/MT/CY/XK; seed **778**; ports **84**; fuel trucks **158**. Homolog: UBBG/UDSG; UGKO dropped (no stock MSFS).
20. ~~**MENA-1 Mediterranean face**~~ — MA/DZ/TN/EG/IL; seed **803**; ports **89**; fuel trucks **175**. ICAO: HEBA/GMFF/LLER. Homolog: `npm run career-hubs -- missing` after rebuild.
21. ~~**MENA-2 Gulf**~~ — SA/AE/QA/BH/KW/OM; seed **827**; ports **97**; fuel trucks **195**. ICAO: OTHH/OMDB/OERK/OETF/OKKK. Homolog after rebuild.
22. ~~**MENA-3 North Gulf**~~ — IQ/IR; seed **841**; ports **99**; fuel trucks **215**. ICAO: ORBI/ORMM/OIIE; Bandar Abbas **OIKB** (not OIBA); Kerman **OIKK**. Homolog after rebuild.
23. ~~**MENA-4 Levant-east**~~ — JO/LB/SY; seed **848**; ports **102**; fuel trucks **230**. ICAO: OJAI/OLBA/OSDI. Homolog after rebuild.
24. ~~**MENA-5 Maghreb/Nile gap**~~ — LY/SD; seed **854**; ports **104**; fuel trucks **245**. ICAO: HLLM (not HLLT)/HLLB/HSSK (not HSSS)/HSPN. Homolog after rebuild.
25. Homologar wing tanks Twin Otter com vars corretas + writetest (só se quiser range completo).
26. Dual-client IPC — **só** se freeze Watch+inject ainda aparecer no 0.3.24+.
27. Next map slice: **YE** (Asia later).
28. Re-run `npm run career-hubs -- missing` após rebuild shared.

## Feito (shipped 0.3.47)

- **Ground staff:** hire desk per WH; Ace→Green grades; logistics / yard / procurement / demand_desk / wh_ops.
- **WH caps:** T1/T2/T3 = 5/10/15 klb; Ports Ground staff shelf compact (fixed head + scroll body).

## Feito (shipped 0.3.31)

- **SAVN hub:** catálogo AR tinha SAVN = Neuquén (~180 nm). Corrigido → San Antonio Oeste; **SAZN** = Neuquén. Migrate stamps lat/lon/name no load.

## Feito (shipped 0.3.42)

- **EN ROUTE live load:** side panel scroll em monitor baixo; tanks L\|C\|R numa linha
  centralizados; stations 5/coluna iguais; escala fluido + labels legíveis em tile estreito.

## Feito (shipped 0.3.41)

- **Brand Horizon:** accent `#f0a35a` + `BrandMark` (skyline bars + wordmark).
- **Cruise burn:** filtra motores fantasma; outlier de flow não zera a janela.
- **EN ROUTE live load:** tiles iguais Fuel/Payload/CG; stations = altura dos tanks; rail CG mais fino; header centrado de novo.

## Feito (shipped 0.3.40)

- **EN ROUTE:** Aircraft/Origin full-width alinhados; Cancel flight com estilo display + header 2-col.

## Feito (shipped 0.3.39)

- **EN ROUTE blank:** `height:0` no painel sem pai flex — `.staging-panel` agora flex-fill sob `.main-content`.

## Feito (shipped 0.3.38)

- **EN ROUTE side:** OFP / Cargo / live-load no mesmo `dispatch-enroute-block`; títulos e grids na mesma coluna esquerda.

## Feito (shipped 0.3.37)

- **Route header:** sem chips OD duplicados; hubs só com cor no texto da OFP.
- **EN ROUTE:** side panel compactado sem scrollbar.

## Feito (shipped 0.3.36)

- **Route header:** hubs origem/destino coloridos na string OFP; labels navlog removidas; technical details colapsados por padrão.

## Feito (shipped 0.3.35)

- **EN ROUTE layout v2:** briefing cards no topo; Cargo com nome; Live load no fim; ROUTE no header do mapa; technical details colapsados por padrão.
- **Watch footer:** fora da área de scroll (sem invadir scrollbar); cruise burn kg/h de volta.

## Feito (shipped 0.3.34)

- **EN ROUTE polish:** capacity cards mesclados na seção Cargo; live load = preflight (schematics sempre visíveis); OFP ainda colapsado.

## Feito (shipped 0.3.33)

- **Dispatch EN ROUTE cockpit:** grid mapa (~60%) + status/live-load (~40%); OFP em `<details>`; mobile stack ~40vh.

## Feito (local, sem release)

- **Bush trips board off:** `BUSH_TRIPS_BOARD_ENABLED=false` (shared + UI flag) — aba Freights→Bush trips escondida; Accept API 503; abandon/active ainda ok.
- **Demand Edit cargo:** reduzir devolve kg à WH + restaura `remainingKg` do pedido; aumentar retira da WH (UI `demandEditMaxKg`).
- **Ports yard lock:** buy split (free→WH / rest→yard); partial Store; Abandon oversized yard (no refund). T1 WH = **5 klb** (2268 kg); T2/T3 = 10/15 klb.
- **WH T2 hybrid upgrade:** unlock after `WAREHOUSE_T2_SHIPPED_KG` (10t) Demand Board settle from that WH + CAPEX; capacity 5t→12t.
- **Max cargo (missão):** online → SimBrief (`mzfw−oew` estrutural; `maxcargo` só se ≥½ estrutural / freighter). Catálogo JSON = fallback offline/API down (não short-circuit). Prefill light_ga ainda `manualpayload`.
- **Accept OFP cargo** também em **contract-pilot** (ex.: Blue Ridge + BN2): botão + CTA primário; trim escala pilot fee / gross.
- **BN2 Market:** um SKU `blackbox-bn2-islander-cargo-tip-tanks` (Cargo Tip Tanks + SpecialOps family).
- Defs SimConnect reusadas para batches Watch/inject idênticos (cache no Host).
- Watch backoff 8s→15s em queda do MSFS; UI `Simulator closed — retry in Ns`.
- A2A Accu-Sim: liveSource `a2a-lvars` (PayloadWeight / Fuel* / Character*) no pack Aerostar/Comanche. Sem `if (a2a)` no fill.
- Aerostar fill: se CG já passou FWD com só crew, colocar Due na metade aft (não cortar cargo). Envelope calibrado −15…15.
- CG card: pinta envelope do perfil (calibrated-live), não SimVar FWD/AFT 0–100. Watch soft-refresh de `liveMac` (cap ~1.2s); envelope pinned do Validate.
- Post-inject A2A: gate `PAYLOAD_NOT_APPLIED` lê `a2a-lvars` (não classic/MB); working plan sozinho não finge sucesso. Profile verify → `L:Character1Weight` + `L:BaggageWeight`.
- Preflight origin proximity: live MSFS ≤12 nm do `originIcao` (mesmo raio do settle); `location.ok=false` → headline **NOT AT ORIGIN** (antes do voo), step fica em load, Watch **não** auto-decola. No solo o Watch relê distância e libera o latch ao chegar no hub (sem novo Validate). Após wheels-up com latch limpo, card Origin **congela** (não fica vermelho com ORIGIN_NOT_ON_GROUND).
- Accu-Sim: **CTRL+E após inject** pode zerar Seat 1 / `Character1Weight` no EFB; start manual mantém. Não é write do Watch. Notas em `a2a-accusim.md` / Comanche / Aerostar. Comanche writePlan sem Character5/6.

## Não fazer sem pedido

- Retune economy Dry / CARGO_FLOW_BALANCE
- Uncap heavy crew
- Reintroduzir AUX writes
- Commit de pulse dumps

## Handoff para chat novo

Mensagem sugerida:

> Continua Skyline Career. Lê `@docs/agent-context/project-overview.md` e `@docs/agent-context/README.md`. Estamos em desktop 0.3.17; problema atual: …
