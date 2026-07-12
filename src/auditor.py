"""
Audit engine — Stage 1 & 3 of the strategy.

Checks every defined signal for a given URL and returns a dict of
boolean findings keyed by the same signal names used in SCORING_WEIGHTS.
"""

from __future__ import annotations

import json
import re
import socket
import ssl
import time
import datetime
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

import config


# ── Result container ──────────────────────────────────────────────────────────

@dataclass
class AuditResult:
    url: str
    reachable: bool = False
    final_url: str = ""
    status_code: int = 0
    signals: dict[str, bool] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)   # arbitrary metadata
    error: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get(url: str, mobile: bool = False, timeout: int | None = None) -> requests.Response:
    headers = config.HEADERS if mobile else config.DESKTOP_HEADERS
    return requests.get(
        url,
        headers=headers,
        timeout=timeout or config.REQUEST_TIMEOUT,
        allow_redirects=True,
    )


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def _normalize_url(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url.rstrip("/")


# ── Individual signal checkers ────────────────────────────────────────────────

def check_reachability(url: str) -> tuple[bool, str, int]:
    """Return (reachable, final_url, status_code)."""
    try:
        resp = _get(url)
        return resp.status_code < 400, resp.url, resp.status_code
    except requests.exceptions.SSLError:
        # Try HTTP fallback to see if the site exists at all
        try:
            http_url = url.replace("https://", "http://")
            resp = requests.get(
                http_url,
                headers=config.DESKTOP_HEADERS,
                timeout=config.REQUEST_TIMEOUT,
                allow_redirects=True,
            )
            return resp.status_code < 400, resp.url, resp.status_code
        except Exception:
            return False, url, 0
    except Exception:
        return False, url, 0


def check_https(url: str, final_url: str) -> bool:
    """True when signal is PRESENT (i.e., site does NOT use HTTPS)."""
    return not final_url.startswith("https://")


def check_ssl(url: str) -> bool:
    """True when SSL is invalid or expired. Returns False if site has valid cert."""
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        return True  # can't check → flag it
    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.create_connection((hostname, 443), timeout=10), server_hostname=hostname):
            return False  # valid cert
    except ssl.SSLCertVerificationError:
        return True
    except ssl.SSLError:
        return True
    except Exception:
        return False  # network error, don't penalise


def check_mobile_friendly(html: str) -> bool:
    """
    True (signal present) when the page appears NOT mobile-friendly.
    Checks for meta viewport tag — its absence is a reliable proxy when
    Google's API key is unavailable.
    """
    soup = _soup(html)
    viewport = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    return viewport is None


def check_meta_viewport(html: str) -> bool:
    """True when meta viewport tag is missing."""
    soup = _soup(html)
    viewport = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    return viewport is None


def check_pagespeed(url: str) -> tuple[bool, int]:
    """
    Query Google PageSpeed Insights API.
    Returns (signal_present, score). signal_present=True when score < 50.
    Falls back to (False, -1) when no API key is configured.
    """
    if not config.GOOGLE_PSI_API_KEY:
        return False, -1
    try:
        params = {
            "url": url,
            "key": config.GOOGLE_PSI_API_KEY,
            "strategy": "mobile",
            "category": "performance",
        }
        resp = requests.get(config.GOOGLE_PSI_URL, params=params, timeout=30)
        data = resp.json()
        score = int(
            data.get("lighthouseResult", {})
            .get("categories", {})
            .get("performance", {})
            .get("score", 1) * 100
        )
        return score < 50, score
    except Exception:
        return False, -1


def check_copyright_year(html: str) -> tuple[bool, int | None]:
    """
    True when the footer copyright year is 2+ years behind today.
    Returns (signal_present, detected_year).
    """
    current_year = datetime.date.today().year
    # Search for copyright patterns in the HTML text
    matches = re.findall(r'(?:©|&copy;|copyright)\s*(?:\(c\)\s*)?(\d{4})', html, re.IGNORECASE)
    if not matches:
        return False, None
    # Take the most recent year found
    years = [int(y) for y in matches if 1990 <= int(y) <= current_year + 1]
    if not years:
        return False, None
    latest = max(years)
    return (current_year - latest) >= 2, latest


def check_deprecated_tech(html: str) -> tuple[bool, list[str]]:
    """True when deprecated technologies are detected in the HTML source."""
    found = []
    for pattern in config.DEPRECATED_PATTERNS:
        if re.search(pattern, html, re.IGNORECASE):
            found.append(pattern)
    return bool(found), found


def check_meta_description(html: str) -> bool:
    """True when meta description is missing or empty."""
    soup = _soup(html)
    tag = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    if not tag:
        return True
    content = tag.get("content", "").strip()
    return not content


def check_title(html: str) -> bool:
    """True when the <title> tag is missing or empty."""
    soup = _soup(html)
    title = soup.find("title")
    if not title:
        return True
    return not (title.get_text() or "").strip()


def check_structured_data(html: str) -> bool:
    """True when no JSON-LD or Microdata structured data is found."""
    soup = _soup(html)
    json_ld = soup.find_all("script", attrs={"type": "application/ld+json"})
    if json_ld:
        return False
    # Check for basic microdata
    microdata = soup.find_all(attrs={"itemscope": True})
    return not microdata


def check_wayback(url: str) -> tuple[bool, str | None]:
    """
    Query Wayback Machine CDX API for the most recent snapshot.
    Returns (signal_present, last_snapshot_date_str).
    signal_present=True when last snapshot is 2+ years old or doesn't exist.
    """
    try:
        params = {
            "url": url,
            "output": "json",
            "limit": 1,
            "fl": "timestamp",
            "filter": "statuscode:200",
            "from": "20000101",
        }
        resp = requests.get(config.WAYBACK_CDX_URL, params=params, timeout=20)
        data = resp.json()
        if not data or len(data) < 2:
            return True, None  # never archived or no successful snapshot
        timestamp = data[1][0]  # format: YYYYMMDDHHMMSS
        snapshot_date = datetime.date(int(timestamp[:4]), int(timestamp[4:6]), int(timestamp[6:8]))
        age_years = (datetime.date.today() - snapshot_date).days / 365
        return age_years >= 2, snapshot_date.isoformat()
    except Exception:
        return False, None


def check_broken_nav_links(html: str, base_url: str) -> tuple[bool, list[str]]:
    """
    Check main navigation links (up to 10) for broken responses.
    True when at least one nav link is broken (4xx / 5xx).
    """
    soup = _soup(html)
    nav = soup.find("nav") or soup.find(attrs={"role": "navigation"})
    if not nav:
        nav = soup  # fall back to full page

    anchors = nav.find_all("a", href=True)[:10]
    broken = []
    for a in anchors:
        href = a["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        full_url = urljoin(base_url, href)
        try:
            r = requests.head(
                full_url,
                headers=config.DESKTOP_HEADERS,
                timeout=8,
                allow_redirects=True,
            )
            if r.status_code >= 400:
                broken.append(full_url)
        except Exception:
            broken.append(full_url)
        time.sleep(0.3)
    return bool(broken), broken


def check_social_links(html: str) -> bool:
    """True when no social media links are found on the page."""
    social_patterns = [
        r'facebook\.com/',
        r'twitter\.com/',
        r'x\.com/',
        r'instagram\.com/',
        r'linkedin\.com/',
        r'youtube\.com/',
        r'tiktok\.com/',
        r'yelp\.com/biz/',
    ]
    for pattern in social_patterns:
        if re.search(pattern, html, re.IGNORECASE):
            return False
    return True


def check_cta(html: str) -> bool:
    """
    True when no call-to-action is detected.
    Looks for contact forms and action-oriented button text.
    """
    soup = _soup(html)
    # Forms with email/phone fields
    forms = soup.find_all("form")
    for form in forms:
        inputs = form.find_all("input", attrs={"type": re.compile(r"email|tel|text", re.I)})
        if inputs:
            return False
    # Button / anchor text patterns
    cta_keywords = re.compile(
        r'\b(contact|call\s+us|get\s+a\s+quote|book|schedule|request|free\s+'
        r'estimate|enquire|reach\s+out|get\s+in\s+touch|appointment)\b',
        re.IGNORECASE,
    )
    buttons = soup.find_all(["button", "a"])
    for el in buttons:
        if cta_keywords.search(el.get_text()):
            return False
    return True


def extract_email(html: str) -> str:
    """
    Extract the first business contact email found on the page.
    Checks mailto: links first (most reliable), then falls back to a
    regex scan of visible text. Returns empty string if nothing found.
    """
    soup = _soup(html)
    # 1. mailto: links are the most reliable source
    for a in soup.find_all("a", href=re.compile(r'^mailto:', re.I)):
        addr = a["href"][7:].split("?")[0].strip().lower()
        if addr and "@" in addr:
            return addr
    # 2. Regex scan of page text — filter obvious false positives
    email_re = re.compile(
        r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}',
    )
    skip_domains = {"example.com", "domain.com", "email.com", "yourdomain.com",
                    "sentry.io", "wixpress.com", "squarespace.com"}
    for match in email_re.finditer(soup.get_text(" ")):
        addr = match.group().lower()
        domain = addr.split("@")[-1]
        if domain not in skip_domains and not domain.endswith((".png", ".jpg", ".gif", ".svg")):
            return addr
    return ""


def check_security_headers(url: str) -> dict[str, bool]:
    """
    Check HTTP response headers for missing security best practices.
    Returns a dict of signal_key → bool (True = issue present).
    """
    try:
        resp = _get(url, timeout=10)
        h = {k.lower(): v for k, v in resp.headers.items()}
        csp = h.get('content-security-policy', '')
        return {
            'missing_hsts':           'strict-transport-security' not in h,
            'missing_csp':            not csp,
            'missing_xframe':         'x-frame-options' not in h and 'frame-ancestors' not in csp,
            'missing_xcto':           h.get('x-content-type-options', '').lower() != 'nosniff',
            'missing_referrer_policy': 'referrer-policy' not in h,
        }
    except Exception:
        return {}


def check_mixed_content(html: str, base_url: str) -> bool:
    """
    True when an HTTPS page loads HTTP (insecure) resources.
    Only meaningful for HTTPS sites.
    """
    if not base_url.startswith('https://'):
        return False
    soup = _soup(html)
    http_re = re.compile(r'^http://', re.I)
    for tag in soup.find_all(['img', 'script', 'iframe'], src=True):
        if http_re.match(tag.get('src', '')):
            return True
    for tag in soup.find_all('link', href=True):
        if http_re.match(tag.get('href', '')):
            return True
    return False


def check_exposed_sensitive_paths(base_url: str) -> tuple[bool, list[str]]:
    """
    Probe a short list of critical sensitive paths.
    Returns (signal_present, list_of_exposed_paths).
    A 200 response means exposed; 403 means the file exists but access-denied
    (still a leak of information).
    """
    PATHS = [
        '/.git/HEAD',
        '/.env',
        '/wp-config.php.bak',
        '/phpinfo.php',
        '/.htpasswd',
        '/server-status',
    ]
    parsed = urlparse(base_url)
    root = f"{parsed.scheme}://{parsed.netloc}"
    exposed = []
    for path in PATHS:
        try:
            r = requests.head(
                root + path,
                headers=config.DESKTOP_HEADERS,
                timeout=5,
                allow_redirects=False,
            )
            if r.status_code in (200, 403):
                exposed.append(path)
        except Exception:
            pass
        time.sleep(0.15)
    return bool(exposed), exposed


def check_cms_version_exposed(html: str, response_headers: dict) -> tuple[bool, str]:
    """
    True when a CMS version number is detectable in the page source or HTTP headers.
    Returns (signal_present, detected_version_string).
    """
    soup = _soup(html)
    # Meta generator tag
    gen = soup.find('meta', attrs={'name': re.compile(r'^generator$', re.I)})
    if gen:
        content = gen.get('content', '')
        if re.search(r'(wordpress|joomla|drupal|typo3|wix|squarespace)\s*[\d.]+', content, re.I):
            return True, content
    # WordPress version in asset URLs (?ver=x.x.x)
    wp = re.search(r'wp-(?:content|includes)[^"\']*\?ver=([\d.]+)', html)
    if wp:
        return True, f"WordPress {wp.group(1)}"
    # X-Powered-By / X-Generator headers
    for hdr in ('x-powered-by', 'x-generator', 'x-drupal-cache'):
        val = response_headers.get(hdr.lower(), '')
        if re.search(r'php/[\d.]+|asp\.net|drupal', val, re.I):
            return True, val
    return False, ''


def check_stale_blog(html: str) -> tuple[bool, str | None]:
    """
    True when the most recent blog/news post date found is older than 2 years.
    Uses regex heuristics on page text — not a guarantee.
    """
    current_year = datetime.date.today().year
    date_patterns = [
        r'(\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|'
        r'Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
        r'\s+\d{1,2},?\s+(\d{4}))',
        r'(\d{1,2}/\d{1,2}/(\d{4}))',
        r'(\d{4}-\d{2}-\d{2})',
    ]
    years_found = []
    for pattern in date_patterns:
        for match in re.finditer(pattern, html, re.IGNORECASE):
            try:
                year_str = match.group(2) if len(match.groups()) > 1 else match.group(0)[:4]
                year = int(year_str)
                if 2000 <= year <= current_year + 1:
                    years_found.append(year)
            except Exception:
                pass
    if not years_found:
        return False, None
    most_recent = max(years_found)
    return (current_year - most_recent) >= 2, str(most_recent)


# ── Main audit function ───────────────────────────────────────────────────────

def audit(url: str, check_nav_links: bool = False) -> AuditResult:
    """
    Run all signal checks against a URL.
    Returns an AuditResult with a signals dict and metadata.
    """
    url = _normalize_url(url)
    result = AuditResult(url=url)

    # Step 1: Fetch the page
    reachable, final_url, status_code = check_reachability(url)
    result.reachable = reachable
    result.final_url = final_url
    result.status_code = status_code

    if not reachable:
        result.signals["broken_home_page"] = True
        result.error = f"Unreachable (status {status_code})"
        return result

    result.signals["broken_home_page"] = False

    try:
        resp = _get(final_url)
        html = resp.text
        resp_headers = {k.lower(): v for k, v in resp.headers.items()}
    except Exception as exc:
        result.error = str(exc)
        return result

    # Step 2: HTTPS / SSL
    result.signals["no_https"] = check_https(url, final_url)
    result.signals["ssl_invalid_or_expired"] = check_ssl(final_url)

    # Step 3: Mobile / viewport
    vp_missing = check_meta_viewport(html)
    result.signals["no_meta_viewport"] = vp_missing
    result.signals["fails_mobile_friendly"] = vp_missing  # viewport absence = strong proxy

    # Step 4: PageSpeed (requires API key)
    psi_signal, psi_score = check_pagespeed(final_url)
    result.signals["pagespeed_score_low"] = psi_signal
    result.raw["pagespeed_score"] = psi_score

    # Step 5: Copyright year
    copy_signal, copy_year = check_copyright_year(html)
    result.signals["copyright_year_old"] = copy_signal
    result.raw["copyright_year"] = copy_year

    # Step 6: Deprecated tech
    dep_signal, dep_found = check_deprecated_tech(html)
    result.signals["deprecated_tech"] = dep_signal
    result.raw["deprecated_patterns"] = dep_found

    # Step 7: SEO basics
    result.signals["missing_meta_description"] = check_meta_description(html)
    result.signals["missing_title"] = check_title(html)
    result.signals["no_structured_data"] = check_structured_data(html)

    # Step 8: Wayback Machine
    wb_signal, wb_date = check_wayback(final_url)
    result.signals["wayback_stale"] = wb_signal
    result.raw["wayback_last_snapshot"] = wb_date

    # Step 9: Navigation links (optional, slow)
    if check_nav_links:
        broken_signal, broken_urls = check_broken_nav_links(html, final_url)
        result.signals["broken_nav_links"] = broken_signal
        result.raw["broken_nav_urls"] = broken_urls
    else:
        result.signals["broken_nav_links"] = False

    # Step 10: Social links
    result.signals["no_social_links"] = check_social_links(html)

    # Step 11: CTA
    result.signals["no_cta"] = check_cta(html)

    # Step 12: Stale blog
    blog_signal, blog_year = check_stale_blog(html)
    result.signals["stale_blog"] = blog_signal
    result.raw["latest_blog_year"] = blog_year

    # Step 13: Google indexation (not_indexed) — heuristic via site: query
    # We skip automated Google search to avoid bot detection.
    # Mark as False by default; manual verification covers this.
    result.signals["not_indexed"] = False

    # Step 14: Extract contact email from page
    result.raw["email"] = extract_email(html)

    # Step 15: Security headers
    sec_headers = check_security_headers(final_url)
    result.signals.update(sec_headers)

    # Step 16: Mixed content
    result.signals["mixed_content"] = check_mixed_content(html, final_url)

    # Step 16: Exposed sensitive paths
    exp_signal, exp_paths = check_exposed_sensitive_paths(final_url)
    result.signals["exposed_sensitive_path"] = exp_signal
    result.raw["exposed_paths"] = exp_paths

    # Step 17: CMS / tech version exposed
    cms_signal, cms_version = check_cms_version_exposed(html, resp_headers)
    result.signals["cms_version_exposed"] = cms_signal
    result.raw["cms_version"] = cms_version

    return result
