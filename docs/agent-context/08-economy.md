# Economia (ponteiro)

Não duplicar o roadmap aqui — a fonte da verdade é:

**`.cursor/rules/career-economy-roadmap.mdc`**

## Em poucas linhas

- Tick = **15 min** wall-clock (`TICKS_PER_DAY = 96`). Física de voo/MX em horas reais.
- Lots / Market / NPC / fuel trucks / hub levels / aircraft market / wear / ledger / SQLite store.
- Partição por país (`homeCountryId` / região `XX-YY` → país `XX`).
- Freights domésticos por país; intl só via `CAREER_INTERNATIONAL_LANES`.
- Soft-field **bush** hubs: Market não forma freight nesses ODs — usam **bush trips**.
- **Warehouses** (pickup hubs SBGR/SBKP/SBCT/SBRF/SBEG/SBPA/SBBE + SAEZ/SAVC/SCEL/SCTE/KMIA/KEWR/KIAH/KLAX/KSEA + CYVR/CYHZ/MMVR/MMZO/MMUN): CAPEX + capacity + storage; port buy **split** free→WH / rest→yard; **partial Store**; **Abandon** yard (no refund) for oversized lots; **lotes por custo** (±3% merge band); **T1→T2 hybrid upgrade** (lifetime Demand Board shipped kg + CAPEX).
- **Demand Board:** NPC buy-orders quando stock do hub está baixo (cap global **192** open, **quota por país** ≈32 com 6 países — BR não monopoliza); accept → missão WH→dest; settle = payout + fill terminal + credit `lifetimeShippedKg`. **Edit cargo** restores/withdraws WH + demand remaining. **Intl (port-fed):** cross-border só se par de país na allowlist (BR↔US/AR/CL/MX/CA, AR↔CL/US, CL↔US, US↔CA/MX) **e** origem WH em pickup hub; pay × **1.28**; Market `CAREER_INTERNATIONAL_LANES` intactas.
- **FBO spot:** removido (stock wipe on load); FBO = bonded holds only.
- **Ports:** acesso oceânico só (mar ou rio→mar). Buy → WH/yard → Store/Abandon; preço dinâmico; yard hold fee diária. Ao adicionar porto: `CAREER_PORTS` **e** `PICKUP_HUB_SET`.

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