# Economia (ponteiro)

Não duplicar o roadmap aqui — a fonte da verdade é:

**`.cursor/rules/career-economy-roadmap.mdc`**

## Em poucas linhas

- Tick = **15 min** wall-clock (`TICKS_PER_DAY = 96`). Física de voo/MX em horas reais.
- **MX fuel settle-only (2026-09-01):** wear &lt;90% → Watch **accrue** excess burn in flight (no sim writes); settle debita do tank career (`settledMxFuelDrainKg`). Inject e clássico iguais. Offline: `estimateMxFuelDrainKgForSettle`.
- Lots / Market / NPC / fuel trucks / hub levels / aircraft market / wear / ledger / SQLite store.
- **Crew needed (starter):** global cap `~0.4×regiões` (GA/TP) stays; **piso local** `10` (+4/company, máx 40 no gancho MP) no `homeCountryId` — overflow do cap global enquanto o país-home está abaixo do piso (sem teto duro local); hold **0.5–2 h** abaixo do piso, **3–8 h** acima. Banda jet+ sem piso.
- **Aircraft pool (design locked, 2026-08-19; cota SKU 2026-08-20):** cap por país (BR=62 hubs=1.0, teto 1.5×); **cota igual por SKU** + mínimo mundial por modelo (leves 1 / medium 2 / narrow+wide **3**); BR/US 1-de-cada nas leves; dealer **50%** vs listar; NPC compra por fair. **Lease:** taxa semanal ↑, cobrança /wk, termo máx **3 mo**, depósito 4 semanas. Roadmap F0–F7: [`10-aircraft-pool.md`](./10-aircraft-pool.md).
- **TP buy/lease anti-snowball (2026-08-27):** `light_turboprop` MSRP 450k; cargo mult 0.72–2.8; lease rate 2.2%/wk; fair/tired used + hours haircut menos agressivos; dealer lease weekly × condição leve (excellent≠fair). ATR/Saab ficam em TP — preço via curva, não `medium_piston`.
- **GA buy/lease anti-snowball (2026-08-27):** `light_ga` MSRP 140k; lease rate 2.0%/wk. Titan/BN2/Duke sobem via curva de cargo; Titan permanece `light_ga` (não reclass TP).
- **Light jet buy/lease anti-snowball (2026-08-31):** `light_jet` MSRP **750k** (era 1.05M); lease **2.3%/wk** (era 1.9%). Lear @ 1.4t/800nm ~**4.8 voos/sem** · buy ~**214**. Cruise/range ainda fora da fórmula (só cargo).
- **Medium piston buy/lease anti-snowball (2026-08-31):** `medium_piston` MSRP **1.8M** (era 1.2M); lease **2.0%/wk** (era 1.35%). Alvo ~**1.3 voos/sem** DC-6 @ 10t/1200nm; buy ~**66 voos**. Metodologia: [`18-aircraft-pricing-balance.md`](./18-aircraft-pricing-balance.md).
- **Narrow buy/lease anti-snowball (2026-08-31):** `narrow_freighter` MSRP **2.8M**; lease **2.4%/wk**; dealer lease × horas. Metodologia: [`18-aircraft-pricing-balance.md`](./18-aircraft-pricing-balance.md).
- **Wide buy/lease anti-snowball (2026-08-31):** `wide_freighter` MSRP **14M** (era 6.5M); lease **1.5%/wk** (era 1.2%); dealer lease × horas. Alvo ~**1.4 voos/sem** MD-11 @ 90t/3500nm; buy ~**107 voos**.
- **Schema v4:** hubs + stock em tabelas (`airports` / `airport_stock`) com `world_id`; tick ainda in-memory; terminal Inventory usa `GET /api/airport?part=stock` (SQL, sem lock); payload completo (lots/NPC) hidrata depois.
- **Schema v5:** NPC roster, fuel trucks/hauls, Demand board e port listings/inventory/concessions em tabelas (`world_id`); arrays stripped de `economy_json`. Tick ainda in-memory. WH/concessões do player ficam no `company_state`.
- **Schema v6:** dealer pool (`aircraft_instances`) keyed by `world_id`; unique registration; stripped from `economy_json`. Tick still in-memory.
- **Schema v7→v8:** `hub_economy_samples` — daily Hub Stats + network pulse dims (country/tier/stock/inbound/lot counts); 30d prune; see [`19-hub-stats.md`](./19-hub-stats.md).
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
- **EU-1 West densify (2026-09-02):** +66 hubs comerciais — NL **10** / BE **8** / DE **24** / GB **22** / FR **24** / IT **22** / ES **23** / PT **14** (`career-*-hubs-densify.ts`). Seed **1347** airports / **224** ports. Fuel anchors densify: EHBK/EBLG/EDLW/EDFH/EDDG/EGPK/EGAA/EGFF/LFQQ/LFMT/LIMF/LIEE/LEVC. Pulse: lente **EU** + `focusCountries` BR/US/EU/DE/FR/GB; script `scripts/analyze-eu-west-economy.mjs`. Gate 7–14d: live% país ≥85%, lots↑, fill ~35–55%. Sem `CARGO_FLOW_BALANCE`. ICAO traps: **não** LPPS (usar LPMA), **não** LPLA, **não** GCTS; Viseu **LPVZ** (não LPVL); Portimão **LPPM** (não LPSI Sines); prefer spoke belt DE (não EDDT).
- **CA/MX densify (2026-09-02):** +27 CA / +27 MX (`career-ca-hubs-densify.ts` / `career-mx-hubs-densify.ts`) → **CA 80** / **MX 73**. No bush. Regionals CA: CYMX/CYQT/CYMM/CYZF/CYXY/CYQX; MX: MMMZ/MMSM. Fuel: CYQT/CYMM/CYZF/CYXY/CYQX, MMMZ/MMSM/MMBT.
- **SA densify Andes/Norte (2026-09-02):** +60 — AR **53** / CL **29** / PE **22** / BO **15** / EC **13** / CO **26** / VE **20** / GY **7** / SR **6** / GF **5** (`career-*-hubs-densify.ts`). Fuel: SARI/SCIP/SPTU/SKSP/SKMD. Skip SCCD/SCSN/SCST/SCTC, SPIM/SPMS, SEQM, SVCP.
- **Central+Caribe densify (2026-09-02):** +29 commercial hubs — PA **9** / CR **10** / NI **6** / HN **9** / GT **8** / BZ **6** / CU **11** / DO **8** / HT **4** / JM **6** / BS **10** / GP **4** / GD **2**. Seed **1490** airports. Skip SV (MSSA closed), MNCE/MNRR, MDJB, tiny deps. GP: **TFFA** Les Saintes + **TFFS** Saint-Francois (TFFM already seeded). JM **MKNG** Negril (homolog later). Fuel: MGTK/MYAM.
- **World densify Wave C (2026-09-02):** Americas cargo **~990** (+204 net). US +44; CA +26; MX +13; Andes/Central/Caribe +121. **Sem BR**. Seed **1679**; SimBrief **1638**. Dropped no-stock: KYUM/MHJU/MHRC/MMDM/MZBP/MZPB/MZPG. Fuel: KSDF/KICT/KBZN/KAFW, CYYR/CYVO/CYYQ/CYRT/CYEV, MMPA/MMLC/MMCY, SPUR/SLAL/SETN/SKUI/MPEJ/MHPR/MGPB/MUCC/SAVE. Gate 7–14d live ≥85%; vigiar US skipAll/GA. Sem `CARGO_FLOW_BALANCE`.
- **World densify Wave A (2026-09-02):** Americas **~655→~787** (+130 after homolog ICAO cleanup); seed **1347→1475**; SimBrief **1434** cargo ICAOs. No BR/US deep densify; no `CARGO_FLOW_BALANCE`. Script `scripts/analyze-americas-economy.mjs`; history focus +CA/MX/AR/CO. **Gate 7–14d** live ≥85% (Wave A countries) before Wave B (Asia+EU).
- **Wave A homolog ICAO traps (2026-09-02):** MMCN Obregon (not MMCX); MMDA Constitucion; MMCC Acuna; drop MMHC/MMTL/MMBG; SATU/SATR/SAZW (not SAZU/SARL/SAHR); drop densify SANR/SAAV dupes; **drop SAZC** (stock MSFS=Zarate ≠ Coronel Suarez); SENL Lago Agrio (not SETR Tarapoa); SKFL Florencia / SKPV Providencia; SVCB; SLYA; MRCR/MRBT; MNWP=Waspam; TFFA Desireade / TFFS Les Saintes; TGPZ Carriacou (not TGCC); drop MGTK(dupe MGMM)/MGAV/MHNJ/MZCZ/MZBG/SMBN/SPJJ/SLSU/**SYKA** (no MSFS coords). Seed **1475**.
- **Wave C densify catalogs (2026-09-02):** +**126** hubs (AR70/CL42/PE32/BO21/EC20/CO42/VE31/GY9/SR6/GF6/PA12/CR14/NI9/HN12/GT10/BZ7/CU17/DO10/HT6/BS14/GP5). Skip remaps MPSA/MRQP/MGHT + traps SAZC/SYKA/SETR/SVBI/SPJJ/SLSU/SLYG/MGTK/MGAV/MHNJ/MZCZ/MZBG/TGCC/SMBN. PA MPCE already seeded. GP **TFFC** Saint-Francois. Homolog + seed recount pending rebuild.
- **EU-1 pós-densify seed measure (2026-09-02):** catálogo **147** hubs EU-1 (era 81). Fuel producers/país: PT5 ES6 FR6 GB6 DE7 NL2 BE2 IT5. Save vivo dia ~118 ainda **81** hubs / 100% live / lots BE12 DE62 NL31 (pré-migrate). Após rebuild: esperar hubs↑; vigiar live% 7–14d (gate ≥85%).
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
- **Tick bench / event loop:** `tickEconomy` síncrono (testes, catch-up load, **fast-forward n&gt;1**). `tickEconomyCooperative` / `tickEconomyNCooperative(n=1)` cede entre países (`setImmediate`); `POST /api/tick` multi-tick usa sync. Profile: `createEmptyTickPhaseProfile` / `summarizeTickPhaseProfile`; API `{profile:true}` → `tickWallMs`+`tickProfile`. **Live dia 154 (1679 hubs, 24-tick sample):** ~**4.4 s/tick** — `formLotsIntl` ~31% · **`fuel` ~25%** · `npc` ~19% · `formLotsBulk` ~12% · last-mile &lt;1%. Hot já não é só intl. Sem workers / Dry.
- **Fuel dispatch opt (2026-09-03):** `pickBestCandidate` fazia O(trucks×airports×hauls) (~1140×1679). Fix: `buildFuelDispatchBoard` 1×/batch (hubs + shortage sorted + inbound map + byIcao); skip `ensure` top-up se composition ok; settle com truck/airport maps; `tickEconomy` chama `tickFuelLogistics({settle:false})` (settle já na fase settle). Live pós-opt: fuel **~12 ms/tick** (era ~1.1 s); tick total ~**2.1 s** (8-tick sample). Replay: teste `dispatch board cache stays deterministic`. Sem mudar física.
- **Board-pressure / intl opt (2026-09-03):** `commodityBoardBloated` → `partitionBoardKgTarget(INTL)` fazia Σ `partitionLiftableKgPerDay` por país (= **países×NPCs** ~180×3800) em **cada** invalidate pós-lote. Fix: cache por `world.tick` (quota + boardKg); INTL = **1 pass** na frota; `partitionAvailableQuota` usa `hubsByCountry` do airport lookup. Live: tick ~**2.1s→~0.76s**; intl fora do top (formLots ~12%). Hot agora = **npc ~61%**. Teste `intl-hot-path` OK. Sem Dry.
- **NPC ensure/settle + bid opt (2026-09-03):** (1) `ensureNpcFleet` skip topUp/prune/rebalance se structure fresh; `heal:false` no tick + `settleNpcOpsDue({skipEnsure})` — era ensure+settle aninhado (**~3 settles/tick**). (2) bid: index NPCs/airports por região; compact dead rows a cada 48 claims (não por claim). Live tick ~**0.76s→~0.70s**; settle↓; **npc bid ainda ~67%** (O idle×board — próximo redesign). Testes NPC fleet OK.
- **Tick perf (2026-08-30):** country cache no airport lookup; intl lanes pré-normalizadas. Persist do `/api/tick` já é 1× no fim do write.
- **formLotsIntl micro-opts (2026-08-31):** candidate lanes (surplus∩shortage) + dirs unrolled; `precomputedLaneSat`; caps bump in-place; `routeDistanceNm` só se small ainda plausível; `skipAll` hoisted (refresh pós-form). Sem Dry/`CARGO_FLOW_BALANCE`. Teste `intl-hot-path` (12 ticks + odOrder).
- **Tick advance UI (2026-08-31):** career-ui `onTick` chunk ≤24 ticks/POST (+1d = 4; progress + `…Ns` enquanto o 1º chunk). Antes chunk=8 (muitos saves) ou 96 (0/96 “travado”). Sem retune Dry. Hub Stats sample ≠ hot path.
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
- **Dry economy retune (2026-09-01):** day-26 saves sat **~85% general fill** → pay mediano GA baixo (gap≈0). **Slice 1:** `CARGO_FLOW_BALANCE` general/supplies mais drenante; clearance + spot glut discount. **Slice 2 (flow-only):** remove `FREIGHT_MIN_GAP_MULT` + reverte trip floor GA; `general 0.64/1.38`; `DRY_BULK_DEST_SOFT_FILL=0.50`; `dryFormationMinGapMult` (não forma dry em dest >58% fill sem spread); prod dry throttle 62%; clearance desde 55% fill. Value band intacto. Saves pegam no próximo tick.
- **US dead hubs (Daniel day 47, tick 4478):** pulse contava **85/276** incl. **32 `bushTripOnly`** (sem cargo). Cliff **dias 41–43**: live cargo **96%→84%**. Causa = **skipAll** US + slice 2; majors mortos (JFK/ORD/DEN/IAH) com stock mas sem GA Dry sob vitalityOnly. **Fix (2026-09-01):** pulse `deadHubs`/`liveHubPct` exclui bush (alinha `hub_economy_samples`); skipAll + **`LAST_MILE_SKIPALL_MAJOR_FORM_BUDGET=4`**. Script: `scripts/analyze-us-dead-hubs.mjs`.
- **Pay / General $/kg baixo (dia 61):** fill general **58%** OK. Pay baixo = board **76% last-mile** GA + `freightDistanceCapMult` em hops curtos. BR/US bookable **~$1.70/kg**. **Fix (2026-09-01):** `LAST_MILE_MIN_PAY_GAP_MULT` **0.2→0.35** (só GA Dry last-mile; bulk/intl inalterados).
- **BR/US vitality scale (2026-09-02):** densify deixou live ~75–79% (spokes quiet com stock). **Não** é consumo — fill país seco; board perto do soft cap. Fix: `lastMileSkipAllSpokeFormBudget` / `lastMileDeadSpokeVitalityCap` (+ regional) escalam com spokes cargo do país (floor 12/16, max 32/48). Seed: BR form**12**/cap**18**; US form**32**/cap**47**. Major budget fica **4**. Script: `scripts/analyze-br-us-vitality.mjs` (continental vs HI/PR/VI/GU/AS/MP). Sem `CARGO_FLOW_BALANCE` / soft-cap bump.
- **Vitality measure baseline (dia 132, pré-rebuild):** BR live **77%** (22 dead); US cargo **~79%** (55 dead pulse); continental market-proxy **~79%** live / territories quiet **NSTU/PGSN/PHNL**. US general: **23** spokes elegíveis last-mile (fill≥14%, stock≥180, 0 open GA Dry) vs budget fixo 12. Gate 7d pós-rebuild: BR/US ≥**85%** live; dial só se skipAll+eligible ainda ≫ budget (max form 32→40).

## Pulse snapshot (Daniel save, pós-retune)

| Day | Tick | Gen fill | Gen $/kg (pulse) | Market P50 | BR live | US live | BR book $/kg | US book $/kg |
|-----|------|----------|------------------|------------|---------|---------|--------------|--------------|
| 47 | 4478 | 57% | — | — | 75% | 69%* | — | — |
| 61 | 5824 | 58% | 1.16 | ~741 | 73% | 78% | ~1.69 | ~1.72 |
| 79 | 7531 | 59% | 1.35 | ~817 | 62%† | 84% | ~1.69 | ~1.80 |
| 86 | 8203 | 59% | 1.31 | ~813 | 74% | 80% | ~1.64 | ~1.76 |
| 119 | 11416 | 59% | 1.32 | ~845 | 77%‡ | 80% | ~1.87 | ~1.71 |
| 154 | 14789 | 68% | 1.42 | — | 75%§ | 89% | ~1.82 | ~1.87 |

\*US 69% incluía 32 `bushTripOnly` (métrica antiga); cargo ~79%. †Dip BR dia 79 = oscilação (voltou 74% no 86). ‡Pulse live 77%; sample diário dia 118 = 64% (lag/rotação). §Dia 154 pós Wave C densify (~14d measure): BR oscilou 88%→75% (hist 150–153); Wave A Americas live **93.5%** (gate ≥85% OK); EU-1 **98.6%**; CL pulse **78.6%** fraco; board **~9.1k** lots; general last-mile **82%**. **Tick profile live (1679 hubs):** ~**4.4 s/tick** — intl ~31% · **fuel ~25%** · npc ~19% · bulk ~12% · last-mile &lt;1%. +1d ≈ 7 min. Sem cliff Wave A. **Estável longo prazo (~60d pós-retune):** general fill **59%** flat; pay GA bookable BR/US ~$1.7–1.9/kg; supplies fill **11%** flat (seco por design, ~750 lots ainda); NPC ready ~10–12%. Sem cliff. Fixes shipped: bush excluído do `deadHubs`; major last-mile vitality; `LAST_MILE_MIN_PAY_GAP_MULT=0.35`.

**Pulse UI (2026-09-02):** `/economy-pulse` = strip live (`/api/debug/economy-pulse`) com tabela **inventory fill** das 5 SKUs (fill p10–p90, lots, pay/kg, hub pressure, alertas dry/sat/blocked) + histórico paginado.
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