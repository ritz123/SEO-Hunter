"""
Apify integration — scrape Google Maps business data using the
`compass/google-maps-scraper` actor (or any compatible actor).

If APIFY_API_TOKEN is not set, falls back to the existing Yellow Pages
and Yelp scrapers in prospector.py.

Apify actor docs:
  https://apify.com/compass/google-maps-scraper
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import config


@dataclass
class ApifyBusiness:
    """Normalised business record from Apify actor output."""
    apify_id: str = ""
    name: str = ""
    website: str = ""
    phone: str = ""
    address: str = ""
    lat: float | None = None
    lng: float | None = None
    category: str = ""
    rating: float = 0.0
    review_count: int = 0
    gbp_url: str = ""
    extra: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.website and not self.website.startswith(("http://", "https://")):
            self.website = "https://" + self.website


def _normalize_item(item: dict[str, Any], category: str = "") -> ApifyBusiness:
    """
    Map a raw Apify actor result item to an ApifyBusiness.

    The compass/google-maps-scraper actor returns fields like:
      placeId, title, address, phone, website, location.lat/lng,
      totalScore, reviewsCount, categoryName, url (GBP link)
    """
    location = item.get("location") or {}
    if isinstance(location, dict):
        lat = location.get("lat") or item.get("latitude")
        lng = location.get("lng") or item.get("longitude")
    else:
        lat = item.get("latitude")
        lng = item.get("longitude")

    return ApifyBusiness(
        apify_id=item.get("placeId") or item.get("id") or "",
        name=item.get("title") or item.get("name") or "",
        website=item.get("website") or "",
        phone=item.get("phone") or item.get("phoneUnformatted") or "",
        address=item.get("address") or item.get("formattedAddress") or "",
        lat=float(lat) if lat is not None else None,
        lng=float(lng) if lng is not None else None,
        category=item.get("categoryName") or category,
        rating=float(item.get("totalScore") or item.get("rating") or 0),
        review_count=int(item.get("reviewsCount") or item.get("reviewCount") or 0),
        gbp_url=item.get("url") or item.get("googleMapsUrl") or "",
        extra={
            k: v for k, v in item.items()
            if k not in {
                "placeId", "id", "title", "name", "website", "phone",
                "phoneUnformatted", "address", "formattedAddress", "location",
                "latitude", "longitude", "categoryName", "totalScore",
                "rating", "reviewsCount", "reviewCount", "url", "googleMapsUrl",
            }
        },
    )


def scrape_google_maps(
    search_term: str,
    location: str,
    max_items: int | None = None,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: int = 5,
) -> tuple[list[ApifyBusiness], str | None]:
    """
    Trigger an Apify Google Maps Scraper run and wait for results.

    Returns (businesses, apify_run_id).
    Raises RuntimeError if no API token is configured.
    """
    if not config.APIFY_API_TOKEN:
        raise RuntimeError(
            "APIFY_API_TOKEN is not configured. "
            "Add it to .env or use the fallback scrapers."
        )

    from apify_client import ApifyClient

    client = ApifyClient(token=config.APIFY_API_TOKEN)
    limit = max_items or config.APIFY_MAX_ITEMS

    run_input: dict[str, Any] = {
        "searchStringsArray": [search_term],
        "maxCrawledPlacesPerSearch": limit,
        "language": "en",
        "includeWebResults": False,
        "scrapeDirectories": False,
        "scrapeReviews": False,
        "scrapeImages": False,
    }

    # If we have a lat/lng, use coordinates + radius for a tighter search.
    # Otherwise fall back to a text location query.
    if lat is not None and lng is not None:
        run_input["customGeolocation"] = {
            "type": "circle",
            "lat": lat,
            "lng": lng,
            "radiusKm": radius_km,
        }
    else:
        run_input["locationQuery"] = location

    actor = client.actor(config.APIFY_ACTOR_ID)
    run = actor.call(run_input=run_input, wait_secs=0)  # async start
    run_id = run.get("id") or run.get("actId") or ""

    # Poll until finished
    max_wait_seconds = 600
    poll_interval = 10
    elapsed = 0

    while elapsed < max_wait_seconds:
        run_info = client.run(run_id).get()
        status = run_info.get("status", "")
        if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            break
        time.sleep(poll_interval)
        elapsed += poll_interval

    run_info = client.run(run_id).get()
    if run_info.get("status") != "SUCCEEDED":
        raise RuntimeError(
            f"Apify run {run_id} ended with status: {run_info.get('status')}"
        )

    dataset_id = run_info.get("defaultDatasetId")
    items = list(client.dataset(dataset_id).iterate_items())

    businesses = [_normalize_item(item, search_term) for item in items]
    # Deduplicate by apify_id
    seen: set[str] = set()
    unique: list[ApifyBusiness] = []
    for b in businesses:
        key = b.apify_id or b.name.lower()
        if key and key in seen:
            continue
        seen.add(key)
        unique.append(b)

    return unique, run_id


def scrape_google_maps_async_start(
    search_term: str,
    location: str,
    max_items: int | None = None,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: int = 5,
) -> str:
    """
    Start an Apify run without waiting. Returns the Apify run ID.
    Use `poll_apify_run(run_id)` to check status and collect results.
    """
    if not config.APIFY_API_TOKEN:
        raise RuntimeError("APIFY_API_TOKEN is not configured.")

    from apify_client import ApifyClient

    client = ApifyClient(token=config.APIFY_API_TOKEN)
    limit = max_items or config.APIFY_MAX_ITEMS

    run_input: dict[str, Any] = {
        "searchStringsArray": [search_term],
        "maxCrawledPlacesPerSearch": limit,
        "language": "en",
        "includeWebResults": False,
        "scrapeReviews": False,
        "scrapeImages": False,
    }

    if lat is not None and lng is not None:
        run_input["customGeolocation"] = {
            "type": "circle",
            "lat": lat,
            "lng": lng,
            "radiusKm": radius_km,
        }
    else:
        run_input["locationQuery"] = location

    run = client.actor(config.APIFY_ACTOR_ID).call(run_input=run_input, wait_secs=0)
    return run.get("id") or ""


def poll_apify_run(run_id: str) -> tuple[str, list[ApifyBusiness] | None]:
    """
    Check an Apify run's status.

    Returns (status, businesses_or_None).
    businesses is populated only when status == "SUCCEEDED".
    Possible statuses: RUNNING, READY, SUCCEEDED, FAILED, ABORTED, TIMED-OUT
    """
    if not config.APIFY_API_TOKEN:
        raise RuntimeError("APIFY_API_TOKEN is not configured.")

    from apify_client import ApifyClient

    client = ApifyClient(token=config.APIFY_API_TOKEN)
    run_info = client.run(run_id).get()
    status = run_info.get("status", "UNKNOWN")

    if status != "SUCCEEDED":
        return status, None

    dataset_id = run_info.get("defaultDatasetId")
    items = list(client.dataset(dataset_id).iterate_items())
    businesses = [_normalize_item(item) for item in items]
    return status, businesses
