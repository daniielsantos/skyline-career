# PMDG 737 NG3 family — Skyline notes

Applies to PMDG 737-600/700/800/900 (NG3 / NGXu) in MSFS, including titles like `737-800 PAX SSW TC`.

## Product path (current)

Skyline **reads** PMDG fuel and **compares** it to an OFP (manual JSON today; SimBrief later). The user loads fuel/payload via **SimBrief / EFB / FMC**. Skyline does **not** write PMDG fuel.

```bash
npm run compare-ofp -- --ofp profiles/ofp/manual-sample.json
npm run monitor-ofp -- --ofp profiles/ofp/manual-sample.json --lock --interval 5
```

`compare-ofp` / `monitor-ofp` prefer `readPmdgNg3Fuel` (lb); fall back to classic gallons × 6.7. With `--lock`, preflight becomes a hard check and a baseline is captured; once airborne, fuel may only decrease and payload is frozen.

Load-sheet field map (Block Fuel, Payload, Baggage, Pass, ZFW/TOW): see [`ofp-load-sheet.md`](ofp-load-sheet.md).

### PMDG 738 SSW TC station roles (cfg homologation)

| Stations | Name | Role |
|----------|------|------|
| 1–4 | PaxZone1–4 | passenger (163 seats in cfg) |
| 5–6 | Fwd / Aft Cargo | baggage |
| 7–8 | Pilot / Copilot | crew |

OFP sample: `profiles/ofp/pmdg-738-ssw-tc.json`. Live check: `npm run probe-payload-stations` after loading pax/bags in the EFB.

## What failed in homologate

| Probe | Result |
|-------|--------|
| Classic `FUEL TANK * QUANTITY` write | **Ignored** (values readable; PMDG owns fuel) |
| `FUELSYSTEM TANK *` | Dead / ignored |
| Accu-Sim-style LVars (`FuelLeftWingTank`, `NGX_FUEL_Qty*`, …) | Read as **0** via SimConnect LVar API — not a usable write path |
| `PAYLOAD STATION WEIGHT:*` | Often **writable** (cabin/cargo stations) |

So this is **not** an A2A Accu-Sim `lvar-bridge` case.

## How PMDG actually exposes data

PMDG publishes a **SimConnect Client Data** SDK (not free-form LVars for fuel qty):

| Channel | Name | Role |
|---------|------|------|
| Data (read) | `PMDG_NG3_Data` | State including `FUEL_QtyLeft` / `QtyRight` / `QtyCenter` (**lbs**) |
| Control (write) | `PMDG_NG3_Control` / third-party events | Cockpit-style commands — **out of scope** for Skyline fuel load |
| CDU | `PMDG_NG3_CDU_0/1` | Optional screen dump |

### Enable broadcast (`737_Options.ini`)

Client Data only arrives when SDK broadcast is on. **Do not look for `737NG3_Options.ini` inside the Community package** — on MSFS 2024 the runtime file is:

```
%APPDATA%\Microsoft Flight Simulator 2024\WASM\MSFS2024\pmdg-aircraft-738\work\737_Options.ini
```

(Your Community folder `...\Packages\Community2024\pmdg-aircraft-738` holds the aircraft; options live under `WASM\...\work\`.)

Add (or merge) this section:

```ini
[SDK]
EnableDataBroadcast=1
EnableCDUBroadcast.0=1
EnableCDUBroadcast.1=1
```

Then **reload the aircraft** (or restart the flight / sim). Without this, `probe-pmdg-fuel` shows `available: true` but `nonzeroBytes=0` and fuel qty all zeros.

Probe from Skyline:

```bash
npm run probe-pmdg-fuel
```

Expect `layoutOk: true`, `nonzeroBytes` > 0, and L/R/C lb close to classic `FUEL TANK * QUANTITY` mirrors (gal × density). Fuel fields sit at byte offsets 116/120/124 (`FUEL_QtyCenter/Left/Right`) in `PMDG_NG3_Data`.

## Skyline status

| Feature | Status |
|---------|--------|
| Read classic fuel mirrors (qty/cap) | Yes — useful for display / OFP checks |
| Read SDK fuel qty via Client Data | **Yes** — IPC `readPmdgNg3Fuel` / `probe-pmdg-fuel` |
| OFP vs live compliance | **Yes** — `compare-ofp` / `monitor-ofp` (fuel L/R/C + total, payload; burn-aware) |
| Write fuel via classic / LVar / Client Data | **No / out of scope** — user loads via SimBrief/EFB/FMC |
| CDU control send (`pmdg-cdu`) | **Parked / experimental** — not the product apply path |
| Payload stations | Often yes via `station-writeback` (optional; career may only monitor) |
| Vendor recipe | `profiles/vendors/pmdg-ng3.json` → `onClassicWriteFail: abort` |

## Homologation guidance (today)

1. Choose publisher **`pmdg`** in the wizard menu (title rarely contains “PMDG”).
2. Expect tank discovery: capacity live, writes ignored → wizard stops with this recipe’s abort message **plus** SDK broadcast status (OK vs enable `EnableDataBroadcast`).
3. Do **not** invent an Accu-Sim recipe with fake `Fuel*Tank` LVars.
4. Optional: draft a **payload-only** profile later if product needs pax/cargo write without fuel apply.
5. Fuel for career: user sets OFP fuel in sim; Skyline monitors with `compare-ofp` / `monitor-ofp`.

## Title tips

Live titles are often liveries (`737-800 PAX SSW TC`). Prefer a stable catalog match title such as `PMDG 737-800` shared across paints; ICAO `B738`.
