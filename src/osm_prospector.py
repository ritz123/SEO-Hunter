"""
OSM-based prospecting — Stage 2 free alternative to Google Places.

Uses:
  - Nominatim  (OpenStreetMap geocoding)  → city name → lat/lng
  - Overpass API (OpenStreetMap data)     → businesses near a point

Both are free with no API key required.
Rate limits: Nominatim 1 req/s, Overpass ~10 000 req/day.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from urllib.parse import quote

import requests

# ── OSM category → Overpass tag mapping ──────────────────────────────────────
# Maps common business verticals to OSM amenity/shop/craft tags.
# Add more as needed: https://wiki.openstreetmap.org/wiki/Map_features

OSM_TAG_MAP: dict[str, list[tuple[str, str]]] = {
    "plumbers":          [("craft", "plumber"), ("shop", "plumber")],
    "plumber":           [("craft", "plumber"), ("shop", "plumber")],
    "dentists":          [("amenity", "dentist")],
    "dentist":           [("amenity", "dentist")],
    "auto repair":       [("shop", "car_repair"), ("shop", "tyres")],
    "hvac":              [("craft", "hvac"), ("craft", "heating_engineer")],
    "chiropractors":     [("amenity", "doctors")],     # OSM has no specific tag
    "optometrists":      [("shop", "optician")],
    "law firms":         [("office", "lawyer")],
    "electricians":      [("craft", "electrician")],
    "restaurants":       [("amenity", "restaurant"), ("amenity", "cafe")],
    "restaurant":        [("amenity", "restaurant")],
    "funeral homes":     [("shop", "funeral_directors")],
    "hardware stores":   [("shop", "hardware"), ("shop", "doityourself")],
    "accountants":       [("office", "accountant")],
    "doctors":           [("amenity", "doctors"), ("amenity", "clinic")],
    "pharmacies":        [("amenity", "pharmacy")],
    "hotels":            [("tourism", "hotel"), ("tourism", "motel")],
    "gyms":              [("leisure", "fitness_centre"), ("leisure", "sports_centre")],
    "beauty salons":     [("shop", "hairdresser"), ("shop", "beauty")],
    "bakeries":          [("shop", "bakery")],
}

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

HEADERS = {
    "User-Agent": "siteCp-SEO-Finder/0.1 (local research tool; contact@example.com)",
    "Accept-Language": "en",
}


# ── Nominatim geocoding ───────────────────────────────────────────────────────

@dataclass
class GeoResult:
    display_name: str
    lat: float
    lng: float
    osm_type: str = ""
    boundingbox: list[float] = field(default_factory=list)


# Nominatim can be slow on high-latency networks; use a generous timeout.
_NOMINATIM_TIMEOUT = 45


def geocode(query: str) -> GeoResult | None:
    """
    Convert a city / address string to lat/lng using Nominatim.
    Returns None if nothing found or on network error.
    """
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={"q": query, "format": "json", "limit": 1, "addressdetails": 0},
            headers=HEADERS,
            timeout=_NOMINATIM_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return None
        item = data[0]
        return GeoResult(
            display_name=item.get("display_name", query),
            lat=float(item["lat"]),
            lng=float(item["lon"]),
            osm_type=item.get("osm_type", ""),
            boundingbox=[float(x) for x in item.get("boundingbox", [])],
        )
    except Exception:
        return None


def reverse_geocode(lat: float, lng: float) -> GeoResult | None:
    """
    Convert lat/lng to a place name using Nominatim reverse geocoding.
    Returns None on failure.
    """
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json", "zoom": 10},
            headers=HEADERS,
            timeout=_NOMINATIM_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            return None
        addr = data.get("address", {})
        # Build a short, human-readable name: city + country
        name_parts = [
            addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county", ""),
            addr.get("state", ""),
            addr.get("country_code", "").upper(),
        ]
        short_name = ", ".join(p for p in name_parts if p)
        return GeoResult(
            display_name=short_name or data.get("display_name", f"{lat:.4f},{lng:.4f}"),
            lat=float(data["lat"]),
            lng=float(data["lon"]),
            osm_type=data.get("osm_type", ""),
        )
    except Exception:
        return None


def geocode_suggestions(query: str, limit: int = 5) -> list[dict]:
    """
    Return up to `limit` Nominatim suggestions for the frontend autocomplete.
    Each item: {display_name, lat, lng}
    """
    try:
        resp = requests.get(
            NOMINATIM_URL,
            params={"q": query, "format": "json", "limit": limit, "addressdetails": 0},
            headers=HEADERS,
            timeout=_NOMINATIM_TIMEOUT,
        )
        resp.raise_for_status()
        return [
            {
                "display_name": item.get("display_name", ""),
                "lat": float(item["lat"]),
                "lng": float(item["lon"]),
            }
            for item in resp.json()
        ]
    except Exception:
        return []


# ── Overpass business search ──────────────────────────────────────────────────

@dataclass
class OSMBusiness:
    osm_id: str = ""
    name: str = ""
    lat: float | None = None
    lng: float | None = None
    address: str = ""
    phone: str = ""
    website: str = ""
    category: str = ""
    opening_hours: str = ""
    extra: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.website and not self.website.startswith(("http://", "https://")):
            self.website = "https://" + self.website


def _tag_filter(k: str, v: str) -> str:
    """Return an Overpass QL tag filter expression, supporting ~ for regex values."""
    if v.startswith("~"):
        return f'["{k}"{v}]'   # e.g.  ["name"~"plumber"~i]
    return f'["{k}"="{v}"]'


def _build_overpass_query(
    tags: list[tuple[str, str]],
    lat: float,
    lng: float,
    radius_m: int,
    limit: int,
) -> str:
    """Build an Overpass QL query for the given tags within a radius."""
    lines: list[str] = []
    for k, v in tags:
        tf = _tag_filter(k, v)
        lines.append(f'  node{tf}(around:{radius_m},{lat},{lng});')
        lines.append(f'  way{tf}(around:{radius_m},{lat},{lng});')
    tag_filters = "\n".join(lines)
    return (
        f"[out:json][timeout:40][maxsize:10000000];\n"
        f"(\n{tag_filters}\n);\n"
        f"out center {limit};"
    )


def _parse_overpass_element(el: dict, category: str) -> OSMBusiness | None:
    tags = el.get("tags", {})
    name = tags.get("name") or tags.get("operator")
    if not name:
        return None

    # Coordinates: nodes have lat/lng; ways have center
    if el.get("type") == "node":
        lat, lng = el.get("lat"), el.get("lon")
    else:
        center = el.get("center", {})
        lat, lng = center.get("lat"), center.get("lon")

    # Build address from OSM addr: tags
    addr_parts = [
        tags.get("addr:housenumber", ""),
        tags.get("addr:street", ""),
        tags.get("addr:city", ""),
        tags.get("addr:postcode", ""),
    ]
    address = " ".join(p for p in addr_parts if p).strip()

    return OSMBusiness(
        osm_id=f"{el.get('type','')}/{el.get('id','')}",
        name=name,
        lat=float(lat) if lat is not None else None,
        lng=float(lng) if lng is not None else None,
        address=address,
        phone=tags.get("phone") or tags.get("contact:phone") or "",
        website=tags.get("website") or tags.get("contact:website") or tags.get("url") or "",
        category=category,
        opening_hours=tags.get("opening_hours", ""),
        extra={k: v for k, v in tags.items() if k not in {
            "name", "operator", "addr:housenumber", "addr:street",
            "addr:city", "addr:postcode", "phone", "contact:phone",
            "website", "contact:website", "url", "opening_hours",
        }},
    )


def search_overpass(
    vertical: str,
    lat: float,
    lng: float,
    radius_km: int = 5,
    max_results: int = 100,
) -> list[OSMBusiness]:
    """
    Fetch businesses from OpenStreetMap via the Overpass API.

    vertical: human-readable category (e.g. "plumbers", "dentists")
    Returns a list of OSMBusiness objects.
    """
    key = vertical.lower().strip()
    tags = OSM_TAG_MAP.get(key)

    if not tags:
        # Generic fallback: match any named shop or amenity
        tags = [("name", "~" + key + "~i")]
        print(f"  [OSM] No tag mapping for '{vertical}', using name-regex fallback.")

    radius_m = radius_km * 1000
    query = _build_overpass_query(tags, lat, lng, radius_m, max_results)

    overpass_headers = {
        **HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data: dict | None = None
    for url in OVERPASS_URLS:
        try:
            resp = requests.post(
                url,
                data={"data": query},
                headers=overpass_headers,
                timeout=45,
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception as exc:
            print(f"  [Overpass] {url} failed: {exc}")
            continue
    if data is None:
        return []

    businesses: list[OSMBusiness] = []
    for el in data.get("elements", []):
        biz = _parse_overpass_element(el, vertical)
        if biz:
            businesses.append(biz)

    # Deduplicate by OSM ID
    seen: set[str] = set()
    unique: list[OSMBusiness] = []
    for b in businesses:
        if b.osm_id in seen:
            continue
        seen.add(b.osm_id)
        unique.append(b)

    return unique[:max_results]


def prospect_osm(
    vertical: str,
    city: str,
    radius_km: int = 5,
    max_results: int = 100,
) -> list[OSMBusiness]:
    """
    High-level convenience: geocode city then search Overpass.
    Returns list of OSMBusiness objects.
    """
    geo = geocode(city)
    if not geo:
        print(f"  [OSM] Could not geocode '{city}'")
        return []
    time.sleep(1)  # Nominatim rate limit
    return search_overpass(
        vertical=vertical,
        lat=geo.lat,
        lng=geo.lng,
        radius_km=radius_km,
        max_results=max_results,
    )
