# Economia (ponteiro)

Não duplicar o roadmap aqui — a fonte da verdade é:

**`.cursor/rules/career-economy-roadmap.mdc`**

## Em poucas linhas

- Tick = **15 min** wall-clock (`TICKS_PER_DAY = 96`). Física de voo/MX em horas reais.
- Lots / Market / NPC / fuel trucks / hub levels / aircraft market / wear / ledger / SQLite store.
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
- **Tick bench:** `benchEconomyTicks` / CLI `career tick --bench`. Após Fase 1 + formLots: +1 day ~**20–22s** in-memory no seed Americas (baseline pré-opt ~90s) — sem capar frota; pulse inalterado.
- Freights domésticos por país; intl só via `CAREER_INTERNATIONAL_LANES`.
- Soft-field **bush** hubs: Market não forma freight nesses ODs — usam **bush trips**.
- **Warehouses** (pickup hubs …): CAPEX + capacity + storage; port buy → **inbound transfer** (ETA ticks) → WH stock (overflow → yard); **partial Store**; **Abandon** yard; **T1/T2/T3** (5/10/15 klb = 2268/4536/6804 kg) hybrid upgrade (shipped gate + CAPEX).
- **Demand Board:** NPC buy-orders quando stock do hub está baixo (cap global **192** open, **quota por país** ≈32 com 6 países — BR não monopoliza); accept → missão WH→dest; settle = payout + fill terminal + credit `lifetimeShippedKg`. **Edit cargo** restores/withdraws WH + demand remaining. **Intl (port-fed):** cross-border só se par de país na allowlist (BR↔US/AR/CL/MX/CA, AR↔CL/US, CL↔US, US↔CA/MX) **e** origem WH em pickup hub; pay × **1.28**; Market `CAREER_INTERNATIONAL_LANES` intactas.
- Homologação grava OEW/MTOW live; `maxCargoKg` placeholder (N×500) → preferir SimBrief. Backfill: `npm run airframes:backfill-simbrief-cargo` (dry-run) / `-- --apply`.
- **Demand / Dispatch cargo align:** accept + SimBrief `cargo=` usam teto **ops** offline (fuel+MTOW + crew 2×170 lb; OEW = max(catálogo, SimBrief)) — sem probe live de EMPTY/MTOW. Evita OFP 2.2 klb quando inject só carrega ~1.7.
- **SimBrief type vs frota:** Dispatch prioriza roles pack + `simbriefIcao` do **SKU** (`airframeTypeId`), não o pack da classe. Missões antigas com `light_ga`→Bonanza (`BE36`) no `rolesPackRelPath` ainda abrem **AEST** no Aerostar.
- **Inject freighter CG soft-max:** crew stations usam soft **750** lb (`FREIGHTER_CREW_STATION_SOFT_MAX_LB`, ainda `min` com maxLoad); GA/Accu-Sim ficam em **300**. Due = cargo+crew inalterado.
- **CG shift sem arms:** não mover entre pares L/R (S1↔S2); freighter counterweight usa crew+baggage juntos — evita loop falso no C90. Forward: enche baggage (S3/S4) antes de dump em crew (`deferTargetIndexes`).
- **FBO spot:** removido (stock wipe on load); FBO = bonded holds only.
- **Ports:** acesso oceânico só (mar ou rio→mar). Buy → WH/yard → Store/Abandon; preço dinâmico + **inventory** (restock passivo); yard hold fee diária. **Concession v1:** CAPEX + lease renovável (1/empresa); gates T3 WH + 25k shipped; buffs operador (~10% preço, ~15% ETA, +1 listing); não exclui compra/WH de outros. Ao adicionar porto: `CAREER_PORTS` **e** `PICKUP_HUB_SET`.
- **Offline fee cap:** catch-up wall-clock cobra no máx. **7** economy-days de hangar/WH/yard/FBO storage/crew+ground salaries; lease ≤1 installment + defer term repossess (`termEndedSoft`); debug time-skip uncapped. Banner em `/api/state`.

## Company tenant (SP → MP)

Contrato curto — detalhe em **`.cursor/rules/career-economy-roadmap.mdc`** (*Company tenant contract*).

- **Company** = tenant (`companies` / `company_state` / `company_id` em frota, missões, ledger). SP usa id `'local'`.
- **World** = Market lots, Demand, hubs/stock, NPC, `inbound_pending`, events — hoje um save; depois shared + claim.
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