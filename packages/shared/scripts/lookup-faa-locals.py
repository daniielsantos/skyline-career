import csv
from pathlib import Path

cache = Path(__file__).resolve().parents[1] / ".cache" / "ourairports" / "airports.csv"
ids = [
    "O64", "26A", "CA51", "57NC", "NC06", "WV09", "WV30", "WV52", "2G4",
    "O99", "O67", "O56", "3Q0", "O77", "O43", "NV47", "H37", "88NV", "NV16",
    "O39", "1Q2", "CA11", "O79", "M45", "O57", "O24", "0O2", "L61", "L06",
    "O26", "O22", "CA35",
]
want = set(ids)
found = {}

def consider(key, row):
    if key not in want or key in found:
        return
    if row.get("type") == "closed":
        return
    # Prefer small_airport over heliport
    prev = found.get(key)
    if prev and prev.get("type") == "small_airport" and row.get("type") != "small_airport":
        return
    if prev and prev.get("type") == "small_airport":
        return
    found[key] = row

with cache.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        for cand in (
            row.get("ident") or "",
            row.get("gps_code") or "",
            row.get("local_code") or "",
        ):
            cand = cand.strip()
            if not cand:
                continue
            if cand in want:
                consider(cand, row)
            elif cand.startswith("K") and cand[1:] in want:
                consider(cand[1:], row)

print("FOUND", len(found), "/", len(want))
for k in sorted(want):
    row = found.get(k)
    if not row:
        print("MISSING", k)
        continue
    print(
        f"{k}\t{row['ident']}\t{row['type']}\t{row['name']}\t"
        f"{row['latitude_deg']}\t{row['longitude_deg']}\t{row['iso_region']}"
    )

print("--- Breckenridge name search ---")
with cache.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        name = (row.get("name") or "").lower()
        if "breckenridge" in name and row.get("iso_country") == "US":
            print(
                row["ident"],
                row["type"],
                row["name"],
                row["latitude_deg"],
                row["longitude_deg"],
                row["iso_region"],
                row.get("local_code"),
            )
