# Economia (ponteiro)

Não duplicar o roadmap aqui — a fonte da verdade é:

**`.cursor/rules/career-economy-roadmap.mdc`**

## Em poucas linhas

- Tick = **15 min** wall-clock (`TICKS_PER_DAY = 96`). Física de voo/MX em horas reais.
- Lots / Market / NPC / fuel trucks / hub levels / aircraft market / wear / ledger / SQLite store.
- **Schema v4:** hubs + stock em tabelas (`airports` / `airport_stock`) com `world_id`; tick ainda in-memory; terminal Inventory usa `GET /api/airport?part=stock` (SQL, sem lock); payload completo (lots/NPC) hidrata depois.
- **Schema v5:** NPC roster, fuel trucks/hauls, Demand board e port listings/inventory/concessions em tabelas (`world_id`); arrays stripped de `economy_json`. Tick ainda in-memory. WH/concessões do player ficam no `company_state`.
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
- **Pacific island-neighbor gap:** Nadi **NFFN** hops to Port Vila **NVVV** and Nouméa **NWWW** (was AU/NZ-only). Demand pairs FJ–VU / FJ–NC. Intl lanes >= **399**.
- **Tick bench:** `benchEconomyTicks` / CLI `career tick --bench`. Seed global **1137** hubs / **3839** NPCs. Fase 2c (NPC region index + hash noise): regime ~**2.1s**/tick (`npc` ~110ms, `formLots` ~2.0s below quota). Tick 1 still ~**9s** (warm caches). Lots/NPC replay on the same seed. Sem capar frota / Dry.
- Freights domésticos por país; intl só via `CAREER_INTERNATIONAL_LANES`.
- Soft-field **bush** hubs: Market não forma freight nesses ODs — bush trips board **off** por agora (`BUSH_TRIPS_BOARD_ENABLED`).
- **Warehouses** (pickup hubs …): CAPEX + capacity + storage; port buy → **inbound transfer** (ETA ticks) → WH stock (overflow → yard); **partial Store**; **Abandon** yard; **T1/T2/T3** (5/10/15 klb = 2268/4536/6804 kg) hybrid upgrade (shipped gate + CAPEX).
- **Demand Board:** NPC buy-orders quando stock do hub está baixo (cap global **192** open, **quota por país** ≈32 com 6 países — BR não monopoliza); accept → missão WH→dest; settle = payout + fill terminal + credit `lifetimeShippedKg`. **Edit cargo** restores/withdraws WH + demand remaining. **Intl (port-fed):** cross-border só se par de país na allowlist (BR↔US/AR/CL/MX/CA, AR↔CL/US, CL↔US, US↔CA/MX) **e** origem WH em pickup hub; pay × **1.28**; Market `CAREER_INTERNATIONAL_LANES` intactas.
- Homologação grava OEW/MTOW live; `maxCargoKg` placeholder (N×500) → preferir SimBrief. Backfill: `npm run airframes:backfill-simbrief-cargo` (dry-run) / `-- --apply`.
- **Demand / Dispatch cargo align:** accept + SimBrief `cargo=` usam teto **ops** offline (fuel+MTOW + crew 2×170 lb; OEW = max(catálogo, SimBrief)) — sem probe live de EMPTY/MTOW. Evita OFP 2.2 klb quando inject só carrega ~1.7.
- **SimBrief type vs frota:** Dispatch prioriza roles pack + `simbriefIcao` do **SKU** (`airframeTypeId`), não o pack da classe. Missões antigas com `light_ga`→Bonanza (`BE36`) no `rolesPackRelPath` ainda abrem **AEST** no Aerostar.
- **Inject freighter CG soft-max:** crew stations usam soft **750** lb (`FREIGHTER_CREW_STATION_SOFT_MAX_LB`, ainda `min` com maxLoad); GA/Accu-Sim ficam em **300**. Due = cargo+crew inalterado.
- **CG shift sem arms:** não mover entre pares L/R (S1↔S2); freighter counterweight usa crew+baggage juntos — evita loop falso no C90. Forward: enche baggage (S3/S4) antes de dump em crew (`deferTargetIndexes`).
- **FBO spot:** removido (stock wipe on load); FBO = bonded holds only.
- **Ports:** acesso oceânico só (mar ou rio→mar). Buy → WH/yard → Store/Abandon; preço dinâmico + **inventory** (restock passivo); yard hold fee diária. **Concession v1:** CAPEX + lease renovável (1/empresa); gates T3 WH + 25k shipped; buffs operador (~10% preço, ~15% ETA, +1 listing); não exclui compra/WH de outros. UI: chip Vacant/Held/Operator → dialog Concession. Ao adicionar porto: `CAREER_PORTS` **e** `PICKUP_HUB_SET`.
- **Port P2/P3 (backlog):** ver roadmap *Port endgame backlog* — `level` no save já existe; caps/buffs por nível ainda não.
- **Offline fee cap:** catch-up wall-clock cobra no máx. **7** economy-days de hangar/WH/yard/FBO storage/crew+ground salaries; lease ≤1 installment + defer term repossess (`termEndedSoft`); debug time-skip uncapped. Banner em `/api/state`.

## Company tenant (SP → MP)

Contrato curto — detalhe em **`.cursor/rules/career-economy-roadmap.mdc`** (*Company tenant contract*).

- **Company** = tenant (`companies` / `company_state` / `company_id` em frota, missões, ledger). SP usa id `'local'`. `companies.world_id` aponta para o mundo.
- **World** = hubs/stock (`airports` + `airport_stock`), lots, Demand, NPC, `inbound_pending`, events — `world_id = 'local'` no SP; MP = várias companies no mesmo world.
- **Pilot ≠ company** — `pilot_name` / `pilot_icao` no `company_state` são atalho SP; não inchá-los; members/roles só quando houver fatia co-op.
- Norte MP: empresa privada + mundo compartilhado + ranking por company (não rewrite de tick).
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