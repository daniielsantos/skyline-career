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
4b. ~~**Schema v4 world tables**~~ — `worlds` / `economy_meta` / `airports` / `airport_stock` + `world_id`; terminal SQL; tick in-memory.
4c. ~~**Schema v5 world ops tables**~~ — `npcs` / `fuel_trucks` / `fuel_hauls` / `demand_orders` / `port_listings` / `port_inventories` / `port_concessions` keyed by `world_id` (`local` in SP); stripped from `economy_json`. Tick still in-memory. Player WH/concessions stay on `company_state`. Next: Postgres / members (not now).
5. ~~**Ground staff (Ports/WH)**~~ — shipped **0.3.47**: inbound + hire + grades + all 5 perks; WH T1/T2/T3.
6. ~~**América do Sul completa (seed)**~~ — UY/PY/PE/BO/EC/CO/VE/GY/SR/GF + BR/AR/CL; ports costeiros; SimBrief allowlist regenerada.
7. ~~**América Central completa (seed)**~~ — PA/CR/NI/HN/GT/SV/BZ; ports costeiros; lanes MX/US/CO.
8. ~~**Caribe (seed, intl-first)**~~ — CU/DO/HT/JM/BS/TT/BB/LC/GD/AG; ring + KMIA/MMUN/CO/VE.
9. ~~**Dependências caribenhas**~~ — GP/MQ/CW + US-PR (região US); ports + lanes.
10. **Tick perf (Fase 2b)** — rng por partição×commodity no `formLots` + fita NPC `seed:tN:npc`. `skipAll` corta spoke filler (não só corredor). Produção/fuel/eventos na fita `seed:tN` (iguais ao build anterior). Lots/NPC **não** replay bit-a-bit vs Fase 2. Bench: tick 1 ~**10s**; regime ~**2s**/tick (`formLots` ~0.8–1.3s, npc ~0.8–1.1s). Board no cap ainda gasta ~1s em países *abaixo* da quota (skipAll falso). UI `+1 day` já em chunks de 8. Restante: NPC scan in-range.
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
25. ~~**MENA-6 Yemen**~~ — YE; seed **858**; ports **106**; fuel trucks **255**. ICAO: OYSN/OYAA. Homolog after rebuild.
26. ~~**Asia-1 Pakistan**~~ — PK; seed **864**; ports **107**; fuel trucks **265**. ICAO: OPIS (not OPRN)/OPKC. Homolog after rebuild.
27. ~~**Asia-2 India west**~~ — IN; seed **872**; ports **108**; fuel trucks **275**. ICAO: VIDP (not VIDD)/VABB/VOGO (not VOGA). Homolog after rebuild.
28. ~~**Asia-3 India south/east**~~ — IN; seed **880**; ports **110**; fuel trucks **285**. ICAO: VOBL (not VOBG)/VOMM/VOHS (not VOHY)/VECC. Homolog after rebuild.
29. ~~**Asia-4 Sri Lanka**~~ — LK; seed **884**; ports **111**; fuel trucks **295**. ICAO: VCBI (not VCCC-as-major)/VCRI. Homolog after rebuild.
30. ~~**Asia-5 Central Asia west**~~ — KZ/UZ/TM; seed **894**; ports **113**; fuel trucks **320**. ICAO: UTTT (not UTNN-as-major)/UTAK (not UTBK). Homolog after rebuild.
31. ~~**Asia-6 Central Asia east**~~ — TJ/KG; seed **899**; ports **113**; fuel trucks **340**. ICAO: UCFM (not UAFM)/UCFO (not UAFO); UTDK dropped (no stock MSFS). Homolog after rebuild.
32. ~~**Asia-7 Afghanistan**~~ — AF; seed **903**; ports **113**; fuel trucks **350**. ICAO: OAKB (not OAIX). Homolog after rebuild.
33. ~~**Asia-8 Nepal / Bangladesh**~~ — NP/BD; seed **910**; ports **114**; fuel trucks **365**. ICAO: VNKT/VNPK (not VNPR)/VGHS (not VGZR). Homolog after rebuild.
34. ~~**Asia-9 Bhutan / Myanmar**~~ — BT/MM; seed **916**; ports **115**; fuel trucks **380**. ICAO: VQPR/VYYY (not Mexico MM*). Homolog after rebuild.
35. ~~**Asia-10 Thailand**~~ — TH; seed **924**; ports **117**; fuel trucks **395**. ICAO: VTBS (not VTBD-as-major)/VTBU/VTSP. Homolog after rebuild.
36. ~~**Asia-11 Vietnam / Malaysia / Singapore**~~ — VN/MY/SG; seed **934**; ports **121**; fuel trucks **420**. ICAO: VVNB/VVTS (not VVGL/VVLT)/WMKK/WSSS. Homolog after rebuild.
37. ~~**Asia-12 Indonesia / East Malaysia / Philippines**~~ — ID/PH + MY-E/MY-K; seed **948**; ports **128**; fuel trucks **470**. ICAO: WIII (not WIHH)/WIMM (not WIMK)/RPLL/RPMY (not RPML). Homolog after rebuild.
38. ~~**Asia-13 China / Japan / Korea**~~ — CN/JP/KR; seed **962**; ports **134**; fuel trucks **525**. ICAO: ZBAA (not ZBAD-as-major)/ZSPD (not ZSSS-as-major)/RJAA (not RJTT-as-major)/RKSI (not RKSS). Homolog after rebuild.
39. ~~**Asia-14 Taiwan / Australia / New Zealand**~~ — TW/AU/NZ; seed **974**; ports **141**; fuel trucks **565**. ICAO: RCTP (not RCSS-as-major)/YSSY (not YSBK)/YMML (not YMEN)/NZAA (not NZWN). Homolog after rebuild.
40. ~~**Asia-15 China inland / Pacific hinge**~~ — CN inland + US-HI/FJ/PG/NC; seed **984**; ports **147**; fuel trucks **585**. ICAO: ZLXY (not ZLSN)/ZPPP/ZYTL/PHNL/NFFN/AYPY/NWWW (not NWWM). Homolog after rebuild.
41. ~~**Asia-16 Guam / Polynesia / Micronesia**~~ — US-GU/US-AS + PF/PW/WS/TO; seed **990**; ports **153**; fuel trucks **615**. ICAO: PGUM (not PGUA)/NTAA/PTRO/NSTU/NSFA/NFTF (not NFTV). Homolog after rebuild.
42. ~~**Asia-17 Vanuatu / Solomon / Cook / Kiribati**~~ — VU/SB/CK/KI; seed **994**; ports **157**; fuel trucks **635**. ICAO: NVVV (not NVSS)/AGGH (not AGGM)/NCRG (not NCAI)/NGTA (not PLCH). Homolog after rebuild.
43. Homologar wing tanks Twin Otter com vars corretas + writetest (só se quiser range completo).
44. Dual-client IPC — **só** se freeze Watch+inject ainda aparecer no 0.3.24+.
45. ~~**Asia-18 Saipan (PGSN / US-MP)**~~ — US-MP; seed **995** / **158** ports / **640** trucks. Homolog after rebuild.
46. ~~**Asia-19 Kiritimati (PLCH / KI-L)**~~ — KI-L; seed **996** / **159** ports / **645** trucks.
47. ~~**Asia-20 Vava'u (NFTV / TO-V)**~~ — TO-V; seed **997** / **160** ports / **650** trucks.
48. ~~**Asia-21 Santo (NVSS / VU-S)**~~ — VU-S; seed **998** / **161** ports / **655** trucks.
49. ~~**Asia-22 Munda (AGGM / SB-W)**~~ — SB-W; seed **999** / **162** ports / **660** trucks.
50. ~~**Asia-23 Aitutaki (NCAI / CK-N)**~~ — CK-N; seed **1000** / **163** ports / **665** trucks.
51. ~~**Asia-24 Bora Bora (NTTB / PF-L)**~~ — PF-L; seed **1001** / **164** ports / **670** trucks.
52. ~~**Asia-25 Asau (NSAU / WS-S)**~~ — WS-S; seed **1002** / **165** ports / **675** trucks. **Map seed complete.**
53. ~~**Asia-26 Angaur (ANG / PW-A)**~~ — PW-A; seed **1003** / **166** ports / **680** trucks.
54. ~~**Asia-27 Darwin (YPDN / AU-NT)**~~ — AU-NT; seed **1004** / **167** ports / **685** trucks.
55. ~~**Asia-28 Brunei (WBSB / BN-C)**~~ — BN; seed **1005** / **168** ports / **690** trucks.
56. ~~**Asia-29 Hobart (YMHB / AU-T)**~~ — AU-T; seed **1006** / **169** ports / **695** trucks.
57. ~~**Asia-30 Wellington (NZWN / NZ-W)**~~ — NZ-W; seed **1007** / **170** ports / **700** trucks.
58. ~~**Asia-31 Taiwan south (RCMQ / RCNN)**~~ — TW-C + TW-S; seed **1009** / **170** ports / **710** trucks.
59. ~~**Asia-32 China gap (ZSQD / ZWWW)**~~ — CN-E + CN-W; seed **1011** / **171** ports / **720** trucks. **Pacific/Asia map complete.**
60. ~~**RU-1 Russia core**~~ — RU; seed **1021** / **174** ports / **750** trucks. ICAO: UUEE/UUDD/ULLI/UNNT/UHWW/**URRP** (not URRR). Homolog after rebuild.
61. ~~**RU-2 Russia gaps**~~ — +8 hubs (ULMM/UMKK/UNKL/UIII/UEEE/UHMM/UHPP/URSS); seed **1029** / **176** ports / **765** trucks. Homolog after rebuild.
62. ~~**CN-2 China densify**~~ — +16 hubs (ZYTX/ZYCC/ZYHB/ZBHH/ZSHC/ZSNJ/ZHCC/ZSNB/ZSFZ/ZGHA/ZGNN/ZJHK/ZJSY/ZUGY/ZLLL/ZLIC); seed **1045** / **178** ports / **780** trucks. Skip ZBTJ/ZUTF. Homolog after rebuild.
63. ~~**RU-3 Russia densify**~~ — +22 hubs to **40** RU; seed **1067** / **180** ports / **800** trucks. Skip URRR. Homolog after rebuild.
64. ~~**AF-1 Sub-Saharan core**~~ — NG/GH/SN/CI/KE/ET/ZA/TZ/AO/CM; seed **1084** / **191** ports / **880** trucks. ICAO: DNMM/HKJK/FAOR/GOOY/FALE/FNLU. Homolog after rebuild.
65. ~~**AF-2 Sub-Saharan densify**~~ — UG/RW/MZ/NA/BW + DNKN/DGSI; seed **1093** / **194** ports / **920** trucks. ICAO: HUEN/HRYR/FQMA/**FQBR**/FYWH/FBSK. Homolog after rebuild.
66. ~~**AF-3 Sub-Saharan leftovers**~~ — ZM/ZW/MW/CD + GOTT; seed **1101** / **195** ports / **960** trucks. ICAO: FLKK (not FLLS), FVHA (not FVRG), FVBU, FWKI, FWCL, FZAA (not FZAB), FZQA, GOTT (not GOTB). Homolog after rebuild.
67. ~~**AF-4 Central Africa / Congo basin**~~ — CG/GA/GQ/CF/TD/BI + FZIC; seed **1110** / **199** ports / **1005** trucks. ICAO: FCBB/FCPP/FOOL/FOOG/FGSL/FEFF/FTTJ/HBBA/FZIC (not FZIA). Homolog after rebuild.
68. ~~**AF-5 West Africa leftovers**~~ — BJ/TG/BF/ML/NE/GN/SL/LR/GM/GW/CV/ST; seed **1122** / **208** ports / **1065** trucks. ICAO: DBBB/DXXX (not DXNG)/DFFD/GABS (not GAGO)/DRRN/GUCY/GFLL/GLRB (not GLMR)/GBYD/GGOV/GVAC/FPST. Island hops GVAC–GOOY, FPST–FOOL/FGSL. Homolog after rebuild.
69. ~~**AF-6 leftovers**~~ — MR/MG/MU/SC/KM/LS/SZ; seed **1130** / **213** ports / **1105** trucks. ICAO: GQNO (not GQNN)/FMMI/FMMT/FIMP (not FIMR)/FSIA (not FSPP)/FMCH/FXMM/FDSK (not FDMS). Island hops FMMI–FIMP–FSIA–FMCH plus GQNO–GOOY / FMMI–FQMA / FXMM–FAOR / FDSK–FAOR. Homolog after rebuild.
70. ~~**AF-7 Horn of Africa**~~ — SO/DJ/ER/SS; seed **1134** / **216** ports / **1125** trucks. ICAO: HCMM/HDAM/HHAS/HJJJ (not HSSJ). Hops HCMM–HKJK/HDAM, HDAM–HAAB/HHAS, HHAS–HAAB, HJJJ–HUEN/HSSK/HKJK. Homolog after rebuild.
71. ~~**EU-1 Macaronesia densify**~~ — LPMA / LPPD / GCLP (not LPPS / LPLA / GCTS); seed **1137** / **219** ports / **1140** trucks. Isolated **PT-M** / **PT-A** / **ES-CN**. Island hops LPMA–GCLP, LPPD–GCLP, GCLP–GMMN, LPMA–GMMN, GCLP–GQNO, GCLP–GVAC. Homolog after rebuild.
72. ~~**Pacific island-neighbor gap**~~ — Nadi **NFFN**–Port Vila **NVVV** / Nouméa **NWWW** (Fiji was AU/NZ-only). Lanes >= **399**.
73. **Next:** MR GQPP / DRC FZNA / EG FGBT / CV GVNP / FLSK if homolog proves stock. Africa country coverage complete except those densify leftovers.

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
