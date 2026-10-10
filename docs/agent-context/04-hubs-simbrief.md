# Hubs / SimBrief allowlist

- **Dispatch METAR (2026-10-10):** a linha do voo ativo mostra vento e QNH ao vivo (Aviation Weather), não o tempo do simulador. Na chegada, se a pista do OFP (`SBGR/09L` no fim da rota) estiver com vento de cauda, a frase entra nessa linha. Em rota some a saída. Sem TAF, nuvem, visibilidade nem METAR cru. A consulta fica no desktop (`/api/weather/metar`), fora do proxy do world.

- **Western Europe fill (2026-10-10):** sintoma = regionais com linha regular ainda de fora na França, Itália, Alemanha, Reino Unido e Tenerife, e Gibraltar sem hub. Fix = +9 spokes na França, +4 na Itália, Rostock-Laage, +5 no Reino Unido, Jersey na região que já tem Guernsey, Tenerife Norte em ES-CN. Gibraltar é um país novo, GI-C, com Jet-A em LXGB. Seed **2731**. Sem retune. O MSFS devolveu os 22 no lugar certo. Tenerife Sur continua de fora para Gran Canaria seguir como hub de carga das Canárias. Zaragoza e Badajoz continuam sem cenário. Porto Santo, Lajes, Nordholz, Eday e Trento ficam de fora.
- **Canada and island fill (2026-10-10):** sintoma = Canadá ainda com médios regulares de fora, Bahamas incompletas, e vários países do Caribe sem hub. Fix = +29 spokes no Canadá (sul e centros do norte, sem o Ártico mais remoto), +8 Family Islands, Culebra e Vieques. Países novos, um região cada, com produtor de Jet-A no internacional: Cayman, Turks and Caicos, Saint Kitts and Nevis, Saint Vincent, Caribe Holandês, Ilhas Virgens Britânicas. Seed **2709**. Sem retune. Ceiba fica de fora (no MSFS é a base naval Roosevelt Roads). Anguilla, São Bartolomeu, Grand Case, Montserrat e Dominica ficam de fora. Guanaja continua sem cenário.
- **LatAm scheduled fill (2026-10-10):** sintoma = médios/grandes com voo regular ainda de fora no continente. Fix = +15 hubs que o MSFS devolve no lugar certo (Tulum, Jauja, Yurimaguas, El Trompillo, Guayaramerín Intl, Riberalta, La Rioja, Termas de Río Hondo, San Vicente del Caguán, Tame, Barinas, Carúpano, Aerotortuguero, Quepos, La Isabela). Quito passa de SEQU para **SEQM** (Tababela). SEQU no simulador é o aeroporto antigo do centro. Seed **2652**. Sem região nova, sem produtor de Jet-A, sem retune. Palmerola já era MHPR, Ogle já era SYEC, Flores já era MGMM, Lima SPIM é o mesmo SPJC. Guanaja (MHNJ) não está no cenário. Kaieteur (SYKA) não devolve coordenada. Um save com SANL em cima de San Luis, ou SANR em cima de Santiago, ainda migra para SAOU/SANE; a linha que já está na cidade nova fica.
- **BR scheduled medium fill (2026-10-10):** sintoma = 15 médios com voo regular ainda de fora (Bauru, Maringá, Juiz de Fora, Jericoacoara, Tefé, Araguaína e os outros da lista). Fix = +15 spokes no densify, sem região nova e sem produtor de Jet-A. Seed **2637**, Brasil **112**. Sem retune. Campo pequeno e aeroporto sem linha regular continuam de fora. Ponta Grossa no MSFS é **SSZW** (uma faixa, coordenada certa). O SBPG do simulador é Novo Planalto/GO, 718 nm a norte, e o gate recusou gravar isso em cima de Ponta Grossa.

- **Gaps 2026-10-10 (11 hubs):** sintoma = `career-hubs gaps` fechou `ok=8 rwy×0` e `fail=3`. Causa = EHGR, LEGA, LEGT, LEVD, LFOT, LFRH, LFTH e RKTU existem no cenário e o Facilities devolveu o aeroporto sem faixa usável; o debrief continua no OurAirports. KPBI, UTSB e UTSS não estão no cenário: Palm Beach no sim é **KDJT**; Uzbequistão trocou UT→UZ em 2025-10-02. Fix = catálogo e corredores passam a KDJT, UZTT, UZSS, UZSB, UZNN e UZFN. `CAREER_AIRPORT_ICAO_REMAP` reescreve o save antigo na carga. Os oito sem faixa continuam no OurAirports. `gaps` lista de novo todo hub cuja linha gravada não tem `runways`; `rwy×0` regrava o pino e a linha continua sem faixa, então EHGR, LEGA, LEGT, LEVD, LFOT, LFRH, LFTH e RKTU voltam sempre. Segunda passada: UZSB e UZSS saíram `rwy×1`. `stamped 0` só quer dizer que lat/lon do SQLite já batiam com o arquivo. O CLI lia só o primeiro ICAO da linha (`KDJT UZTT …` buscava só KDJT). Agora cada código posicional entra na mesma consulta.

- **US scheduled commercial fill (2026-10-10):** sintoma = Alasca sem hub, Havaí só com Honolulu, e regionais com voo regular ainda de fora no continente. Fix = +220 aeroportos `scheduled_service` medium/large (OurAirports), ICAO de 4 letras, sem LRRS. Alasca **US-AK** isolado (sem estrada para o continente), **57** hubs, PANC major e produtor de Jet-A, troncos PANC–KSEA/PAFA/PAJN. Havaí +9 (Kahului, Kona, Lihue, Hilo, Molokai, Lanai, Kapalua, Waimea, Hana); Hickam e Kalaeloa continuam de fora. Continente +154 spokes/regionais. Seed **2622**. Sem retune de preço. Campos sem linha regular continuam de fora. Save antigo sem caminhão em US-AK ganha um tanque ocioso rehomed para Anchorage, porque a região não tem vizinho de estrada.

- **US known-airport densify (2026-10-10):** sintoma = mapa continental com buracos em nomes que o piloto procura (LaGuardia, Teterboro, Nantucket, Punta Gorda, Naples, Lakefront, Telluride, Boeing Field, Van Nuys). Causa = o densify anterior parou em regionais menores e deixou esses de fora. Fix = +34 hubs no `career-us-hubs-densify.ts` (NE 12 / MT 11 / W 4 / SC 3 / SE 2 / MW 2). LaGuardia é regional; o resto é spoke. Corredor automático (≥2 parceiros). Sem produtor de Jet-A novo, sem região nova, sem retune. Alasca (PANC/PAFA/PAJN) continua de fora. Seed **2402**.

Atualizado 2026-10-04: **Seed de faixa não ficava congelado** — KMIA→MGGT desenhou 1751 m past THR (meio da 02) porque o settle no world ainda usava OurAirports. A cabeceira estava gravada como centro; a faixa MSFS (2984 m, centro real) já estava no AppData local. O boot agora completa faixas em falta a partir do seed, e o desktop envia o `runwayTouch` projetado aqui. Detalhe em `25-runway-touchdown.md`.

Atualizado 2026-10-03: **Pista do debrief vem do MSFS, não do OurAirports** — o desenho lê faixa capturada no Facilities (`msfs-hub-overrides.json` → `runways`). `getAirportRunways` já prefere isso. `career-runways.json` (OurAirports) só cobre o hub que ainda não tem faixa do sim. Não recolocar o centro com LE+HE do OurAirports.

Captura com o MSFS aberto: 2357 dos 2368 hubs têm faixa do sim. MZBZ é 07/25, centro 17.53984,-88.30460, 2956 m (meio real). Sem faixa, e por isso ainda caem no OurAirports: EHGR, LEGA, LEGT, LEVD, LFOT, LFRH, LFTH, RKTU (o sim devolveu o aeroporto e nenhuma faixa usável) e KPBI, UTSB, UTSS (não estão no cenário local).

A primeira passada gravou 1173 hubs com `rwy×0` por um atalho do host: depois que a lista de aeroportos enchia o cache, `GetAirportFacilityAsync` devolvia o pino (lat/lon, zero faixas) e não pedia `RequestFacilityData`. Correção em `SimConnectClient`: cache só dispensa a consulta quando já há faixas. A segunda passada, com o host do repo, preencheu 1165. O host instalado em `AppData\Local\Programs` ainda é o antigo; o arquivo de faixas já foi copiado para `%AppData%\Airframe Career\career\`. O Career aberto só lê isso no próximo start.

Atualizado 2026-10-01: **777F aceita contrato para MZPL** — sintoma = KIAH→MZPL com 777F; no sim a pista é 29/11, 2873×50 ft, grama curta, sem luz. Causa = Placencia está no catálogo como hub regional de Belize e o Accept não compara pista com a classe. O gate antigo de bush foi removido (2026-09-03) e `career-runways.json` ainda descreve MZPL como 08/26 asfalto de 650 m. Fix proposto, não feito: grama ou pista curta fica para GA/turboélice; jato e wide só entram em pista pavimentada longa o bastante. Não apagar o hub.

## Chile ICAO cleanup

- La Serena = **SCSE**
- Carriel Sur = **SCIE**
- Remap legado: `SCCD → SCIE`
- Removidos strips não-Dispatch: `SCSN`, `SCST`, `SCTC`
- CL hubs ~21

## South America seed (complete)

- Countries: BR/AR/CL + UY/PY/PE/BO/EC/CO/VE/GY/SR/GF
- Coastal ports: Montevideo, Callao, Guayaquil, Cartagena, Buenaventura, La Guaira, Georgetown, Paramaribo, Cayenne (BO/PY landlocked — no port)

## Central America seed (complete)

- Countries: PA/CR/NI/HN/GT/SV/BZ
- Coastal ports: Balboa, Limón, Corinto, Puerto Cortés, Acajutla, Puerto Quetzal, Belize City
- SV: only MSLP + MSSS (closed Santa Ana El Palmer omitted)

## Caribbean seed (complete, intl-first)

- Countries: CU/DO/HT/JM/BS/TT/BB/LC/GD/AG + **GP/MQ/CW/SX/AW**
- **Puerto Rico:** region `US-PR` under US (TJSJ…); domestic corridors to KMIA/KEWR — not a separate country
- **U.S. Virgin Islands:** region `US-VI` under US (TIST/TISX); domestic to KMIA + inter-island
- BB/GD/MQ/CW/SX/AW: single-major catalogs where island is tiny

## Europe seed (EU-1 … EU-8) — complete for countries with civil hubs

- **EU-1…EU-7:** Western / Nordics / Baltics / Balkans / Iceland / TR / UA
- **EU-1 West densify (2026-09-02):** NL/BE/DE → GB/FR/IT → ES/PT light (+66); seed **1347** airports. Files: `career-{nl,be,de,gb,fr,it,es,pt}-hubs-densify.ts`.
- **EU-1 densify Wave 1 (2026-09-19):** +45 toward ~300 (EU-1 ~167→~212); seed **2012**. BE commercial thin → +2 FR. Azores fill LPAZ/LPHR/LPPI/LPGR (**not** LPPS). Homolog: **EDFE→EDFM**, **LEZG→LEBG**, **LEBZ→LELN**; overrides in `data/msfs-hub-overrides.json`; `generate:runways:missing` filled 45 OA strips (0 synth) for touchdown. Regen allowlist: `npm run generate:simbrief-dispatch`.
- **EU-1 densify Wave 2 (2026-09-19):** +88 → EU-1 **300**; seed **2100**. Quotas FR+17 (BE redirect) / DE+14 / GB+14 / ES+12 / IT+12 / NL+8 (incl. small fill) / PT+6 / BE+5. Skips LPPS/LPLA/GCTS/EDDT. Allowlist regen **2100**; `generate:runways:missing` → OA **88** (0 synth). Homolog: **LELC→LETL** (San Javier absent), **LELO→LERJ** (wrong ICAO; Logroño already densify as LERJ) + catalog replace LELC→LETL / LELO→LESU. Watch remaining Wave 2 stock-name mismatches.
- **MENA densify Wave A (2026-09-19):** +35 → MENA **115**; seed **2135**. First `career-*-hubs-densify.ts` for SA/EG/IR/DZ/MA/AE/IQ/OM/LY/TN/SY/SD/YE/IL. Skips HEAX/OETH/OKBK/ORBS/OIBA/HLLT/HSSS/OTBD/OIII. Allowlist **2135**; OA runways +35 (0 synth). Homolog pending — trap-heavy region. Gate MENA live ≥85% 7d before Wave B (~150).
- **Asia densify Wave A (2026-09-19):** +46 → Asia ex-MENA **300**; seed **2181**. Append densify CN/IN/JP/ID/PH/TH/VN/MY/KR + first `career-pk-hubs-densify.ts`. Allowlist **2181**; OA runways +46 (0 synth). Homolog: drop/swap stock fails **RPSP** (use RPMC; Panglao already **RPVT**), **VEKI**, **VVVD**, **WALK**, **WARQ**/**WIPT** (known densify drops), **WMKM**, **WARJ**, **WABP** (coord mismatch) → **VAAU**/**VVPC**/**WIBB**/**WAKK**/**WADB**/**WBGR**. Skips VOGA/VOML/RJGG/RKJB/WAMM/WIDD/WAJJ. Gate SEA live ≥85% 7d before Wave B.
- **Asia densify Wave B (2026-09-19):** +50 → Asia ex-MENA **~350**; seed **2231**. Append densify + first `career-kz-hubs-densify.ts` (UACK). TW **RCKW**/**RCFN** (not **RCQC**). Allowlist **2231**; OA runways +50 (0 synth). Homolog: **VEVZ/VABM/VAHB**→**VAAK/VAJM/VAKE**; **WAHI/WALR/WAFB**→**WAGG/WAFP**; **RPLH/RPLT/RPMA**→**RPMH/RPMJ/RPMN**. Gate SEA+AS live ≥85% 7d before Wave C (+50→400). Script `gen-asia-wave-b-densify.mjs --wave b|c`.
- **Asia densify Wave C (2026-09-19):** +50 → Asia ex-MENA **~400**; seed **2281**. First UZ/BD densify (UTFN/VGBR). Allowlist **2281**; OA runways +50 (0 synth). Homolog: **VAKJ/VALT/VAND/VARP**→**VEAN/VASL/VAUD**; **WAKT**→**WAON**; **ZBCD/ZGSD/ZUTR/ZBDH**→**ZBCF/ZBHD/ZBES**.
- **Oceania densify Wave A (2026-09-19):** +47 → OC **~110**; seed **2328**. Append AU/NZ densify + first PG/FJ/NC/PF/VU/KI densify. Allowlist **2328**; OA runways +47 (0 synth). Homolog **47/47 ok**. Skips YMAV/YSBK/YMEN, NZQN/NZDN, AYNZ/WAJJ, NFSF, NWWM, NGTU. Gate OC live ≥85% 7d before Wave B. Script `gen-oceania-wave-a-densify.mjs`.
- **Oceania densify Wave B (2026-09-19):** +40 → OC **~150**; seed **2368**. Append AU/PG/NZ/PF/NC/KI + first `career-to-hubs-densify.ts` (NFTL). Allowlist **2368**; OA runways +40 (0 synth). Homolog: **AYBM** (no MSFS) → **YCIN**. Script `gen-oceania-wave-b-densify.mjs`. Gate OC live ≥85% 7d before Wave C.
- **CA/Caribbean densify (2026-09-02):** +29 then homolog cleanup (drop MZCZ/MZBG/MGAV/MGTK/MHNJ/TGCC→TGPZ); seed **1477**. Skip MSSA/MNCE/MNRR. GP densify TFFA Desireade + TFFS Les Saintes (not Saint-Francois). Regenerate allowlist: `npm run generate:simbrief-dispatch`.
- **Wave A ICAO traps:** MMCN Obregon / MMDA Constitucion / MMCC Acuna; SATU/SAZC/SATR/SAZW; SENL (not SETR); SKFL Florencia; SKPV Providencia; SVCB; SYKA; SLYA; MRCR/MRBT; MNWP Waspam; TGPZ Carriacou.
- **AR/CL stock ICAO traps (2026-09-05):** Malargüe **SAMM** (not SAMA Alvear); San Luis **SAOU** (not SANL La Rioja); San Rafael **SAMR** (not SAOU); Santiago del Estero **SANE** (not SANR Termas); Puerto Williams **SCGZ** (not SCPQ Mocopulli). Remaps: `SANL→SAOU`; `SAMA→SAMM`; `SANR→SANE`; `SCPQ→SCGZ`. **Do not** remap live `SAOU→SAMR` (both hubs are catalog — that collapsed SAOU↔SAMR lots into SAMR→SAMR / 0 nm). Do **not** seed Termas as SANR while `SANR→SANE` lives. KPBI ficou nessa data porque o Facilities ainda respondia; em 2026-10-10 o cenário passou a **KDJT** (ver o bullet de gaps).
- **SAMR→SAMR / 0 nm board flood (2026-09-17):** Freights sorted by distance showed pages of `SAMR→SAMR` · 0 nm · last-mile. Cause: `CAREER_AIRPORT_ICAO_REMAP` still had `SAOU→SAMR` while **SAOU (San Luis)** and **SAMR (San Rafael)** are both live; migrate rewrote every SAOU leg to SAMR, collapsing the San Luis↔San Rafael corridor. Fix: drop `SAOU→SAMR`; `remapRetired` skips any `from` still in `CAREER_HUB_COORDS`; `pruneSameOdCareerLots` on migrate/tick.
- **Wave C densify (2026-09-02):** +126 hubs in `career-*-hubs-densify.ts` (SA/CA/Caribe). Skip MPSA/MRQP/MGHT + Wave A traps. GP TFFC Saint-Francois. Rebuild → `npm run generate:simbrief-dispatch` + homolog.
- **EU-1 ICAO traps:** Madeira **LPMA** (not **LPPS** Porto Santo); Azores **LPPD** (not **LPLA** Lajes this slice); Canaries **GCLP** (not **GCTS** Tenerife); Viseu **LPVZ** (not **LPVL** Vilar de Luz); Portimão **LPPM** (not **LPSI** Sines); DE spoke belt prefer **EDDG/EDLW/EDFH** (skip closed/conflict **EDDT** unless curated).
- **EU-8 gaps:** BY / MD / GE / AM / AZ / LU / MT / CY / XK
- World seed (historical EU-8 baseline): **778** airports; **84** ports; fuel trucks **158**; **~142** regions
- EU-8 ports: Batumi / Baku / Marsaxlokk / Limassol
- Homologation: **UBBG** (not UBGN), **UDSG** (not UDLS); **UGKO** omitted (absent in stock MSFS)
- Microstates without civil hubs (AD/MC/SM/VA/LI) intentionally omitted

## MENA-1 Mediterranean face

- Countries: MA / DZ / TN / EG / IL (Libya / Sudan / Levant-east / Gulf deferred)
- ICAO traps: Alexandria **HEBA** (not HEAX); Fes **GMFF**; Eilat **LLER** (Ramon)
- Ports: Tangier Med → GMTT; Algiers → DAAG; Tunis/Radès → DTTA; Alexandria → HEBA; Haifa → LLHA
- World seed after MENA-1: **803** airports; **89** ports; fuel trucks **175**; **~155** regions

## MENA-2 Gulf

- Countries: SA / AE / QA / BH / KW / OM (IQ / IR / YE / LY / SD / Levant-east deferred)
- ICAO traps: Doha major **OTHH** (Hamad; OTBD spoke only); Dubai **OMDB**; Riyadh **OERK**; Taif **OETF** (not OETH); Kuwait **OKKK** (not OKBK)
- Ports: Jeddah Islamic → OEJN; Dammam → OEDF; Jebel Ali → OMDB; Khalifa → OMAA; Hamad → OTHH; KBS → OBBI; Shuwaikh → OKKK; Muscat → OOMS
- World seed: **827** airports; **97** ports; fuel trucks **195**; **+10** Gulf regions
- Remaps: `OETH→OETF`, `OKBK→OKKK`

## MENA-3 North Gulf

- Countries: IQ / IR (Levant-east JO/LB/SY, LY/SD, YE deferred)
- ICAO traps: Baghdad **ORBI** (not ORBS); Tehran intl **OIIE** (Mehrabad **OIII** regional only); Basra **ORMM**; Bandar Abbas **OIKB** (not OIBA Abu Musa); Kerman **OIKK**
- Ports: Um Qasr / Basra → ORMM; Bandar Abbas → OIKB
- World seed: **841** airports; **99** ports; fuel trucks **215**; **+6** North Gulf regions
- Remaps: `OIBA→OIKB`

## MENA-4 Levant-east

- Countries: JO / LB / SY (LY/SD, YE deferred)
- ICAO traps: Amman intl **OJAI** (Marka **OJAM** spoke); Beirut **OLBA**; Damascus **OSDI**
- Ports: Aqaba → OJAQ; Beirut → OLBA; Latakia → OSLK
- World seed: **848** airports; **102** ports; fuel trucks **230**; **+5** Levant regions

## MENA-5 Maghreb/Nile gap

- Countries: LY / SD
- ICAO traps: Tripoli **HLLM** Mitiga (not closed **HLLT**); Benghazi **HLLB**; Khartoum **HSSK** (not legacy **HSSS**); Port Sudan **HSPN**
- Ports: Misrata → HLMS; Port Sudan → HSPN
- World seed: **854** airports; **104** ports; fuel trucks **245**; **+4** regions
- Remaps: `HLLT→HLLM`, `HSSS→HSSK`

## MENA-6 Yemen

- Countries: YE
- ICAO traps: Sana'a **OYSN**; Aden **OYAA**
- Ports: Aden → OYAA; Hodeidah → OYHD
- World seed: **858** airports; **106** ports; fuel trucks **255**; **+2** Yemen regions

## Asia-1 Pakistan

- Countries: PK
- ICAO traps: Islamabad **OPIS** (not old **OPRN** Chaklala); Karachi **OPKC** (not OPMR Masroor); Lahore **OPLA**
- Ports: Karachi → OPKC
- World seed: **864** airports; **107** ports; fuel trucks **265**; **+2** Pakistan regions
- Remaps: `OPRN→OPIS`

## Asia-2 India west

- Countries: IN
- ICAO traps: Delhi **VIDP** (not VIDD Safdarjung); Mumbai **VABB**; Goa **VOGO** Dabolim (not **VOGA** Mopa); Ahmedabad **VAAH**
- Ports: Mumbai → VABB
- World seed: **872** airports; **108** ports; fuel trucks **275**; **+2** India west regions

## Asia-3 India south / east

- Countries: IN (Central Asia / Sri Lanka deferred)
- ICAO traps: Bengaluru **VOBL** (not **VOBG** HAL); Hyderabad **VOHS** (not **VOHY** Begumpet); Chennai **VOMM**; Kolkata **VECC**
- Ports: Chennai → VOMM; Kolkata → VECC (Hooghly river→sea)
- World seed: **880** airports; **110** ports; fuel trucks **285**; **+2** India south/east regions
- Remaps: `VOBG→VOBL`, `VOHY→VOHS`

## Asia-4 Sri Lanka

- Countries: LK (Central Asia deferred)
- ICAO traps: Colombo intl **VCBI** Bandaranaike (not **VCCC** Ratmalana as major); Mattala **VCRI**
- Ports: Colombo → VCBI
- World seed: **884** airports; **111** ports; fuel trucks **295**; **+2** Sri Lanka regions
- Next: Central Asia west (KZ/UZ/TM)

## Asia-5 Central Asia west

- Countries: KZ / UZ / TM (TJ/KG deferred)
- ICAO traps: Tashkent **UTTT** (not UTNN Nukus); Turkmenbashi **UTAK** (not UTBK); do not seed UAFM (OurAirports lists it as Manas; Bishkek is UCFM)
- Ports: Aktau → UATE; Turkmenbashi → UTAK
- World seed: **894** airports; **113** ports; fuel trucks **320**; **+5** Central Asia west regions
- Remaps: `UTBK→UTAK`
- Next: TJ/KG

## Asia-6 Central Asia east

- Countries: TJ / KG (landlocked — no ports)
- ICAO traps: Bishkek Manas **UCFM** (not **UAFM** OurAirports ident); Osh **UCFO** (not **UAFO**); **UTDK** Kulob omitted (absent in stock MSFS); skip UTDT Bokhtar
- World seed: **899** airports; **113** ports; fuel trucks **340**; **+4** Central Asia east regions
- Remaps: `UAFM→UCFM`, `UAFO→UCFO`, `UTDK→UTDD`
- Next: Afghanistan

## Asia-7 Afghanistan

- Countries: AF (landlocked — no ports)
- ICAO traps: Kabul **OAKB** (not **OAIX** Bagram); skip Jalalabad OAJL
- World seed: **903** airports; **113** ports; fuel trucks **350**; **+2** Afghanistan regions
- Next: Nepal / Bangladesh

## Asia-8 Nepal / Bangladesh

- Countries: NP / BD (BT deferred)
- ICAO traps: Kathmandu **VNKT**; Pokhara **VNPK** (stock MSFS; **VNPR** intl omitted); Dhaka **VGHS** (not **VGZR** Zia); skip VNLK Lukla
- Ports: Chittagong → VGEG
- World seed: **910** airports; **114** ports; fuel trucks **365**; **+3** Nepal/Bangladesh regions
- Remaps: `VNPR→VNPK`, `VGZR→VGHS`
- Next: BT / Myanmar (Thailand deferred)

## Asia-9 Bhutan / Myanmar

- Countries: BT (landlocked) / MM (Yangon river→sea)
- ICAO traps: Paro **VQPR** (not Thailand Betong BTZ/VTSY); Yangon **VYYY** (country MM, ICAO VY* — not Mexico MM*); skip military VYML/VYNP/VYST; Thailand VT* deferred
- Ports: Yangon → VYYY
- World seed: **916** airports; **115** ports; fuel trucks **380**; **+3** Bhutan/Myanmar regions
- Next: Thailand

## Asia-10 Thailand

- Country: TH (Laem Chabang seaport + Phuket)
- ICAO traps: Bangkok cargo major is **VTBS** Suvarnabhumi (not **VTBD** Don Mueang); U-Tapao **VTBU** (Laem Chabang pickup); skip military VTPI/VTBK; Betong **VTSY** is not Bhutan
- Ports: Laem Chabang → VTBU; Phuket → VTSP
- World seed: **924** airports; **117** ports; fuel trucks **395**; **+3** Thailand regions
- Next: Vietnam / Malaysia / Singapore

## Asia-11 Vietnam / Malaysia / Singapore

- Countries: VN / MY (peninsula) / SG. East Malaysia WB* and Indonesia deferred
- ICAO traps: Hanoi **VVNB** (not **VVGL** Gia Lam); HCMC **VVTS** (not **VVLT** Long Thanh, unopened); KLIA **WMKK** (not WMSA-as-major / WMKB); Changi **WSSS** (not WSAP)
- Ports: Hai Phong → VVCI; Ho Chi Minh → VVTS; Port Klang → WMKK; Singapore → WSSS
- World seed: **934** airports; **121** ports; fuel trucks **420**; **+5** VN/MY/SG regions
- Remaps: `VVGL→VVNB`, `VVLT→VVTS`
- Next: Indonesia / East Malaysia / Philippines

## Asia-12 Indonesia / East Malaysia / Philippines

- Countries: ID / PH. East Malaysia regions **MY-E** (Sabah) / **MY-K** (Sarawak) added to existing MY. Brunei / Papua / Batam deferred
- ICAO traps: Jakarta **WIII** (not **WIHH** Halim); Medan **WIMM** (not **WIMK** Polonia); Bali **WADD**; Cagayan **RPMY** (not **RPML** Lumbia); skip Semarang WARS/WAHS, Yogyakarta WAHI, Subic RPLB
- **Densify homolog (2026-09-03):** Solwezi **FLSW** (not FLHN=Livingstone); Saint-Louis **GOSS**; Bohol **RPVT**; Tirupati **VOTP**; Tanjung Pinang **WIDN**; RPVE=Caticlan. Drop WARQ/WAJW/WARS/WIPT + **LBHS** (absent). Palu **WAFF** (not WAML); Tarakan **WAQQ** (not WALR); Pangkal Pinang **WIKK** (not WIPB/WIPK — MSFS/AIP). Seed **1999**.
- **SE metric clone (2026-09-03):** pulse SE hundreds of hubs = **ESMQ duplicates**. Bad remap **ESMX→ESMQ** (Växjö vs Kalmar) + remap dedupe order bug. Fixed; keep both ICAOs.
- **Bush trips removed (2026-09-03):** seed **1967**; soft strips kept as spokes; FAA trip-only dropped.
- Ports: Tanjung Priok → WIII; Tanjung Perak → WARR; Belawan → WIMM; Kota Kinabalu → WBKK; Kuching → WBGG; Manila → RPLL; Cebu → RPVM
- World seed: **948** airports; **128** ports; fuel trucks **470**; **+10** ID/MY-east/PH regions
- Remaps: `WIMK→WIMM`, `WRRR→WADD`, `RPML→RPMY`
- Next: China / Japan / Korea

## Asia-13 China / Japan / Korea

- Countries: CN / JP / KR. Taiwan RC* and inland China (Xi'an, Kunming, Dalian) deferred
- ICAO traps: Beijing **ZBAA** (not **ZBAD** Daxing as major); Shanghai cargo **ZSPD** (not **ZSSS** Hongqiao as major); Chengdu **ZUUU** (not ZUTF Tianfu); Tokyo cargo **RJAA** Narita (not **RJTT** Haneda as major); Seoul **RKSI** Incheon (not **RKSS** Gimpo)
- Ports: Shanghai → ZSPD; Yantian → ZGSZ; Tokyo → RJTT; Osaka → RJBB; Incheon → RKSI; Busan → RKPK
- World seed: **962** airports; **134** ports; fuel trucks **525**; **+11** CN/JP/KR regions
- Next: Taiwan / Australia / New Zealand

## Asia-14 Taiwan / Australia / New Zealand

- Countries: TW / AU / NZ. Inland China and Pacific islands deferred
- ICAO traps: Taipei cargo major is **RCTP** Taoyuan (not **RCSS** Songshan); Sydney **YSSY** Kingsford Smith (not **YSBK** Bankstown); Melbourne **YMML** (not **YMEN** Essendon); Auckland **NZAA** (not **NZWN** Wellington); skip RCMQ/RCNN, Darwin YPDN, Hobart YMHB
- Ports: Keelung → RCTP; Kaohsiung → RCKH; Sydney → YSSY; Melbourne → YMML; Brisbane → YBBN; Fremantle → YPPH; Auckland → NZAA
- World seed: **974** airports; **141** ports; fuel trucks **565**; **+8** TW/AU/NZ regions
- Next: China inland / Pacific hinge

## Asia-15 China inland / Pacific hinge

- Countries: CN inland extension + US-HI / FJ / PG / NC. Guam, Papeete, Urumqi, Qingdao deferred
- ICAO traps: Xi'an **ZLXY** Xianyang (not closed **ZLSN** Xiguan); Kunming **ZPPP** Changshui; Dalian **ZYTL**; Chongqing **ZUCK**; Wuhan **ZHHH**; Xiamen **ZSAM**; Honolulu **PHNL** (not PHIK/PHJR); Nadi **NFFN**; Port Moresby **AYPY** (not AYNZ); Nouméa **NWWW** (not NWWM Magenta). Still skip ZUTF Tianfu
- Ports: Dalian → ZYTL; Xiamen → ZSAM; Honolulu → PHNL; Nadi → NFFN; Port Moresby → AYPY; Nouméa → NWWW
- World seed: **984** airports; **147** ports; fuel trucks **585**; **+4** Pacific regions (CN reuses CN-N/E/S/W)
- Remaps: `ZLSN→ZLXY`
- Next: leftover Pacific (Guam / Tahiti)

## Asia-16 Guam / Polynesia / Micronesia

- Countries: US-GU / US-AS (US territories) + PF / PW / WS / TO. Saipan, Vanuatu, Solomon, Cook, Kiribati deferred
- ICAO traps: Guam **PGUM** Won Pat (not **PGUA** Andersen); Papeete **NTAA** Faa'a (not NTTB Bora Bora); Palau **PTRO**; Pago Pago **NSTU**; Apia **NSFA** Faleolo (not NSAU); Tonga **NFTF** Fua'amotu (not NFTV Vava'u)
- Ports: Guam → PGUM; Papeete → NTAA; Koror → PTRO; Pago Pago → NSTU; Apia → NSFA; Nuku'alofa → NFTF
- World seed: **990** airports; **153** ports; fuel trucks **615**; **+6** Pacific regions
- Next: ~~leftover Pacific (Vanuatu / Solomon / Cook)~~ → Asia-17

## Asia-17 Vanuatu / Solomon / Cook / Kiribati

- Countries: VU / SB / CK / KI (Solomon Islands ISO **SB**, not Brazil **BR**)
- ICAO traps: Port Vila **NVVV** Bauerfield (not NVSS Santo); Honiara **AGGH** (not AGGM Munda); Rarotonga **NCRG** (not NCAI Aitutaki); Tarawa **NGTA** Bonriki (not PLCH Cassidy / NGTU)
- Ports: Port Vila → NVVV; Honiara → AGGH; Rarotonga → NCRG; Tarawa → NGTA
- World seed: **994** airports; **157** ports; fuel trucks **635**; **+4** Pacific regions
- Intl lanes: NVVV–YSSY/NWWW; AGGH–YSSY/AYPY; NCRG–NZAA/NTAA; NGTA–NFFN
- Next: ~~Asia-18 micro-slices~~ → shipped Asia-18–25

## Asia-18 Saipan micro-slice

- Country: US-MP (Northern Mariana Islands, under US)
- ICAO: Saipan **PGSN** International (deferred from Asia-16)
- Port: USMPS → PGSN
- World seed: **995** airports; **158** ports; fuel trucks **640**; **+1** US region (US-MP)
- Intl lanes: PGSN–PGUM, PGSN–PHNL

## Asia-19 Kiritimati micro-slice

- Country: KI — new region **KI-L** (Line Islands; Tarawa stays **KI-T**)
- ICAO: **PLCH** Cassidy Field (not NGTU)
- Port: KICXI → PLCH
- World seed: **996** airports; **159** ports; fuel trucks **645**
- Intl lanes: PLCH–NFFN, PLCH–PHNL; demand pair KI/US

## Asia-20 Vava'u micro-slice

- Country: TO — new region **TO-V** (Vava'u; Tongatapu stays **TO-T** / NFTF)
- ICAO: **NFTV** Vava'u International
- Port: TOVAV → NFTV
- World seed: **997** airports; **160** ports; fuel trucks **650**
- Intl lanes: NFTV–NZAA, NFTV–NCRG; demand pair TO/CK

## Asia-21 Santo micro-slice

- Country: VU — new region **VU-S** (Espiritu Santo; Efate stays **VU-C** / NVVV)
- ICAO: **NVSS** Pekoa International
- Port: VUSAN → NVSS
- World seed: **998** airports; **161** ports; fuel trucks **655**
- Intl lanes: NVSS–NWWW, NVSS–YSSY

## Asia-22 Munda micro-slice

- Country: **SB** (Solomon Islands ISO — not Brazil **BR**) — new region **SB-W** (Western; Guadalcanal stays **SB-G** / AGGH)
- ICAO: **AGGM** Munda International
- Port: SBMUN → AGGM
- World seed: **999** airports; **162** ports; fuel trucks **660**
- Intl lanes: AGGM–AYPY, AGGM–YSSY

## Asia-23 Aitutaki micro-slice

- Country: CK — new region **CK-N** (Aitutaki; Rarotonga stays **CK-C** / NCRG)
- ICAO: **NCAI** Aitutaki International
- Port: CKAIT → NCAI
- World seed: **1000** airports; **163** ports; fuel trucks **665**
- Intl lanes: NCAI–NZAA, NCAI–NTAA

## Asia-24 Bora Bora micro-slice

- Country: PF — new region **PF-L** (Leeward / Bora Bora; Tahiti stays **PF-I** / NTAA)
- ICAO: **NTTB** Bora Bora
- Port: PFBOB → NTTB
- World seed: **1001** airports; **164** ports; fuel trucks **670**
- Intl lanes: NTTB–NZAA, NTTB–NCRG; domestic corridor NTTB–NTAA

## Asia-25 Asau micro-slice

- Country: WS — new region **WS-S** (Savai'i; Upolu stays **WS-U** / NSFA)
- ICAO: **NSAU** Asau
- Port: WSSAV → NSAU
- World seed: **1002** airports; **165** ports; fuel trucks **675**
- Intl lanes: NSAU–NZAA, NSAU–NFTV; demand pair WS/TO
- **Pacific/Asia map complete** — Asia-27–32 cleanup shipped; seed **1011** / **171** ports / **720** trucks.

## Asia-26–32 Pacific/Asia cleanup (shipped)

| Slice | Hub(s) | Region | Notes |
|-------|--------|--------|-------|
| 26 | **ANG** | PW-A | Palau 2nd hub; FAA LID |
| 27 | **YPDN** | AU-NT | Darwin; lanes AYPY/WIII |
| 28 | **WBSB** | BN-C | Brunei (deferred Asia-12); lanes WSSS/WMKK |
| 29 | **YMHB** | AU-T | Hobart; lane NZWN |
| 30 | **NZWN** | NZ-W | Wellington; lane YSSY |
| 31 | **RCMQ**, **RCNN** | TW-C, TW-S | Taichung/Tainan; lanes RJAA |
| 32 | **ZSQD**, **ZWWW** | CN-E, CN-W | Qingdao/Urumqi; lanes RJAA/UTTT |

- **Still skip:** ZUTF Tianfu (by design)
- Homolog: `npm run career-hubs -- missing --yes` after rebuild

## SimBrief cargo allowlist

- `packages/shared/src/career-simbrief-airports.ts`
- Data: `data/simbrief-dispatch-airports.json` (regenerate after hub changes)
- Seed: `assertDispatchHubsAreSimBriefKnown()`
- **Demand Board** also skips `bush` / `bushTripOnly` dests (PLN strips, not OFP). GPS ident **MM68** retired → remap `MMCU`.
- Gen: `npm run generate:simbrief-dispatch` (from `packages/shared`) — syncs catalog→JSON; does **not** call SimBrief API. Confirm ICAOs in Dispatch before adding.
- **Desktop `Building SimBrief link… / Re-opening…` freeze (2026-09-16; fix v0.3.68):** `/api/dispatch` concluiu e produziu URL, mas `packages/desktop/main.mjs::openHttpInOsBrowser` aguardava indefinidamente o callback do `cmd.exe /c start`; processo filho permanecia vivo e `App.tsx::onDispatch` nunca chegava ao `finally setBusy(false)`. Não era VPS/economy/SimBrief. Fix: launcher Windows `rundll32 url.dll,FileProtocolHandler` detached resolve no `spawn` (não no exit); renderer limita IPC a 8 s e sempre libera `busy`.

## Homologate / facilities MSFS

- Recusar facility MSFS se ident ≠ catalog **ou** distância **> 25 nm** (`msfsFacilityMatchesCareerHub`).
- Persistir só ICAOs do catalog; prune deny-list de overrides.
- `npm run career-hubs -- missing` = lat/lon/nome (+ `runways` no **override** MSFS se Facilities devolver). **Não** regenera `career-runways.json`.
- Diagrama de debrief / `evaluateRunwayTouchdown`: catálogo OurAirports `packages/shared/src/data/career-runways.json`. Após densify: `npm run generate:runways:missing -w @msfs-compat/shared` (merge; não wipe). Full regen: `generate:runways`. Fallbacks no merge: aliases fechados/renomeados (ex. SEQU→SEQM, EGCN→GB-1212); strip sintético no `CAREER_HUB_COORDS` se OA sem geometria.
- `pruneOrphanCareerHubs` no migrate/boot (também dropa `npcFlights` órfãos).
- `remapRetiredCareerAirportIdents` aplica `CAREER_AIRPORT_ICAO_REMAP` (ex. MPPB→MPPA) **antes** do prune — evita `Unknown origin airport` no settle.
- NI spoke: **MNMR** Montelimar (MNCE Costa Esmeralda não está no scenery default).
- SE spoke: **ESMQ** Kalmar (ESMX é Växjö Kronoberg — não confundir).
- Override JSON limpo de `SCCD` / `SCSN` / `SCST` / `SCTC`.

## UI (sessão)

- Removido banner vermelho boot “Select a career profile first” (`isNeedsProfileMessage` em `App.tsx`).
- Near me: default off + toggle/clear; For me tooltip; tweaks Freights layout.
