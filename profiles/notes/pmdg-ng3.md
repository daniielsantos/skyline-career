# PMDG 737 NG3 family — Skyline notes

Applies to PMDG 737-600/700/800/900 (NG3 / NGXu) in MSFS, including titles like `737-800 PAX SSW TC`.

## Product path (current)

Skyline **reads** PMDG fuel/payload and **compares** to the latest **SimBrief OFP** (`--simbrief-user`). The user loads fuel/payload via SimBrief/EFB/FMC. Skyline does **not** write PMDG fuel.

```bash
npm run compare-ofp -- --simbrief-user YOUR_ALIAS --roles profiles/ofp/pmdg-738-ssw-tc.json
npm run monitor-ofp -- --simbrief-user YOUR_ALIAS --roles profiles/ofp/pmdg-738-ssw-tc.json --lock --interval 5
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
| `PAYLOAD STATION WEIGHT:*` | Often **writable** (cabin/cargo stations). After EFB SimBrief load, **cargo stations can be inflated** vs EFB — prefer `L:ZFW_Lvar` / `L:GW_Lvar` for compliance. |

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
| BCF PAYLOAD validation (`pmdg-payload-bcf`) | **Experimental** — types MAIN/FWD/AFT on CDU; **not** career inject |
| Payload stations | Often yes via `station-writeback` (optional; career may only monitor) |
| Vendor recipe | `profiles/vendors/pmdg-ng3.json` → `onClassicWriteFail: abort` |

## BCF CDU PAYLOAD validation script (experimental)

Standalone probe — **does not** touch career inject / `injectCapable`. Use it to see if PMDG accepts a keystream like GSX (CDU events, not SimVar writes).

**Prereqs**

1. Rebuild / restart SimBridge Host after pulling (adds `MENU` key resolve in `PmdgNg3Cdu.cs`).
2. Load **737-800 BCF**, CDU powered, parked. Do not touch the CDU while the script runs.
3. Units on the aircraft Options should match `--units` (`lb` default).

**Assumed LSK map** (override with flags if your page differs)

| Step | Key |
|------|-----|
| Clear scratchpad | `CLR` ×2 |
| MENU | `MENU` |
| FS ACTIONS | `R5` |
| PAYLOAD page | `L2` (`--payload-page-lsk`) |
| SET EMPTY (default on) | `R5` (`--empty-lsk`; **not** R2 — R2 is ZFW/TOCG) |
| SET MAX / SET RANDOM | `R4` / `R6` |
| ZFW (preferred) | type display (e.g. `89.3`) → `R2` — aircraft fills MAIN/FWD/AFT |
| MAIN / FWD / AFT (on-screen L1/L2/L3) | SDK keys `L2` / `L3` / `L4` (BCF live: L1 event does not commit) |

**Commands**

```bash
# Preferred: set ZFW display value (89.3 ≈ 89300 lb); MAIN/FWD/AFT auto-fill
npm run pmdg-payload-bcf -- --zfw 89.3 --yes
# or from pounds:
npm run pmdg-payload-bcf -- --zfw-lb 89300 --yes

# Print keystream only
npm run pmdg-payload-bcf -- --zfw 89.3 --dry-run

# Legacy three-field path (still works)
npm run pmdg-payload-bcf -- --unique-digits --yes
```

**Live note:** `method=event` (TransmitClientEvent) can log success while stations/CDU stay unchanged. Prefer `method=control` (`PMDG_NG3_Control` SetClientData + `parameter=1`). Confirm `EnableDataBroadcast=1` in `737_Options.ini` and that the Host was rebuilt with the `MENU` key.

**INVALID ENTRY / wrong numbers (1000→10020, 200→20):** often repeated digit `0` dropped because `PMDG_NG3_Control` ignores the same EventId until cleared. Host now forces EventId=0 after each key — **rebuild/restart SimBridgeHost** before retesting.

**LSK merge (1234+567→1234567 INVALID, 89 on FWD):** field LSK cleared too fast / next digits started early. Host waits 250ms before EventId=0; script uses longer commit/after-field delays. Validate one field:

```bash
# Stop SimBridgeHost, npm run build:native, restart Host
npm run pmdg-payload-bcf -- --unique-digits --only main --yes
# expect MAIN=1234 only
npm run pmdg-payload-bcf -- --unique-digits --only fwd --no-empty-first --yes
npm run pmdg-payload-bcf -- --unique-digits --only aft --no-empty-first --yes
```

After send, the script dumps `PAYLOAD STATION WEIGHT:1..11`. **Validate by eye:** CDU PAYLOAD shows the numbers; EFB ZFW / LOAD LEVEL moved. If the wrong page got keystrokes, stop and adjust `--payload-page-lsk` / field LSKs — do not wire career inject until this is green.

Do not run alongside GSX boarding automation (both type the CDU).

## Homologation guidance (today)

1. Choose publisher **`pmdg`** in the wizard menu (title rarely contains “PMDG”).
2. Expect tank discovery: capacity live, writes ignored → wizard stops with this recipe’s abort message **plus** SDK broadcast status (OK vs enable `EnableDataBroadcast`).
3. Do **not** invent an Accu-Sim recipe with fake `Fuel*Tank` LVars.
4. Optional: draft a **payload-only** profile later if product needs pax/cargo write without fuel apply.
5. Fuel for career: user sets OFP fuel in sim; Skyline monitors with `compare-ofp` / `monitor-ofp`.

## Title tips

Live titles are often liveries (`737-800 PAX SSW TC`). Prefer a stable catalog match title such as `PMDG 737-800` shared across paints; ICAO `B738`.
