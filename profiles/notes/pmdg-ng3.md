# PMDG 737 NG3 family — Skyline notes

Applies to PMDG 737-600/700/800/900 (NG3 / NGXu) in MSFS, including titles like `737-800 PAX SSW TC`.

## What failed in homologate

| Probe | Result |
|-------|--------|
| Classic `FUEL TANK * QUANTITY` write | **Ignored** (values readable; PMDG owns fuel) |
| `FUELSYSTEM TANK *` | Dead / ignored |
| Accu-Sim-style LVars (`FuelLeftWingTank`, `NGX_FUEL_QtyLeft`, …) | Read as **0** via SimConnect LVar API — not a usable write path |
| `PAYLOAD STATION WEIGHT:*` | Often **writable** (cabin/cargo stations) |

So this is **not** an A2A Accu-Sim `lvar-bridge` case.

## How PMDG actually exposes data

PMDG publishes a **SimConnect Client Data** SDK (not free-form LVars for fuel qty):

| Channel | Name | Role |
|---------|------|------|
| Data (read) | `PMDG_NG3_Data` | State including fuel qty fields (~lbs) |
| Control (write) | `PMDG_NG3_Control` / third-party events | Cockpit-style commands |
| CDU | `PMDG_NG3_CDU_0/1` | Optional screen dump |

Enable in the aircraft options ini (streamed/local package):

```ini
[SDK]
EnableDataBroadcast=1
EnableCDUBroadcast.0=1
EnableCDUBroadcast.1=1
```

Typical fuel quantity fields (lbs) inside the data struct / translators:

- `NGX_FUEL_QtyLeft` / `QtyRight` / `QtyCenter` (read via Client Data, not reliable as `L:` writes)

Header / docs usually ship under the package `Documentation/SDK/` (`PMDG_NG3_SDK.h`) when the product is installed (Marketplace stream still has a cache package path on disk after download).

## Skyline status

| Feature | Status |
|---------|--------|
| Read classic fuel mirrors (qty/cap) | Yes — useful for display / OFP checks |
| Write fuel via classic / LVar bridge | **No** — needs SimBridge **PMDG Client Data** (+ likely FMC/events for load) |
| Payload stations | Often yes via `station-writeback` |
| Vendor recipe | `profiles/vendors/pmdg-ng3.json` → `onClassicWriteFail: abort` |

## Homologation guidance (today)

1. Choose publisher **`pmdg`** in the wizard menu (title rarely contains “PMDG”).
2. Expect tank discovery: capacity live, writes ignored → wizard stops with this recipe’s abort message.
3. Do **not** invent an Accu-Sim recipe with fake `Fuel*Tank` LVars.
4. Optional: draft a **payload-only** profile later if product needs pax/cargo without fuel apply.
5. Next engineering: native `PMDG_NG3_Data` subscribe + documented fuel-set path (FMC or SDK), then a real `vendor-specific` strategy.

## Title tips

Live titles are often liveries (`737-800 PAX SSW TC`). Prefer a stable catalog match title such as `PMDG 737-800` shared across paints; ICAO `B738`.
