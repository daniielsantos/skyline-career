# Twin Otter fuel saga

**Aircraft:** Microsoft DHC-6-300 Twin Otter Wheels  
**Profile:** `profiles/examples/microsoft-dhc-6-300-twin-otter-wheels.json`  
**Notes:** `profiles/notes/microsoft-dhc-6-300-twin-otter-wheels.md`

## Tanques no sim (writetest)

| Id | SimVar | Cap (gal) |
|----|--------|-----------|
| CENTER | `FUEL TANK CENTER QUANTITY` | 181 |
| CENTER2 | `FUEL TANK CENTER2 QUANTITY` | 197 |
| **Total** | | **378 gal** ≈ 2268 lb / 1029 kg Jet-A |

AOM lista wing tanks +37/+37 gal — **ainda não homologados**.

## Bugs já corrigidos

1. **Densidade errada (~6.0)** → OFP ~2641 lb virava ~440 gal.  
   Fix: `resolveFuelDensityLbPerGal` / `sanitizeFuelDensityLbPerGal` (Jet-A 6.7 para tanques grandes).

2. **Tentativa LEFT_AUX/RIGHT_AUX** → Host crash (`UNRECOGNIZED_ID` → `0xC00000B0`).  
   Revertido em `d0316cc`. **Não reintroduzir** sem writetest das vars certas.

3. **OFP > capacidade** → `FUEL_OVER_CAPACITY`.  
   Career inject: `clampFuelToCapacity: true` em `buildOfpLoadPlan` / `distributeFuelAcrossTanks`; Due reescrito via `applyTargetBlockFuelKg`; UI “OFP over tanks — loading max …”. Soft-fail retry em `ofp-load-helpers.ts`.

4. **Hangar capacity:** `normalizePlayerAircraft` usa catalog `fuelCapacityKg` (Twin Otter ~1029 kg após revert AUX).

## Sintoma UI clássico

- PREFLIGHT FAILED: Fuel Due 2641 vs Sim ~2180 (missão pré-clamp ou sem re-inject).
- Payload Due vs Sim também pode falhar (separado do fuel).
- CG pode estar OK dentro do envelope.
- Preflight READY com Sim ≪ Due em OFP curto: folga de taxi burn era flat 150 lb
  (+50 tol). Capada a 50% do Due (`fuelTaxiBurnAllowanceLb`) — senão EFB drain
  deixava READY.

## Próximo passo opcional (não urgente)

Homologar wing tanks com **SimVars corretas** (não classic AUX) + writetest live, se quiser pernas longas sem clamp.
