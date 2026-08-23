# pax_and_cargo — Loaded vs Due vs EFB

Jets de passageiro no Career: freight vai na **cabine + leftover cargo**, não `pax=1`. Catálogo: `packages/shared/src/data/career-player-airframes.json`. Watch: `packages/career-ui/server/watch-helpers.ts`. Helpers: `clampPaxAndCargoDueToHoldsLb`, `adjustPaxAndCargoDueForEfbPaxLb`, `simconnectCabinOvershootLb` em `career-mission.ts` / `career-player-airframes.ts`.

SimBrief Dispatch usa **175+55 lb/assento** (`paxwgt`/`bagwgt`). O Due do Preflight **não** é o klb do contrato no topo (isso é freight da missão). Due = payload OFP (pax+bags+cargo), depois os ajustes abaixo.

**Não** usar Import Weights do MSFS SimBrief EFB em JF / iniBuilds — estraga CG. Load no **tablet do addon**.

## Três mismatches (não misturar)

Medir **depois** do Import/APPLY LOAD no EFB, com OFP confirmado.

| Sintoma | Causa | Campo no catálogo | Como medir |
|---------|--------|-------------------|------------|
| Sim ≈ EFB ZFW−OEW, **mais pesado** que Payload SimBrief; pax count EFB = OFP | EFB usa pax **mais pesado** que 175 lb | `efbPaxWeightLb` | `(Sim − cargo_holds) / pax_efb`. Neo V2: ~187. Due += pax × (efb − 175) |
| EFB pax **N**, estações clássicas somam **M×170** com M > N (fileiras 8/12 cheias) | SimConnect enche **slots** a mais | `simconnectCabinSeats` = M | Soma S_cabine / 170. F70: 80 vs OFP 70. Live − (M−maxPax)×170 |
| Holds FWD+AFT **menores** que Bag/Cargo do OFP; cabine já no count certo | Tablet não cabe o freight | `simconnectCargoHoldMaxLb` = FWD+AFT live | F100: 5172+2612=7784 vs OFP 8940. Due clampa cargo ao teto |

`efbPaxWeightLb` **não** substitui os outros dois. F70 extra era 10 ocupantes, não 70 pax mais gordos. F100 overflow era hold, não 100×5 lb.

Watch **recalcula Due a partir de `cargoLb` (OFP)**, nunca do Due pintado — senão `efbPaxWeightLb` empilha a cada tick (43.9k → 46.0k → 48.2k).

## Checklist no ar (novo airframe)

1. `loadLayout: "pax_and_cargo"` + `maxPaxSeats` (fallback; Dispatch prefere `airframe_passengers` da row SimBrief).
2. Open SimBrief: `type=` tem de ser ICAO **ou** internal id. F28 **não tem** Default — só Mk.1000/2000/3000/4000. Neo V2: `iniBuilds (MSFS) - A320neo V2` (180 pax), não Default 186.
3. Título live → `inferSimBriefAirframeMatchFromTitle` + `liveTitleMatchesMarketSku` (família F28/F100 doors).
4. Import no EFB. Anotar: pax EFB, FWD/AFT, Payload OFP, Sim estações, Due.
5. Só então gravar **um** dos três campos (ou nenhum, se |Sim−Due| ≤ ~800 lb em folha grande).
6. Rebuild `@msfs-compat/shared` — catálogo JSON não hot-swap no desktop antigo.

## SKUs já medidos

| SKU | pax_and_cargo | Extra |
|-----|---------------|--------|
| `justflight-f70` | 70 | `simconnectCabinSeats: 80`, `simconnectCargoHoldMaxLb: 5000` (freight coube) |
| `justflight-f100` | 100 | `simconnectCargoHoldMaxLb: 7784` — **sem** cabin overshoot (100 slots) |
| `justflight-fokker-f28` | 85 fallback; live Mk 65/79/65/85 | Nenhum extra (82×170 bateu) |
| `microsoft-a320neo-v2` | 180 | `efbPaxWeightLb: 187` (zonas S3–S7, não fileiras 170) |
| `microsoft-a321lr` | 220 | `efbPaxWeightLb: 188` (153 pax: Sim 37127 vs OFP 35164). **Fuel:** EFB APPLY **não** grava FOB (bug iniBuilds A321LR); usar EFB/slider **padrão do MSFS**. Watch C = CENTER+CENTER2; TOTAL pode ser > L+R+C |
| `fenix-a320` | 180 | `efbPaxWeightLb: 196` (134 pax IAE: Sim 33654 vs OFP 30768) |
| `fenix-a319` | 150 | `efbPaxWeightLb: 200` (115 pax IAE: Sim 29267 vs OFP 26372) |
| `fenix-a321` | 230 | `efbPaxWeightLb: 192`; 8 vidros CFM/IAE × SL/WF × TC/SC; wizard de variante **apaga** pax no catálogo — repor |

Accept OFP: cargo da missão = **Payload** SimBrief (`max(Freight, Payload)` / `ofpFreightTowardMissionKg`), não a linha Freight leftover.
