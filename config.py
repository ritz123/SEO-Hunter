"""
Central configuration: scoring weights, thresholds, signal definitions,
vertical targets, and API endpoints.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── API Keys ─────────────────────────────────────────────────────────────────
# Google PageSpeed Insights — optional; auditor works without it
GOOGLE_PSI_API_KEY = os.getenv("GOOGLE_PSI_API_KEY", "")

# No Google Maps key required — map uses Leaflet + OpenStreetMap
# Business discovery uses Apify (optional) → OSM Overpass → Yellow Pages

YELP_API_KEY = os.getenv("YELP_API_KEY", "")
OUTSCRAPER_API_KEY = os.getenv("OUTSCRAPER_API_KEY", "")

# ── Apify ─────────────────────────────────────────────────────────────────────
APIFY_API_TOKEN = os.getenv("APIFY_API_TOKEN", "")
# The Google Maps Scraper actor — well-maintained community actor
APIFY_ACTOR_ID = os.getenv("APIFY_ACTOR_ID", "compass/google-maps-scraper")
APIFY_MAX_ITEMS = int(os.getenv("APIFY_MAX_ITEMS", "100"))

# ── Database ──────────────────────────────────────────────────────────────────
DB_URL = os.getenv("DATABASE_URL", "sqlite:///sitecp.db")

# ── Web server ────────────────────────────────────────────────────────────────
WEB_HOST = os.getenv("WEB_HOST", "0.0.0.0")
WEB_PORT = int(os.getenv("WEB_PORT", "8000"))

# ── Prospecting targets ───────────────────────────────────────────────────────
TARGET_CITY = os.getenv("TARGET_CITY", "San Francisco")
TARGET_STATE = os.getenv("TARGET_STATE", "CA")
MAX_RESULTS_PER_SOURCE = int(os.getenv("MAX_RESULTS_PER_SOURCE", "50"))

DEFAULT_VERTICALS = [
    v.strip()
    for v in os.getenv(
        "TARGET_VERTICALS",
        "plumbers,dentists,auto repair,HVAC,chiropractors,law firms,funeral homes,optometrists,electricians,restaurants",
    ).split(",")
]

# ── HTTP settings ─────────────────────────────────────────────────────────────
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "15"))
REQUEST_DELAY = float(os.getenv("REQUEST_DELAY", "1.5"))

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 11; Pixel 5) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/90.0.4430.91 Mobile Safari/537.36"
    )
}

DESKTOP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

# ── Output ────────────────────────────────────────────────────────────────────
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "output")

# ── Scoring model (Stage 3 from strategy) ────────────────────────────────────
#
# Each key maps to (points, description).
# Add/adjust weights here without touching auditor logic.

SCORING_WEIGHTS: dict[str, tuple[int, str]] = {
    "broken_home_page":         (5, "Home page is unreachable (5xx / timeout / DNS failure)"),
    "no_https":                 (3, "Site does not use HTTPS"),
    "fails_mobile_friendly":    (3, "Site fails Google mobile-friendly criteria"),
    "pagespeed_score_low":      (2, "PageSpeed score below 50"),
    "copyright_year_old":       (2, "Footer copyright year is 2+ years behind current year"),
    "wayback_stale":            (2, "Last Wayback Machine snapshot is 2+ years old"),
    "no_structured_data":       (1, "No JSON-LD or Microdata structured data found"),
    "missing_meta_description": (1, "Meta description tag is absent"),
    "missing_title":            (1, "Title tag is absent or empty"),
    "deprecated_tech":          (2, "Uses deprecated technology (Flash, Frames, old jQuery)"),
    "no_meta_viewport":         (2, "No meta viewport tag (not mobile-optimised)"),
    "broken_nav_links":         (2, "One or more main navigation links return errors"),
    "no_social_links":          (1, "No social media links found on the page"),
    "no_cta":                   (1, "No call-to-action buttons or contact forms detected"),
    "ssl_invalid_or_expired":   (3, "SSL certificate is invalid, self-signed, or expired"),
    "not_indexed":              (2, "Google site: query returns zero results (not indexed)"),
    "stale_blog":               (1, "Most recent blog/news post is older than 2 years"),
}

# ── Priority tiers ────────────────────────────────────────────────────────────
PRIORITY_A_THRESHOLD = int(os.getenv("PRIORITY_A_THRESHOLD", "8"))
PRIORITY_B_THRESHOLD = int(os.getenv("PRIORITY_B_THRESHOLD", "5"))

# ── Deprecated technology patterns ───────────────────────────────────────────
DEPRECATED_PATTERNS = [
    # Flash
    r'<object[^>]+\.swf',
    r'<embed[^>]+\.swf',
    r'flashvars',
    # Framesets
    r'<frameset',
    r'<frame\s',
    # Table-based layouts (strong indicator: deeply nested tables with layout attrs)
    r'<table[^>]+cellpadding',
    # Very old jQuery (< 1.8 bundled inline)
    r'jquery[/-]1\.[0-7]\.',
    # IE conditional comments
    r'<!--\[if\s+IE',
]

# ── Wayback CDX API ───────────────────────────────────────────────────────────
WAYBACK_CDX_URL = "https://web.archive.org/cdx/search/cdx"

# ── Google PageSpeed Insights (optional) ─────────────────────────────────────
GOOGLE_PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

# ── OpenStreetMap / Nominatim ─────────────────────────────────────────────────
# No key needed. Respect rate limit: 1 request/second from Nominatim.
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# ── Yelp API ─────────────────────────────────────────────────────────────────
YELP_SEARCH_URL = "https://api.yelp.com/v3/businesses/search"
YELP_BUSINESS_URL = "https://api.yelp.com/v3/businesses/{id}"

# ── Google Custom Search (for not-indexed check) ─────────────────────────────
# We use a simple requests-based approach rather than the paid CSE API.
GOOGLE_SEARCH_URL = "https://www.google.com/search"

# ── Monitoring ────────────────────────────────────────────────────────────────
MONITOR_INTERVAL_HOURS = 24
GOOGLE_ALERTS_RSS_TEMPLATE = (
    "https://www.google.com/alerts/feeds/{uid}/{alert_id}"
)
