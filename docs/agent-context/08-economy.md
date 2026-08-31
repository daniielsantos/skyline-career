# Economia (ponteiro)

Não duplicar o roadmap aqui — a fonte da verdade é:

**`.cursor/rules/career-economy-roadmap.mdc`**

## Em poucas linhas

- Tick = **15 min** wall-clock (`TICKS_PER_DAY = 96`). Física de voo/MX em horas reais.
- Lots / Market / NPC / fuel trucks / hub levels / aircraft market / wear / ledger / SQLite store.
- **Crew needed (starter):** global cap `~0.4×regiões` (GA/TP) stays; **piso local** `10` (+4/company, máx 40 no gancho MP) no `homeCountryId` — overflow do cap global enquanto o país-home está abaixo do piso (sem teto duro local); hold **0.5–2 h** abaixo do piso, **3–8 h** acima. Banda jet+ sem piso.
- **Aircraft pool (design locked, 2026-08-19; cota SKU 2026-08-20):** cap por país (BR=62 hubs=1.0, teto 1.5×); **cota igual por SKU** + mínimo mundial por modelo (leves 1 / medium 2 / narrow+wide **3**); BR/US 1-de-cada nas leves; dealer **50%** vs listar; NPC compra por fair. **Lease:** taxa semanal ↑, cobrança /wk, termo máx **3 mo**, depósito 4 semanas. Roadmap F0–F7: [`10-aircraft-pool.md`](./10-aircraft-pool.md).
- **TP buy/lease anti-snowball (2026-08-27):** `light_turboprop` MSRP 450k; cargo mult 0.72–2.8; lease rate 2.2%/wk; fair/tired used + hours haircut menos agressivos; dealer lease weekly × condição leve (excellent≠fair). ATR/Saab ficam em TP — preço via curva, não `medium_piston`.
- **GA buy/lease anti-snowball (2026-08-27):** `light_ga` MSRP 140k; lease rate 2.0%/wk. Titan/BN2/Duke sobem via curva de cargo; Titan permanece `light_ga` (não reclass TP).
- **Light jet buy/lease anti-snowball (2026-08-27):** `light_jet` MSRP 1.05M; lease rate 1.9%/wk. Cruise/range ainda fora da fórmula (só cargo).
- **Narrow buy/lease anti-snowball (2026-08-31):** `narrow_freighter` MSRP **2.8M**; lease **2.4%/wk**; dealer lease × horas. Metodologia: [`18-aircraft-pricing-balance.md`](./18-aircraft-pricing-balance.md).
- **Wide buy/lease anti-snowball (2026-08-31):** `wide_freighter` MSRP **14M** (era 6.5M); lease **1.5%/wk** (era 1.2%); dealer lease × horas. Alvo ~**1.4 voos/sem** MD-11 @ 90t/3500nm; buy ~**107 voos**.
- **Schema v4:** hubs + stock em tabelas (`airports` / `airport_stock`) com `world_id`; tick ainda in-memory; terminal Inventory usa `GET /api/airport?part=stock` (SQL, sem lock); payload completo (lots/NPC) hidrata depois.
- **Schema v5:** NPC roster, fuel trucks/hauls, Demand board e port listings/inventory/concessions em tabelas (`world_id`); arrays stripped de `economy_json`. Tick ainda in-memory. WH/concessões do player ficam no `company_state`.
- **Schema v6:** dealer pool (`aircraft_instances`) keyed by `world_id`; unique registration; stripped from `economy_json`. Tick still in-memory.
- Partição por país (`homeCountryId` / região `XX-YY` → país `XX`).
- **América do Sul completa** no seed: BR/AR/CL + UY/PY/PE/BO/EC/CO/VE/GY/SR/GF.
- **América Central completa** no seed: PA/CR/NI/HN/GT/SV/BZ.
- **Caribe (intl-first)** no seed: CU/DO/HT/JM/BS/TT/BB/LC/GD/AG + dependências GP/MQ/CW/**SX/AW**; **Puerto Rico = US-PR**, **USVI = US-VI** (país US).
- **EU-1 Western core** no seed: PT/ES/FR/GB/DE/NL/BE/IT.
- **EU-2 Nordics + Alps + IE** no seed: IE/DK/NO/SE/FI/CH/AT.
- **EU-3 Central-East + Baltics** no seed: PL/CZ/SK/HU/EE/LV/LT.
- **EU-4 Balkans** no seed: HR/SI/RO/BG/GR/RS.
- **EU-5 Iceland** no seed: IS.
- **EU-6 W. Balkans** no seed: BA/ME/AL/MK.
- **EU-7 East** no seed: TR/UA.
- **EU-8 Europe gaps** no seed: BY/MD/GE/AM/AZ/LU/MT/CY/XK — **778** airports; **84** ports; fuel trucks **158**. Europe countries-with-hubs complete (UGKO omitted — not in stock MSFS).
- **MENA-1 Mediterranean face** no seed: MA/DZ/TN/EG/IL — **803** airports; **89** ports; fuel trucks **175**. ICAO traps: HEBA (not HEAX), GMFF, LLER.
- **MENA-2 Gulf** no seed: SA/AE/QA/BH/KW/OM — **827** airports; **97** ports; fuel trucks **195**. ICAO: OTHH (not OTBD as major), OMDB, OERK, OETF (not OETH), OKKK (not OKBK).
- **MENA-3 North Gulf** no seed: IQ/IR — **841** airports; **99** ports; fuel trucks **215**. ICAO: ORBI (not ORBS), ORMM, OIIE (OIII regional), OIKB Bandar Abbas (not OIBA), OIKK Kerman.
- **MENA-4 Levant-east** no seed: JO/LB/SY — **848** airports; **102** ports; fuel trucks **230**. ICAO: OJAI (not OJAM-as-only-major), OLBA, OSDI.
- **MENA-5 Maghreb/Nile gap** no seed: LY/SD — **854** airports; **104** ports; fuel trucks **245**. ICAO: HLLM (not HLLT), HLLB, HSSK (not HSSS), HSPN.
- **MENA-6 Yemen** no seed: YE — **858** airports; **106** ports; fuel trucks **255**. ICAO: OYSN, OYAA.
- **Asia-1 Pakistan** no seed: PK — **864** airports; **107** ports; fuel trucks **265**. ICAO: OPIS (not OPRN), OPKC.
- **Asia-2 India west** no seed: IN — **872** airports; **108** ports; fuel trucks **275**. ICAO: VIDP (not VIDD), VABB, VOGO (not VOGA).
- **Asia-3 India south/east** no seed: IN — **880** airports; **110** ports; fuel trucks **285**. ICAO: VOBL (not VOBG), VOMM, VOHS (not VOHY), VECC.
- **Asia-4 Sri Lanka** no seed: LK — **884** airports; **111** ports; fuel trucks **295**. ICAO: VCBI (not VCCC-as-major), VCRI.
- **Asia-5 Central Asia west** no seed: KZ/UZ/TM — **894** airports; **113** ports; fuel trucks **320**. ICAO: UTTT (not UTNN-as-major), UTAK (not UTBK).
- **Asia-6 Central Asia east** no seed: TJ/KG — **899** airports; **113** ports; fuel trucks **340**. ICAO: UCFM (not UAFM), UCFO (not UAFO); UTDK omitted (no stock MSFS).
- **Asia-7 Afghanistan** no seed: AF — **903** airports; **113** ports; fuel trucks **350**. ICAO: OAKB (not OAIX).
- **Asia-8 Nepal / Bangladesh** no seed: NP/BD — **910** airports; **114** ports; fuel trucks **365**. ICAO: VNKT, VNPK (not VNPR), VGHS (not VGZR).
- **Asia-9 Bhutan / Myanmar** no seed: BT/MM — **916** airports; **115** ports; fuel trucks **380**. ICAO: VQPR, VYYY (country MM / ICAO VY*).
- **Asia-10 Thailand** no seed: TH — **924** airports; **117** ports; fuel trucks **395**. ICAO: VTBS (not VTBD-as-major), VTBU, VTSP.
- **Asia-11 Vietnam / Malaysia / Singapore** no seed: VN/MY/SG — **934** airports; **121** ports; fuel trucks **420**. ICAO: VVNB/VVTS (not VVGL/VVLT), WMKK, WSSS.
- **Asia-12 Indonesia / East Malaysia / Philippines** no seed: ID/PH + MY-E/MY-K — **948** airports; **128** ports; fuel trucks **470**. ICAO: WIII (not WIHH), WIMM (not WIMK), RPLL, RPMY (not RPML).
- **Asia-13 China / Japan / Korea** no seed: CN/JP/KR — **962** airports; **134** ports; fuel trucks **525**. ICAO: ZBAA/ZSPD (not ZBAD/ZSSS as major), RJAA (not RJTT as major), RKSI (not RKSS).
- **Asia-14 Taiwan / Australia / New Zealand** no seed: TW/AU/NZ — **974** airports; **141** ports; fuel trucks **565**. ICAO: RCTP (not RCSS as major), YSSY (not YSBK), YMML (not YMEN), NZAA (not NZWN).
- **Asia-15 China inland / Pacific hinge** no seed: CN inland + US-HI/FJ/PG/NC — **984** airports; **147** ports; fuel trucks **585**. ICAO: ZLXY (not ZLSN), ZPPP, ZYTL, PHNL, NFFN, AYPY, NWWW (not NWWM).
- **Asia-16 Guam / Polynesia / Micronesia** no seed: US-GU/US-AS + PF/PW/WS/TO — **990** airports; **153** ports; fuel trucks **615**. ICAO: PGUM (not PGUA), NTAA, PTRO, NSTU, NSFA, NFTF (not NFTV).
- **Asia-17 Vanuatu / Solomon / Cook / Kiribati** no seed: VU/SB/CK/KI — **994** airports; **157** ports; fuel trucks **635**. ICAO: NVVV (not NVSS), AGGH (not AGGM), NCRG (not NCAI), NGTA (not PLCH).
- **Asia-18–25 Pacific micro-hubs** no seed: US-MP/KI-L/TO-V/VU-S/SB-W/CK-N/PF-L/WS-S — **1002** airports; **165** ports; fuel trucks **675**. ICAO: PGSN, PLCH, NFTV, NVSS, AGGM, NCAI, NTTB, NSAU. Demand pairs: KI/US, TO/CK, TO/US, WS/TO.
- **Asia-26 Angaur micro-slice:** PW-A **ANG** — part of batch through **1011** airports.
- **Asia-27–32 Pacific/Asia cleanup batch:** YPDN, WBSB, YMHB, NZWN, RCMQ/RCNN, ZSQD/ZWWW — **1011** airports; **171** ports; fuel trucks **720**; **138** countries. **Pacific/Asia map complete** (ZUTF Tianfu still skipped by design).
- **RU-1 Russia core** no seed: RU — **1021** airports; **174** ports; fuel trucks **750**; **139** countries. ICAO: UUEE/UUDD (Moscow majors), ULLI, UNNT, UHWW, **URRP** (not closed URRR); ports St Petersburg / Novorossiysk / Vladivostok. Sparse UA/BY/FI/NO/PL/KZ/CN/JP/GE/TR lanes.
- **RU-2 Russia gaps** no seed: +8 hubs Arctic/Siberia/Pacific — **1029** airports; **176** ports; fuel trucks **765**. ICAO: ULMM, UMKK, UNKL, UIII, UEEE, UHMM, UHPP, URSS; ports Murmansk / Kaliningrad.
- **CN-2 China densify** no seed: +16 hubs — **1045** airports; **178** ports; fuel trucks **780**; CN **30** hubs. ICAO: ZYTX/ZYHB/ZSHC/ZSNJ/ZHCC/ZSNB/ZGHA/ZGNN/ZJHK + spokes. Skip ZBTJ/ZUTF. Ports Ningbo / Haikou.
- **RU-3 Russia densify** no seed: +22 hubs — **1067** airports; **180** ports; fuel trucks **800**; RU **40** hubs. ICAO: UUWW/ULAA/UWKD/UWUU/USPP/URKK/UNOO/USRR/UHSS + spokes. Skip URRR. Ports Arkhangelsk / Korsakov.
- **AF-1 Sub-Saharan core** no seed: NG/GH/SN/CI/KE/ET/ZA/TZ/AO/CM — **1084** airports; **191** ports; fuel trucks **880**; **149** countries. ICAO: DNMM (not DNAA-as-only-major), GOOY (not GOBD), HKJK (not HKNW), FAOR (not FALA), FALE (not FADN), FNLU (not FNUB). Ports Lagos / Port Harcourt / Tema / Dakar / Abidjan / Mombasa / Cape Town / Durban / Dar / Luanda / Douala. Addis landlocked (no port).
- **AF-2 Sub-Saharan densify** no seed: UG/RW/MZ/NA/BW + NG **DNKN** + GH **DGSI** — **1093** airports; **194** ports; fuel trucks **920**; **154** countries. ICAO: HUEN, HRYR, FQMA, **FQBR** (not FQBE), FYWH (not FYWE), FBSK (not FBMN). Ports Maputo / Beira / Walvis Bay. UG/RW/BW landlocked.
- **AF-3 Sub-Saharan leftovers** no seed: ZM/ZW/MW/CD + SN **GOTT** — **1101** airports; **195** ports; fuel trucks **960**; **158** countries. ICAO: FLKK (not FLLS), FVHA (not FVRG), FVBU (not FVJN), FWKI, FWCL, FZAA (not FZAB), FZQA, GOTT (not GOTB). Port Matadi (pickup FZAA). ZM/ZW/MW landlocked. Skip Ndola FLSK.
- **AF-4 Central Africa / Congo basin** no seed: CG/GA/GQ/CF/TD/BI + CD **FZIC** — **1110** airports; **199** ports; fuel trucks **1005**; **164** countries. ICAO: FCBB, FCPP, FOOL, FOOG, FGSL (not OCS), FEFF, FTTJ, HBBA, FZIC (not FZIA). Ports Pointe-Noire / Libreville / Port-Gentil / Malabo. CF/TD/BI landlocked. Skip FLSK / FZNA / FGBT.
- **AF-5 West Africa leftovers** no seed: BJ/TG/BF/ML/NE/GN/SL/LR/GM/GW/CV/ST — **1122** airports; **208** ports; fuel trucks **1065**; **176** countries. ICAO: DBBB, DXXX (not DXNG), DFFD, GABS (not GAGO), DRRN, GUCY, GFLL, GLRB (not GLMR), GBYD, GGOV, GVAC, FPST. Island hops: Sal–Dakar, São Tomé–Libreville/Malabo. BF/ML/NE landlocked. Skip MR / GVNP.
- **AF-6 leftovers** no seed: MR/MG/MU/SC/KM/LS/SZ — **1130** airports; **213** ports; fuel trucks **1105**; **183** countries. ICAO: GQNO (not GQNN), FMMI, FMMT, FIMP (not FIMR), FSIA (not FSPP), FMCH, FXMM, FDSK (not FDMS). Ports Nouakchott / Toamasina / Port Louis / Victoria / Moroni. LS/SZ landlocked. Indian Ocean hops: FMMI–FIMP–FSIA–FMCH plus GQNO–GOOY / FMMI–FQMA / FXMM–FAOR / FDSK–FAOR. Skip FLSK / Horn / GVNP.
- **AF-7 Horn of Africa** no seed: SO/DJ/ER/SS — **1134** airports; **216** ports; fuel trucks **1125**; **187** countries. ICAO: HCMM, HDAM, HHAS, HJJJ (not HSSJ). Ports Mogadishu / Djibouti / Massawa (pickup HHAS). SS landlocked. Hops: Mogadishu–Nairobi/Djibouti, Djibouti–Addis/Asmara, Asmara–Addis, Juba–Entebbe/Khartoum/Nairobi. Remap HSSJ→HJJJ. Skip Hargeisa / GQPP / FZNA / FGBT / GVNP / FLSK.
- **EU-1 Macaronesia densify** no seed: Madeira **LPMA**, Azores **LPPD**, Canaries **GCLP** (not LPPS / LPLA / GCTS) — **1137** airports; **219** ports; fuel trucks **1140**; **187** countries. Isolated regions PT-M / PT-A / ES-CN (air trunks to mainland, no road). Island hops: Madeira–Canaries–Azores plus Casablanca / Nouakchott / Sal. Ports Funchal / Ponta Delgada / Las Palmas.
- **US inland ports (2026-08-30):** Mississippi / Ohio / Great Lakes ocean-linked — St. Louis (**USSTL**/KSTL), Memphis (**USMEM**/KMEM), Chicago (**USCHI**/KORD), Pittsburgh (**USPIT**/KPIT), Duluth–Superior (**USDLH**/KDLH). +hubs KPIT/KDLH.
- **US continental densify (2026-08-30):** rede continental **~230** (+108 comerciais MSFS/SimBrief em `career-us-hubs-densify.ts`).
- **BR densify (2026-08-30):** rede BR **~95** (+35 SB* comerciais em `career-br-hubs-densify.ts`). Seed **1281** airports / **224** ports.
- **Pacific island-neighbor gap:** Nadi **NFFN** hops to Port Vila **NVVV** and Nouméa **NWWW** (was AU/NZ-only). Demand pairs FJ–VU / FJ–NC. Intl lanes >= **399**.
- **Pulse tick 1896 pós last-mile unlock:** BR/US spoke live **~97–98%**; Dry/last-mile no spoke OK; SBPV diversificou para feeders. Board 7.4k; GA↑ (~44%) por last-mile; med sweet ~15%. Sem `CARGO_FLOW_BALANCE`.
- **Spoke last-mile unlock (2026-08-30):** skipAll não zera mais last-mile — budget **12** GA Dry de dead spokes/país×SKU. Spoke dest sort: feeder antes de major (corrige SBPV→SBEG). Sem `CARGO_FLOW_BALANCE`.
- **Spoke last-mile dest bias (2026-08-30):** spoke↔spoke permitido (soft feeder + last-mile). Em spokes com corredor curado (ex. **SBPV↔SBEG** w=1.4), sort last-mile `cw↓` + formCap 2 fixava o major — mitigado pelo unlock acima.
- **Last-mile dest = absRoom only (2026-08-30):** sem fill% no dest; só `cap−stock ≥ viable`. Fill 0.92 ainda matava BR/US densify (~93%). Bulk soft 48/58 intacto.
- **Pulse tick 1510 pós-absRoom:** live BR 42% / US 25% (↑ vs 1222). AbsRoom funciona no mundo (last-mile com dest ~92% fill). BR/US Dry board quase vazio → **skipAll/quota** densify, não dest. Sem `CARGO_FLOW_BALANCE`.
- **Last-mile dest Dry sat (2026-08-30):** last-mile only — dest fill ≤**0.92** + `absRoomKg=cap−stock` (não soft 58%). Qty/sort no abs headroom. Bulk soft 48/58 intacto. **Fuel ≠ formLots** (`CAREER_CARGO_COMMODITIES` exclui Jet-A).
- **Spoke vitality postmortem (tick ~1318):** dead spokes cheios de Dry (eligible ~86–98%) mas **0** last-mile Dry BR/US com origem spoke. Bloqueio = **dest** (`roomKg` no soft 58% + `LAST_MILE_MAX_DEST_FILL` 0.62) sob Dry sat — não origin caps. Sem `CARGO_FLOW_BALANCE` ainda.
- **Pulse tick 1222 Dans (~12.7d):** live piorou vs 1029 (BR 32% / US 22%). Board/size mix estáveis. Spoke vitality slice ainda não reverte tendência — ver stock Dry nos spokes / skipAll; confirmar server rebuild.
- **Spoke vitality / densify (2026-08-30):** last-mile spoke open/form **2**, fill≥**0.14**, stock share **0.55**; até **16** dead spokes/tick (rotação por `tick`) → major/regional → resto; soft feeder `rng()>0.48` (~52%). Sem `CARGO_FLOW_BALANCE`.
- **Pulse tick 1029 Dans (2026-08-30):** ~10.7d. Live hubs caindo (BR 50% / US 26%, spoke dead). Size mix ok pós-retune (GA↓ TP↑); medium sweet fraco. Dry/general ~85% fill — não retunar `CARGO_FLOW_BALANCE` ainda. Artefatos: `economy-pulse-plus3d-dans-diag.json`, canvas day11.
- **formLots size mix (2026-08-30):** `sizeSmallLotKg` — spoke OD GA chance ~16–32% (não 100%); feeder LTL ≥500 kg / steps 50. `LARGE_LOT_MIN_KG=2200`. Spoke profile flowMult 0.68, maxLots/maxSmall 3; filler spoke↔spoke/regional. Last-mile caps por tier (spoke open/form 2; fill spoke ≥0.14). Não mexer em `CARGO_FLOW_BALANCE` sem medir. Testes: `career-form-lots-size.test.ts`.
- **Hold-to-viable GA (2026-08-30):** vale para last-mile **e** bulk/INTL GA scraps. `BOARD_SMALL_MIN_VIABLE_KG=180` + pay floor; **intl nunca lista ≤450 kg** (só feeder+); feeder thin também usa trip floor (intl base/cap mais altos). `prune`/`shrink`/Market iguais. Sem inflar $/kg.
- **Tick bench / event loop:** `tickEconomy` síncrono (testes, catch-up load, **fast-forward n&gt;1**). `tickEconomyCooperative` / `tickEconomyNCooperative(n=1)` cede entre países (`setImmediate`); `POST /api/tick` multi-tick usa sync. Profile: `createEmptyTickPhaseProfile` / `summarizeTickPhaseProfile`; API `{profile:true}` → `tickWallMs`+`tickProfile`. Hot atual: formLotsIntl. Sem workers / Dry.
- **Tick perf (2026-08-30):** country cache no airport lookup; intl lanes pré-normalizadas. Persist do `/api/tick` já é 1× no fim do write.
- **formLotsIntl hot-path (2026-08-30):** `ensureLaneInboundIndex` + helpers; filtro surplus/shortage + feeder floor antes de `tryFormPair`; `skipAll` quebra o scan. Mesmo seed → mesmos lots intl (sem retune física).
- Freights domésticos por país; intl só via `CAREER_INTERNATIONAL_LANES`.
- Soft-field **bush** hubs: Market não forma freight nesses ODs — bush trips board **off** por agora (`BUSH_TRIPS_BOARD_ENABLED`).
- **Warehouses** (pickup hubs …): CAPEX + capacity + storage; port buy → **inbound transfer** (ETA ticks) → WH stock (overflow → yard); **partial Store**; **Abandon** yard; **T1/T2/T3** (5/10/15 klb = 2268/4536/6804 kg) hybrid upgrade (shipped gate + CAPEX).
- **Demand Board (per-port desk):** NPC buy-orders por **porto** (`DemandOrder.portId`); spawn na bacia/raio do porto quando stock do dest está baixo. Caps: **~6 open/porto** (+1 se operator P2+), teto global **192–1280** (port-weighted por país, target **12**), desks rotacionam por tick. Wanted até **12 t** general / **8 t** electronics. **UI** = mesa daquele `portId` (sem All/Mine / sem lente no pool global) + chip `Vacant` / `Operator · you|held` + reach **500 / 1800 / open**. Vago spawna com floor T1/500. **Accept/Hold:** WH ∈ pickups do `order.portId` + dest no raio do player (WH T / concession P). Player-only fulfill (NPC não Accepta). Soft surplus dissolveu na regra da mesa. **Hold** pledges WH + decrements `remainingKg` (TTL T1/T2/T3 = 48/72/96); **Fly now / Dispatch** = WH→dest. Settle = payout + fill terminal + `lifetimeShippedKg`. **Intl (port-fed):** allowlist + pickup hub; pay × **1.28**. Schema: `demand_orders.port_id` (v5).
- **Demand desk /porto (2026-08-30):** base **4→6** open (`DEMAND_ORDERS_PER_PORT_BASE`); hub dest ainda **2**; operator P2+ **+1**. Sem mexer global/country quota.
- **skipAll regional vitality (2026-08-30):** last-mile sob skipAll também forma dead regionals (budget **8**/país×SKU), além dos spokes (**12**).
- **Ports loop UX (slice 1):** `derivePortsLoopStep` — com WH mas stock 0 + `inboundTransfers` → `wait_inbound` (não `buy_port`); com stock sem match → `wait_demand` + `openDemandCount`. Banner quando aba ≠ passo; hint na Demand.
- **Demand per-port desk (2026-08-30):** substitui corridor-only lens — ver `career-demand.ts` / `career-port-corridor.ts`.
- **WH air bridge:** player-created WH→WH reposition (Hold / Fly now, no board, `payUsd` 0). Settle deposits dest WH (overflow → dest hub yard); cancel restores origin. Does not credit `lifetimeShippedKg` or fill dest terminal.
- Homologação grava OEW/MTOW live; `maxCargoKg` placeholder (N×500) → preferir SimBrief. Backfill: `npm run airframes:backfill-simbrief-cargo` (dry-run) / `-- --apply`.
- **Demand / Dispatch cargo align:** accept + SimBrief `cargo=` usam teto **ops** offline (fuel+MTOW + crew 2×170 lb; OEW = max(catálogo, SimBrief)) — sem probe live de EMPTY/MTOW. Evita OFP 2.2 klb quando inject só carrega ~1.7.
- **SimBrief type vs frota:** Dispatch prioriza roles pack + `simbriefIcao` do **SKU** (`airframeTypeId`), não o pack da classe. Missões antigas com `light_ga`→Bonanza (`BE36`) no `rolesPackRelPath` ainda abrem **AEST** no Aerostar.
- **Inject freighter CG soft-max:** crew stations usam soft **750** lb (`FREIGHTER_CREW_STATION_SOFT_MAX_LB`, ainda `min` com maxLoad); GA/Accu-Sim ficam em **300**. Due = cargo+crew inalterado.
- **CG shift sem arms:** não mover entre pares L/R (S1↔S2); freighter counterweight usa crew+baggage juntos — evita loop falso no C90. Forward: enche baggage (S3/S4) antes de dump em crew (`deferTargetIndexes`).
- **FBO spot:** removido (stock wipe on load); FBO = bonded holds only.
- **Ports:** acesso oceânico só (mar ou rio/sistema lacustre→mar — ex. Manaus, Mississippi, Great Lakes/Seaway). Buy → WH/yard → Store/Abandon; preço dinâmico. **Inventory:** 1 descarga/dia de economia (8% do cap) no tick — não ao abrir a aba; listings só do pátio já em estoque. **UI pulse:** `port.inbound` sempre no snapshot (ETA mesmo se estimate kg=0); faixa `Next discharge` acima da tabela; empty = “spawn from yard after discharge”. **Buy surplus:** qty ≤ listing/wallet; o que cabe em `warehouseInboundFreeKg` → inbound transfer; resto → **yard pickup** (hold $/day). Não bloqueia compra acima da WH. **Concession:** CAPEX + lease renovável (1/empresa); gates T3 WH + 25k shipped; buffs P1 (~10% preço, ~15% ETA, +1 listing). **P2:** cap ×1.35 (mesmo % de restock); lease escala com throughput 7d (máx ×1.75) + ×1.2 no P2. Sem desconto extra de compra. UI: chip Operator P1/P2. Ao adicionar porto: `CAREER_PORTS` **e** `PICKUP_HUB_SET`.
- **Port P3:** restock 11%/day, +1 listing (board 6), ETA 0.78, lease ×1.4, 180t + $280k. Same ~10% buy as P1. Specials / feeder still backlog.
- **Lot pay shrink (2026-08-20):** entrega parcial (player/NPC) agora **pro-rata** `payUsd`/`basePayUsd` com o `quantityKg` restante — evita Load ~0 klb com Pay de lote inteiro no board.
- **Freight pay retune (2026-08-20):** `quoteFreightLotPay` = arbitragem + haul + **teto total $/kg** (`FREIGHT_TOTAL_CAP_MULT`) × **`freightDistanceCapMult(nm)`** (curto ~0.28 → longo 1.0; Machinery curva própria mais dura) + **tonnage soft** (Machinery soft mais cedo / Wide ×0.32). Haul ≤ **50%** do teto + **URGENT** sobe o teto (×1.1) para gap/tags/scarce/weather ainda moverem pay. Electronics + Machinery no Value-band apertado. **Não** mexeu em `CARGO_FLOW_BALANCE`.
- **Freight boards (2026-08-20):** Freights split into **Aircraft needed** (sua aeronave · lot pay) e **Crew needed** (avião NPC · pilot fee); filtro API `?crew=aircraft|crew`. Terminal Contracts espelha com chips Aircraft/Crew. Hangar vazio abre em Crew.
- **Crew fee $/nm floor (2026-08-30):** ainda **30%** do frete (`CONTRACT_PILOT_FEE_FRAC`); Light GA **1.85 $/nm** · Light TP **2.05 $/nm**; min **$75** (`career-contract-pilot-fee.ts` + mirror UI) — haul longo/fino e last-mile curto. Abaixo do ferry Hangar (~2.13 / 2.5). Sem `CARGO_FLOW_BALANCE`.
- **Crew Net column (2026-08-30):** em Crew needed a coluna Net/Freight é **—** (Pay = teu fee). Não espelhar lote do operador nem fee÷frac — piso $/nm descasava. Sort Net em crew = fee.
- **Dev Mode → Cargo Ops (2026-08-20):** Settings Dev Mode envia `X-Skyline-Dev-Mode`; API usa `unlockAllCareerCargoOps` só nos gates (state/market/accept/staging/ports/demand/FBO) — **não** grava a ladder no save. Toggle Off restaura o progresso real.
- **Dev Mode → Class Ops + lease (2026-08-20):** mesmo header libera **todas** as classes e o gate de lease (Airframes buy/lease + board/crew). `unlockAllCareerClassOps` + `aircraftLeaseUnlockProgressDevOpen`; writes usam `withDevProgressionUnlock` (restaura só se o callback não substituiu o objeto).

## Company tenant (SP → MP)

Contrato curto — detalhe em **`.cursor/rules/career-economy-roadmap.mdc`** (*Company tenant contract*).

- **Company** = tenant (`companies` / `company_state` / `company_id` em frota, missões, ledger). SP usa id `'local'`. `companies.world_id` aponta para o mundo.
- **World** = hubs/stock (`airports` + `airport_stock`), lots, Demand, NPC, `inbound_pending`, events — `world_id = 'local'` no SP; MP = várias companies no mesmo world.
- **Pilot ≠ company** — `pilot_name` / `pilot_icao` no `company_state` são atalho SP; não inchá-los; members/roles só quando houver fatia co-op.
- Norte MP: empresa privada + mundo compartilhado + ranking por company (não rewrite de tick).
- **Relógio MP (esboço):** [14-mp-world-clock.md](./14-mp-world-clock.md) — tick no server 24/7; client só read + comandos; deprecar catch-up local.
- **Catch-up UX (SP):** banner `Economy syncing · N batches behind` quando ≥2 ticks atrasados; capped catch-up **mantém backlog** (drena 1 tick/pulso ~60s) em vez de snipar o relógio.
- **Ports market signals (Loop B):** prosa quieta no port selecionado — `Hub pressure · SBGR General high · SBKP Supplies low` (`portPickupMarketSignals`; surplus→high, shortage→low). Sem chips coloridas.
- **Produto / loja (esboço):** [15-business-model.md](./15-business-model.md) — uma compra, SP+MP, career global; sem DLC de região.
- **VA / ponte aérea (esboço):** [16-va-logistics.md](./16-va-logistics.md) — WH→WH + Demand; desk F1–F3; tiers 1–3 decididos (C porto→porto caiu).
- Ao tocar persistência: estado do jogador sempre sob `company_id`; facade `CareerStore` permanece.

## Ground staff (Ports / WH)

Contrato em **`.cursor/rules/career-economy-roadmap.mdc`** (*Ground staff*).

- Hire/fire + salary (`ground_staff_hire` / `ground_staff_fire` severance / `ground_staff_salary`); slots **1@T1 / 2@T2 / 3@T3**.
- Signing = **7d** salary; fire severance = **5d** salary (blocks hire→buff→fire same-day).
- Grades **ace / solid / capable / green** (skillPct band + frozen `effectMult` at hire).
- Perks shipped: **`logistics`**, **`yard`**, **`procurement`** (port price), **`demand_desk`** (Demand pay), **`wh_ops`** (upgrade CAPEX + shipped credit).
- Hire desk na aba Warehouse (Ports) rola as 5 perks.

## Expandir mapa / país / hub

**`.cursor/rules/career-map-expansion.mdc`** — checklist obrigatório (seed hubs, fuel producers, corridors, REGION_NEIGHBORS, UI labels, tests, migrate coverage).

Sessão recente Chile/SimBrief: `04-hubs-simbrief.md`.

## Portos shipped

| País | Região / nota | Acesso | Porto | Pickup WH | Status |
|------|---------------|--------|-------|-----------|--------|
| BR | BR-SE | mar | Santos | SBGR, SBKP | shipped |
| BR | BR-S | mar | Paranaguá | SBCT | shipped |
| BR | BR-S | mar | Rio Grande | SBPA | shipped |
| BR | BR-NE | mar | Suape | SBRF | shipped |
| BR | BR-N | rio→mar | Manaus | SBEG | shipped |
| BR | BR-N | rio→mar | Vila do Conde | SBBE | shipped |
| BR | BR-CO | — | — | — | skip |
| AR | BA | mar | Buenos Aires | SAEZ | shipped |
| AR | Patagonia | mar | Comodoro Rivadavia | SAVC | shipped |
| AR | AR-CO / AR-NO | — | — | — | skip |
| CL | centro | mar | San Antonio | SCEL | shipped |
| CL | sul | mar | Puerto Montt | SCTE | shipped |
| CL | inland-only | — | — | — | skip |
| US | SE | mar | Miami | KMIA | shipped |
| US | NE | mar | New York / New Jersey | KEWR | shipped |
| US | Gulf | mar | Houston | KIAH | shipped |
| US | West | mar | Los Angeles / Long Beach | KLAX | shipped |
| US | NW | mar | Seattle | KSEA | shipped |
| US | MW / MT | — | — | — | skip |
| CA | CA-W | mar | Vancouver | CYVR | shipped |
| CA | CA-AT | mar | Halifax | CYHZ | shipped |
| MX | MX-S | mar | Veracruz | MMVR | shipped |
| MX | MX-C | mar | Manzanillo | MMZO | shipped |
| MX | MX-Y | mar | Cancún | MMUN | shipped |

Map countries with ports closed for ocean-access set: **BR, AR, CL, US, CA, MX** (20 ports).