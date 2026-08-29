# Twin Otter fuel saga

**Aircraft:** Microsoft DHC-6-300 Twin Otter Wheels  
**Profile:** `profiles/examples/microsoft-dhc-6-300-twin-otter-wheels.json`  
**Notes:** `profiles/notes/microsoft-dhc-6-300-twin-otter-wheels.md`

## Tanques no sim (writetest 2026-08-29)

| Id | SimVar | Cap (gal) | EFB |
|----|--------|-----------|-----|
| CENTER | `FUEL TANK CENTER QUANTITY` | 181 | Center |
| CENTER2 | `FUEL TANK CENTER2 QUANTITY` | 197 | Center AFT |
| **LEFT_MAIN** | `FUEL TANK LEFT MAIN QUANTITY` | **37** | **Left outer** |
| **RIGHT_MAIN** | `FUEL TANK RIGHT MAIN QUANTITY` | **37** | **Right outer** |
| LEFT_AUX / RIGHT_AUX | classic AUX | — | qty 0, write ignored |
| FUELSYSTEM :3 / :4 | mirrors wing mains | 37 | same outers |

**Total** 452 gal ≈ 3028 lb / 1374 kg Jet-A.

## Bugs já corrigidos

1. **Densidade errada (~6.0)** → OFP ~2641 lb virava ~440 gal.  
   Fix: `resolveFuelDensityLbPerGal` / `sanitizeFuelDensityLbPerGal` (Jet-A 6.7 para tanques grandes).

2. **Mapear asas como LEFT_AUX/RIGHT_AUX** → errado (AUX morto) e no passado Host crash.  
   Asas = **LEFT_MAIN / RIGHT_MAIN** (confirmado probe+writetest).

3. **OFP > capacidade** → `FUEL_OVER_CAPACITY`.  
   Career inject: `clampFuelToCapacity: true`; Due reescrito; UI “OFP over tanks…”.

4. **Hangar capacity:** `fuelCapacityKg` **1374** (452 gal) após asas no perfil.

5. **Pós-payload Sim fuel sobe (~+89 lb L/R):** outers com floor ~13 gal; inject só CENTER* deixava L/R fora do plano. Perfil inclui mains + residual redistribute + restore pós-payload se live driftar do Due.

## Sintoma UI clássico

- PREFLIGHT FAILED: Fuel Due 2641 vs Sim ~2180 (missão pré-clamp ou sem re-inject).
- Payload Due vs Sim também pode falhar (separado do fuel).
- CG pode estar OK dentro do envelope.
- Preflight READY com Sim ≪ Due em OFP curto: folga de taxi burn era flat 150 lb
  (+50 tol). Capada a 50% do Due (`fuelTaxiBurnAllowanceLb`) — senão EFB drain
  deixava READY.

## Runtime fuel probe?

**Não** no estilo payload dead-stations. Writetest na homologação + tanques no perfil
bastam; probe write de todos os slots classic no inject é lento e já matou Host com
vars erradas. Residual floors usam `redistributeAroundResidualFloors` (já no inject).
