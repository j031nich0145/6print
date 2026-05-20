"""
build_city_list.py
──────────────────
Regenerates cities_final.csv from the GeoNames worldcities npm package.
Run locally whenever you want to adjust regional targets or min populations.

Usage:
    cd ~/Documents/BUILD/6print
    node -e "require('./scripts/node_modules/worldcities')" 2>/dev/null || \
        npm install worldcities --prefix scripts/
    python3 scripts/build_city_list.py

Output: cities_final.csv  (in project root)
"""

import json, csv, subprocess, sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
CITIES_JSON  = PROJECT_ROOT / "scripts" / "node_modules" / "worldcities" / "data" / "cities.json"
COUNTRIES_JSON = PROJECT_ROOT / "scripts" / "node_modules" / "worldcities" / "data" / "countries.json"
OUT_CSV      = PROJECT_ROOT / "cities_final.csv"

# ── Regional mapping ──────────────────────────────────────────────────────────
REGIONS = {
    "US":"United States","CA":"Canada","MX":"Mexico",
    "GT":"Central America","BZ":"Central America","HN":"Central America",
    "SV":"Central America","NI":"Central America","CR":"Central America",
    "PA":"Central America","CU":"Central America","JM":"Central America",
    "HT":"Central America","DO":"Central America","TT":"Central America","PR":"Central America",
    "CO":"South America","VE":"South America","EC":"South America","PE":"South America",
    "BR":"South America","BO":"South America","PY":"South America","AR":"South America",
    "CL":"South America","UY":"South America","GY":"South America","SR":"South America",
    "GB":"Europe","IE":"Europe","FR":"Europe","ES":"Europe","PT":"Europe",
    "DE":"Europe","IT":"Europe","NL":"Europe","BE":"Europe","LU":"Europe",
    "CH":"Europe","AT":"Europe","SE":"Europe","NO":"Europe","DK":"Europe",
    "FI":"Europe","IS":"Europe","PL":"Europe","CZ":"Europe","SK":"Europe",
    "HU":"Europe","RO":"Europe","BG":"Europe","HR":"Europe","SI":"Europe",
    "RS":"Europe","BA":"Europe","AL":"Europe","MK":"Europe","ME":"Europe",
    "GR":"Europe","CY":"Europe","MT":"Europe","TR":"Europe","UA":"Europe",
    "MD":"Europe","BY":"Europe","LT":"Europe","LV":"Europe","EE":"Europe",
    "RU":"Europe","GE":"Europe","AM":"Europe","AZ":"Europe",
    "MA":"Africa","DZ":"Africa","TN":"Africa","LY":"Africa","EG":"Africa",
    "SD":"Africa","ET":"Africa","SO":"Africa","KE":"Africa","TZ":"Africa",
    "UG":"Africa","RW":"Africa","BI":"Africa","CD":"Africa","CG":"Africa",
    "NG":"Africa","GH":"Africa","CI":"Africa","SN":"Africa","ML":"Africa",
    "BF":"Africa","NE":"Africa","CM":"Africa","ZA":"Africa","ZW":"Africa",
    "MZ":"Africa","ZM":"Africa","AO":"Africa","NA":"Africa","BW":"Africa",
    "MW":"Africa","MG":"Africa","MR":"Africa","SL":"Africa","LR":"Africa",
    "TG":"Africa","BJ":"Africa","GN":"Africa","TD":"Africa","SS":"Africa",
    "GA":"Africa","ER":"Africa","DJ":"Africa",
    "SA":"Middle East","AE":"Middle East","QA":"Middle East","KW":"Middle East",
    "BH":"Middle East","OM":"Middle East","YE":"Middle East","IQ":"Middle East",
    "IR":"Middle East","SY":"Middle East","JO":"Middle East","LB":"Middle East",
    "IL":"Middle East","PS":"Middle East",
    "IN":"Asia","PK":"Asia","BD":"Asia","LK":"Asia","NP":"Asia","BT":"Asia",
    "CN":"Asia","JP":"Asia","KR":"Asia","KP":"Asia","MN":"Asia","TW":"Asia",
    "HK":"Asia","MO":"Asia","VN":"Asia","TH":"Asia","MM":"Asia","LA":"Asia",
    "KH":"Asia","MY":"Asia","SG":"Asia","ID":"Asia","PH":"Asia","BN":"Asia","TL":"Asia",
    "KZ":"Central Asia","UZ":"Central Asia","TM":"Central Asia",
    "TJ":"Central Asia","KG":"Central Asia","AF":"Central Asia",
    "AU":"Oceania","NZ":"Oceania","PG":"Oceania","FJ":"Oceania",
    "SB":"Oceania","VU":"Oceania","WS":"Oceania","TO":"Oceania",
}

# ── Targets — adjust to taste ─────────────────────────────────────────────────
TARGETS = {
    "United States":  350,
    "Canada":         100,
    "Mexico":          80,
    "Central America": 30,
    "South America":  130,
    "Europe":         220,
    "Africa":         130,
    "Middle East":     70,
    "Asia":           220,
    "Central Asia":    25,
    "Oceania":         35,
    "Other":           20,
}

def get_region(iso2):
    return REGIONS.get(iso2, "Other")

def select_for_region(pool, target):
    pool = sorted(pool, key=lambda c: -c["pop"])
    top_n   = int(target * 0.55)
    top     = pool[:top_n]
    rest    = pool[top_n:]
    used    = {c["iso2"] for c in top}

    # One city per unrepresented country
    by_country = {}
    for c in rest:
        by_country.setdefault(c["iso2"], []).append(c)
    spread = [
        cs[0] for iso2, cs in
        sorted(by_country.items(), key=lambda kv: -kv[1][0]["pop"])
        if iso2 not in used
    ]
    fill_n  = max(0, target - len(top) - len(spread))
    fill    = [c for c in rest if c not in spread][:fill_n]
    return (top + spread + fill)[:target]


def main():
    if not CITIES_JSON.exists():
        print("Installing worldcities npm package …")
        scripts_dir = PROJECT_ROOT / "scripts"
        scripts_dir.mkdir(exist_ok=True)
        subprocess.run(["npm", "install", "worldcities", "--prefix", str(scripts_dir)], check=True)

    cities_raw   = json.loads(CITIES_JSON.read_text())
    countries_raw = json.loads(COUNTRIES_JSON.read_text())
    country_names = {c[0]: c[2] for c in countries_raw}

    # Parse: [lat, lon, name, iso2, pop, tz]
    all_cities = []
    for c in cities_raw:
        if len(c) < 5 or not c[4] or c[4] < 5000 or not c[3]:
            continue
        all_cities.append({
            "lat": c[0], "lon": c[1], "name": c[2],
            "iso2": c[3], "pop": c[4],
            "region": get_region(c[3]),
        })

    # Group by region
    by_region = {}
    for c in all_cities:
        by_region.setdefault(c["region"], []).append(c)

    # Select
    selected = []
    for region, target in TARGETS.items():
        picks = select_for_region(by_region.get(region, []), target)
        selected.extend(picks)

    # Deduplicate
    seen, final = set(), []
    for c in selected:
        key = f"{c['name']}|{c['iso2']}"
        if key not in seen:
            seen.add(key)
            final.append(c)

    # Write CSV
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["location","country","country_code","region","lat","lon","population"])
        writer.writeheader()
        for c in final:
            writer.writerow({
                "location":     c["name"].replace(",", ""),
                "country":      country_names.get(c["iso2"], c["iso2"]).replace(",", ""),
                "country_code": c["iso2"],
                "region":       c["region"],
                "lat":          round(c["lat"], 4),
                "lon":          round(c["lon"], 4),
                "population":   c["pop"],
            })

    print(f"✓ {len(final)} cities written to {OUT_CSV}")
    by_r = {}
    for c in final:
        by_r[c["region"]] = by_r.get(c["region"], 0) + 1
    for r, n in sorted(by_r.items(), key=lambda kv: -kv[1]):
        print(f"  {r}: {n}")

if __name__ == "__main__":
    main()
