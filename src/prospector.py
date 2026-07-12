"""
Prospector — Stage 2 of the strategy.

Discovers business URLs from multiple sources:
  1. Yelp Fusion API (requires free API key)
  2. Google Maps Places API (requires API key)
  3. Yellow Pages web scraping (no key needed)
  4. CSV / plain-text file input (manual list)

Returns a list of BusinessLead objects ready for the audit pipeline.
"""

from __future__ import annotations

import csv
import re
import time
from dataclasses import dataclass, field
from typing import Iterator

import requests
from bs4 import BeautifulSoup

import config


# ── Lead container ────────────────────────────────────────────────────────────

@dataclass
class BusinessLead:
    name: str
    website: str
    phone: str = ""
    address: str = ""
    city: str = ""
    category: str = ""
    rating: float = 0.0
    review_count: int = 0
    source: str = ""
    gbp_url: str = ""
    yelp_url: str = ""
    notes: str = ""
    extra: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        # Normalise website URL
        if self.website and not self.website.startswith(("http://", "https://")):
            self.website = "https://" + self.website


# ── Yelp source ───────────────────────────────────────────────────────────────

def _yelp_search(
    term: str,
    city: str,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    if not config.YELP_API_KEY:
        return []
    headers = {"Authorization": f"Bearer {config.YELP_API_KEY}"}
    params = {
        "term": term,
        "location": city,
        "limit": min(limit, 50),
        "offset": offset,
    }
    try:
        resp = requests.get(
            config.YELP_SEARCH_URL,
            headers=headers,
            params=params,
            timeout=config.REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("businesses", [])
    except Exception as exc:
        print(f"  [Yelp] Error: {exc}")
        return []


def _yelp_get_website(business_id: str) -> str:
    """Fetch the website URL from a Yelp business detail page."""
    if not config.YELP_API_KEY:
        return ""
    headers = {"Authorization": f"Bearer {config.YELP_API_KEY}"}
    try:
        url = config.YELP_BUSINESS_URL.format(id=business_id)
        resp = requests.get(url, headers=headers, timeout=config.REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json().get("url", "")
    except Exception:
        return ""


def prospect_yelp(
    vertical: str,
    city: str,
    max_results: int | None = None,
) -> list[BusinessLead]:
    """Fetch businesses from Yelp Fusion API for a given vertical and city."""
    if not config.YELP_API_KEY:
        print("  [Yelp] No API key configured — skipping.")
        return []

    limit = max_results or config.MAX_RESULTS_PER_SOURCE
    leads: list[BusinessLead] = []
    offset = 0

    while len(leads) < limit:
        batch = _yelp_search(vertical, city, limit=min(50, limit - len(leads)), offset=offset)
        if not batch:
            break

        for biz in batch:
            yelp_url = f"https://www.yelp.com/biz/{biz.get('id', '')}"
            # The search endpoint doesn't return website; detail call needed
            website = _yelp_get_website(biz.get("id", ""))
            time.sleep(config.REQUEST_DELAY * 0.5)

            location = biz.get("location", {})
            leads.append(
                BusinessLead(
                    name=biz.get("name", ""),
                    website=website,
                    phone=biz.get("phone", ""),
                    address=" ".join(filter(None, [
                        location.get("address1", ""),
                        location.get("address2", ""),
                    ])),
                    city=location.get("city", city),
                    category=vertical,
                    rating=biz.get("rating", 0.0),
                    review_count=biz.get("review_count", 0),
                    source="yelp",
                    yelp_url=yelp_url,
                    extra={"yelp_id": biz.get("id", "")},
                )
            )

        offset += len(batch)
        if len(batch) < 50:
            break

    return leads[:limit]


# ── Google Maps Places API source ─────────────────────────────────────────────

def prospect_google_maps(
    vertical: str,
    city: str,
    max_results: int | None = None,
) -> list[BusinessLead]:
    """
    Discover businesses via Google Maps Places API (Text Search).
    Requires GOOGLE_MAPS_API_KEY.
    """
    if not config.GOOGLE_MAPS_API_KEY:
        print("  [Google Maps] No API key configured — skipping.")
        return []

    limit = max_results or config.MAX_RESULTS_PER_SOURCE
    leads: list[BusinessLead] = []
    next_page_token = None

    places_url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    detail_url = "https://maps.googleapis.com/maps/api/place/details/json"

    while len(leads) < limit:
        params: dict = {
            "query": f"{vertical} in {city}",
            "key": config.GOOGLE_MAPS_API_KEY,
        }
        if next_page_token:
            params = {"pagetoken": next_page_token, "key": config.GOOGLE_MAPS_API_KEY}
            time.sleep(2)  # Google requires a short delay before using page token

        try:
            resp = requests.get(places_url, params=params, timeout=15)
            data = resp.json()
        except Exception as exc:
            print(f"  [Google Maps] Error: {exc}")
            break

        for place in data.get("results", []):
            if len(leads) >= limit:
                break
            place_id = place.get("place_id", "")
            # Fetch details for website & phone
            website, phone, gbp_url = "", "", ""
            if place_id:
                try:
                    det = requests.get(
                        detail_url,
                        params={
                            "place_id": place_id,
                            "fields": "website,formatted_phone_number,url",
                            "key": config.GOOGLE_MAPS_API_KEY,
                        },
                        timeout=10,
                    ).json().get("result", {})
                    website = det.get("website", "")
                    phone = det.get("formatted_phone_number", "")
                    gbp_url = det.get("url", "")
                except Exception:
                    pass
                time.sleep(config.REQUEST_DELAY * 0.5)

            leads.append(
                BusinessLead(
                    name=place.get("name", ""),
                    website=website,
                    phone=phone,
                    address=place.get("formatted_address", ""),
                    city=city,
                    category=vertical,
                    rating=place.get("rating", 0.0),
                    review_count=place.get("user_ratings_total", 0),
                    source="google_maps",
                    gbp_url=gbp_url,
                    extra={"place_id": place_id},
                )
            )

        next_page_token = data.get("next_page_token")
        if not next_page_token or len(data.get("results", [])) == 0:
            break

    return leads[:limit]


# ── Yellow Pages scraper ──────────────────────────────────────────────────────

def prospect_yellow_pages(
    vertical: str,
    city: str,
    state: str = "",
    max_results: int | None = None,
) -> list[BusinessLead]:
    """
    Scrape Yellow Pages search results.
    No API key required; uses public search pages.
    Be respectful: applies REQUEST_DELAY between requests.
    """
    limit = max_results or config.MAX_RESULTS_PER_SOURCE
    leads: list[BusinessLead] = []

    # YP URL-encode vertical (spaces → hyphens)
    slug = re.sub(r"\s+", "-", vertical.lower())
    location = f"{city.replace(' ', '-')},{state}" if state else city.replace(" ", "-")
    base_url = f"https://www.yellowpages.com/search?search_terms={slug}&geo_location_terms={location}"

    page = 1
    while len(leads) < limit:
        url = f"{base_url}&page={page}"
        try:
            resp = requests.get(url, headers=config.DESKTOP_HEADERS, timeout=15)
            if resp.status_code != 200:
                break
            soup = BeautifulSoup(resp.text, "lxml")
        except Exception as exc:
            print(f"  [YellowPages] Error: {exc}")
            break

        listings = soup.select("div.result")
        if not listings:
            break

        for listing in listings:
            if len(leads) >= limit:
                break
            name_tag = listing.select_one("a.business-name")
            name = name_tag.get_text(strip=True) if name_tag else ""

            website_tag = listing.select_one("a.track-visit-website")
            website = website_tag.get("href", "") if website_tag else ""

            phone_tag = listing.select_one("div.phones.phone.primary")
            phone = phone_tag.get_text(strip=True) if phone_tag else ""

            address_tag = listing.select_one("p.adr")
            address = address_tag.get_text(separator=" ", strip=True) if address_tag else ""

            if not name:
                continue

            leads.append(
                BusinessLead(
                    name=name,
                    website=website,
                    phone=phone,
                    address=address,
                    city=city,
                    category=vertical,
                    source="yellow_pages",
                )
            )

        page += 1
        time.sleep(config.REQUEST_DELAY)

    return leads[:limit]


# ── CSV / file source ─────────────────────────────────────────────────────────

def prospect_from_csv(filepath: str) -> list[BusinessLead]:
    """
    Load businesses from a CSV file.

    Expected columns (case-insensitive):
      name, website, phone, address, city, category, rating, notes

    Only 'name' and 'website' are required.
    """
    leads: list[BusinessLead] = []
    with open(filepath, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            # Normalise keys to lowercase
            row = {k.lower().strip(): v.strip() for k, v in row.items()}
            name = row.get("name", "")
            website = row.get("website", row.get("url", row.get("site", "")))
            if not name and not website:
                continue
            leads.append(
                BusinessLead(
                    name=name,
                    website=website,
                    phone=row.get("phone", ""),
                    address=row.get("address", ""),
                    city=row.get("city", ""),
                    category=row.get("category", row.get("vertical", "")),
                    rating=float(row.get("rating", 0) or 0),
                    notes=row.get("notes", ""),
                    source="csv",
                )
            )
    return leads


# ── Plain-text URL list ───────────────────────────────────────────────────────

def prospect_from_txt(filepath: str, category: str = "") -> list[BusinessLead]:
    """Load one URL per line from a plain-text file."""
    leads: list[BusinessLead] = []
    with open(filepath, encoding="utf-8") as fh:
        for line in fh:
            url = line.strip()
            if url and not url.startswith("#"):
                leads.append(
                    BusinessLead(name="", website=url, category=category, source="txt")
                )
    return leads


# ── Deduplication ─────────────────────────────────────────────────────────────

def deduplicate(leads: list[BusinessLead]) -> list[BusinessLead]:
    """Remove duplicate entries by normalised website domain."""
    seen: set[str] = set()
    unique: list[BusinessLead] = []
    for lead in leads:
        domain = _extract_domain(lead.website)
        if domain and domain in seen:
            continue
        seen.add(domain)
        unique.append(lead)
    # Also deduplicate by business name within the same city
    seen_names: set[str] = set()
    final: list[BusinessLead] = []
    for lead in unique:
        key = f"{lead.name.lower().strip()}|{lead.city.lower().strip()}"
        if lead.name and key in seen_names:
            continue
        seen_names.add(key)
        final.append(lead)
    return final


def _extract_domain(url: str) -> str:
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url if "://" in url else "https://" + url)
        return parsed.netloc.lower().lstrip("www.")
    except Exception:
        return url.lower()


# ── Convenience: prospect from all configured sources ────────────────────────

def prospect_all(
    verticals: list[str] | None = None,
    city: str | None = None,
    state: str | None = None,
    max_per_source: int | None = None,
    sources: list[str] | None = None,
) -> list[BusinessLead]:
    """
    Run all (or selected) prospecting sources and return a deduplicated list.

    sources: subset of ["yelp", "google_maps", "yellow_pages"]
             defaults to all three.
    """
    verticals = verticals or config.DEFAULT_VERTICALS
    city = city or config.TARGET_CITY
    state = state or config.TARGET_STATE
    sources = sources or ["yelp", "google_maps", "yellow_pages"]

    all_leads: list[BusinessLead] = []

    for vertical in verticals:
        print(f"\n[Prospecting] {vertical} in {city}")

        if "yelp" in sources:
            print("  → Yelp...")
            leads = prospect_yelp(vertical, city, max_per_source)
            print(f"     {len(leads)} leads found")
            all_leads.extend(leads)
            time.sleep(config.REQUEST_DELAY)

        if "google_maps" in sources:
            print("  → Google Maps...")
            leads = prospect_google_maps(vertical, city, max_per_source)
            print(f"     {len(leads)} leads found")
            all_leads.extend(leads)
            time.sleep(config.REQUEST_DELAY)

        if "yellow_pages" in sources:
            print("  → Yellow Pages...")
            leads = prospect_yellow_pages(vertical, city, state, max_per_source)
            print(f"     {len(leads)} leads found")
            all_leads.extend(leads)
            time.sleep(config.REQUEST_DELAY)

    deduped = deduplicate(all_leads)
    print(f"\n[Prospecting] Total after deduplication: {len(deduped)} leads")
    return deduped
