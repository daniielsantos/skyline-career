# Aircraft buy / lease — metodologia de balanceamento

Atualizado 2026-08-31: playbook para **não** tunar MSRP/lease só olhando o card do Market. Fonte da verdade de pay: `quoteFreightLotPay` em `packages/shared/src/career-economy.ts`. Preços: `packages/shared/src/career-aircraft-pricing.ts` + board em `career-aircraft-market.ts` / `career-aircraft-pool.ts`.

---

## Princípio

**Balancear pela receita que a classe consegue gerar**, não pelo MSRP “de feeling”.

1. Definir uma **perna de referência** por classe (cargo típico, nm, commodity).
2. Medir **pay bruto** da perna (`quoteFreightLotPay`).
3. Ajustar **buy** e **lease** até bater **alvos de grind** (voos para cobrir semana, voos para comprar).
4. Validar **SKU floor** (ex. BAE 146 tired) e **SKU ceiling** (737/A320 fat) na mesma curva de cargo.
5. Garantir que **horas** entram no preço onde o card mostra horas (lease dealer = buy usado).

Não usar só badge `tired/fair` no lease — horas AF/ENG altas sem haircut no lease faziam o board parecer barato sem ser snowball “real”.

---

## Perna de referência (sugestão por classe)

| Classe | Cargo ref. | Distância ref. | Commodity ref. | Notas |
|--------|------------|----------------|----------------|-------|
| `light_ga` | ~80–90% max kg | 150–250 nm | `general` | Last-mile / spoke |
| `light_turboprop` | ~7.5 t | 900–1200 nm | `general` | ATR72 anchor |
| `light_jet` | ~1.4 t | 800–1500 nm | `general` | Lear 35A anchor |
| `medium_piston` | ~10 t | 1200–1500 nm | `general` | DC-6 band |
| `narrow_freighter` | ~18 t | 1200 nm | `general` | 737 BCF baseline; BAE ~10 t tired como entry |
| `wide_freighter` | ~90 t | 3500 nm | `general` | MD-11F baseline; A332 ~52 t tired como entry |

Commodity `electronics` só para teto anti-jackpot — **não** usar como perna padrão de balance.

---

## Métricas alvo

### Lease (semanal)

```
flights_per_week = lease_weekly_usd / pay_per_reference_leg
```

| Classe | Alvo `flights_per_week` | Referência histórica |
|--------|-------------------------|----------------------|
| `light_ga` | ~4–6 | C172 / progressão starter |
| `light_turboprop` | ~1.2–1.5 | ATR72 @ 7.5t/1200nm |
| `light_jet` | ~4–6 | Lear @ 1.4t/800nm |
| `narrow_freighter` | ~1.2–1.4 | 737 good/mid-hours @ 18t/1200nm |
| `wide_freighter` | ~1.2–1.5 | MD-11 fair/mid-hours @ 90t/3500nm |

Lease **não** deve cobrir em &lt;1 voo/semana numa perna típica da classe (snowball).

### Buy (MSRP justo)

```
flights_to_buy = msrp_usd / net_pay_per_leg   // net opcional depois de fuel/MX
```

| Classe | Alvo grind (ordem de grandeza) |
|--------|--------------------------------|
| `light_ga` | ~30 voos (C172 usado tired) |
| `light_turboprop` | ~50–80 voos no ATR72 |
| `light_jet` | ~150–250 voos |
| `narrow_freighter` | ~55–65 voos no 737 baseline |
| `wide_freighter` | ~100–115 voos no MD-11 baseline |

Buy e lease são **dois knobs**: lease = acesso temporário caro; buy = compromisso longo. Subir só MSRP sem lease rate (ou vice-versa) quebra um dos dois alvos.

---

## Stack de preço (código)

### Catálogo (classe + cargo)

- `AIRCRAFT_MSRP_USD[class]` × `cargoMsrpMultiplier(maxCargoKg)` → `resolveAircraftMsrpUsd`
- `resolveAircraftLeaseWeeklyUsd` = MSRP × `AIRCRAFT_LEASE_WEEKLY_RATE[class]`

### Dealer board — **buy** usado

`askingUsd` = MSRP × `CONDITION_PRICE_MULT` × noise × `hoursValueMult` × spoke

### Dealer board — **lease**

`resolveDealerLeaseWeeklyUsd` = catálogo × `CONDITION_LEASE_WEEKLY_MULT` × **`hoursValueMult`**

Depósito = **4 semanas** (`PLAYER_LEASE_DEPOSIT_WEEKS`). Termo 1–3 meses.

### Player lease-out

Player escolhe weekly dentro da banda NPC; não passa por esta metodologia automática.

---

## Probe rápido (dev)

```bash
node --import tsx -e "
import { quoteFreightLotPay } from './packages/shared/src/career-economy.ts';
import { resolveDealerLeaseWeeklyUsd, resolveAircraftMsrpUsd } from './packages/shared/src/career-aircraft-pricing.ts';
const pile = (f) => ({ capacityKg: 80000, stockKg: Math.round(80000*f) });
const gap = { originStock: pile(1), destStock: pile(0) };
const pay = quoteFreightLotPay({ commodityId: 'general', quantityKg: 18000, ...gap, distanceNm: 1200 }).payUsd;
const lease = resolveDealerLeaseWeeklyUsd({ aircraftClassId: 'narrow_freighter', maxCargoKg: 18137, condition: 'good', hoursAirframe: 1500, hoursEngine: 1200 });
const msrp = resolveAircraftMsrpUsd({ aircraftClassId: 'narrow_freighter', maxCargoKg: 18137 });
console.log({ pay, lease, flightsPerWeek: (lease/pay).toFixed(2), flightsToBuy: Math.round(msrp/pay) });
"
```

Testes de regressão: `packages/shared/src/career-aircraft-pricing.test.ts` (anti-snowball por classe).

---

## Passes já feitos (changelog curto)

| Data | Classe | O quê |
|------|--------|-------|
| 2026-08-27 | GA | MSRP 140k, lease 2.0%/wk |
| 2026-08-27 | TP | MSRP 450k, lease 2.2%/wk; ATR via cargo curve |
| 2026-08-27 | Light jet | MSRP 1.05M, lease 1.9%/wk |
| 2026-08-31 | Narrow | MSRP 2.8M, lease 2.4%/wk; lease dealer passa a usar horas |
| 2026-08-31 | Wide | MSRP 14M (era 6.5M), lease 1.5%/wk (era 1.2%); dealer lease × horas |

**Próximo:** opcional net pay (fuel + parking + MX) nos alvos.

---

## Armadilhas

- Card mostra **horas altas** mas lease antigo ignorava horas → preço “baixo” enganoso.
- Comparar lease só no **737 fat** vs pay no **BAE tired** — SKU entry vs ceiling.
- Cherry-pick `electronics` / urgent / gap extremo para achar snowball.
- Esquecer **depósito 4 sem** no custo de entrada do lease.
- UI mirror `packages/career-ui/src/aircraft-pricing.ts` pode estar stale vs shared — conferir após mudança.
