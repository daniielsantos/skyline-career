# Hubs / SimBrief allowlist

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
- **EU-8 gaps:** BY / MD / GE / AM / AZ / LU / MT / CY / XK
- World seed: **778** airports; **84** ports; fuel trucks **158**; **~142** regions
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
- Next: leftover Pacific (Guam / Tahiti) or stop map

## SimBrief cargo allowlist

- `packages/shared/src/career-simbrief-airports.ts`
- Data: `data/simbrief-dispatch-airports.json` (regenerate after hub changes)
- Seed: `assertDispatchHubsAreSimBriefKnown()`
- Gen: `npm run generate:simbrief-dispatch` (from `packages/shared`) — syncs catalog→JSON; does **not** call SimBrief API. Confirm ICAOs in Dispatch before adding.

## Homologate / facilities MSFS

- Recusar facility MSFS se ident ≠ catalog **ou** distância **> 25 nm** (`msfsFacilityMatchesCareerHub`).
- Persistir só ICAOs do catalog; prune deny-list de overrides.
- `pruneOrphanCareerHubs` no migrate/boot (também dropa `npcFlights` órfãos).
- `remapRetiredCareerAirportIdents` aplica `CAREER_AIRPORT_ICAO_REMAP` (ex. MPPB→MPPA) **antes** do prune — evita `Unknown origin airport` no settle.
- NI spoke: **MNMR** Montelimar (MNCE Costa Esmeralda não está no scenery default).
- SE spoke: **ESMQ** Kalmar (ESMX é Växjö Kronoberg — não confundir).
- Override JSON limpo de `SCCD` / `SCSN` / `SCST` / `SCTC`.

## UI (sessão)

- Removido banner vermelho boot “Select a career profile first” (`isNeedsProfileMessage` em `App.tsx`).
- Near me: default off + toggle/clear; For me tooltip; tweaks Freights layout.
