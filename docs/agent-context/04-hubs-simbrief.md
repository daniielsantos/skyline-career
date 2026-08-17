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
- Next: NP / BD / South-East Asia face

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
