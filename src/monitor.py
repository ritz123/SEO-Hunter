"""
Monitoring pipeline — Stage 6 of the strategy.

Provides:
  1. RSS feed reader for Google Alerts / Chamber of Commerce feeds
  2. New-business detector (compares current Yelp/YP results against a
     previously saved snapshot to surface newly listed businesses)
  3. Scheduler that re-runs prospecting + auditing on a configurable interval
  4. Report generator that emails or prints a digest of new opportunities

Run continuously:
    python main.py monitor --interval 24

Or as a one-shot check:
    python main.py monitor --once
"""

from __future__ import annotations

import csv
import datetime
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

import requests
import schedule

import config
from src.prospector import BusinessLead, prospect_all, prospect_from_csv


# ── Snapshot helpers ──────────────────────────────────────────────────────────

SNAPSHOT_DIR = os.path.join(config.OUTPUT_DIR, "snapshots")


def _snapshot_path(tag: str) -> str:
    os.makedirs(SNAPSHOT_DIR, exist_ok=True)
    return os.path.join(SNAPSHOT_DIR, f"{tag}.json")


def _lead_fingerprint(lead: BusinessLead) -> str:
    """Stable identifier for a business lead used for change detection."""
    raw = f"{lead.name.lower().strip()}|{lead.city.lower().strip()}|{lead.website.lower().strip()}"
    return hashlib.md5(raw.encode()).hexdigest()


def save_snapshot(leads: list[BusinessLead], tag: str) -> None:
    """Persist a list of leads to a JSON snapshot file."""
    data = [
        {
            "fingerprint": _lead_fingerprint(l),
            "name": l.name,
            "website": l.website,
            "city": l.city,
            "category": l.category,
            "source": l.source,
            "saved_at": datetime.datetime.now().isoformat(),
        }
        for l in leads
    ]
    with open(_snapshot_path(tag), "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


def load_snapshot(tag: str) -> set[str]:
    """Return set of fingerprints from a previous snapshot."""
    path = _snapshot_path(tag)
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return {entry["fingerprint"] for entry in data}


def find_new_leads(
    current: list[BusinessLead],
    snapshot_tag: str,
) -> list[BusinessLead]:
    """Return leads that did not exist in the previous snapshot."""
    known = load_snapshot(snapshot_tag)
    return [l for l in current if _lead_fingerprint(l) not in known]


# ── RSS / Google Alerts reader ────────────────────────────────────────────────

def fetch_rss_items(feed_url: str, max_items: int = 20) -> list[dict[str, str]]:
    """
    Fetch and parse an RSS/Atom feed.
    Returns list of {title, link, published} dicts.
    """
    try:
        resp = requests.get(
            feed_url,
            headers=config.DESKTOP_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
    except Exception as exc:
        print(f"  [RSS] Failed to fetch {feed_url}: {exc}")
        return []

    from xml.etree import ElementTree as ET
    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError as exc:
        print(f"  [RSS] Parse error: {exc}")
        return []

    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "rss": "",
    }

    items: list[dict[str, str]] = []

    # Atom feed
    for entry in root.findall(".//atom:entry", ns):
        title = entry.findtext("atom:title", default="", namespaces=ns)
        link_el = entry.find("atom:link", ns)
        link = (link_el.get("href", "") if link_el is not None else "")
        published = entry.findtext("atom:published", default="", namespaces=ns)
        items.append({"title": title, "link": link, "published": published})

    # RSS 2.0 feed
    for item in root.findall(".//item"):
        title = item.findtext("title", default="")
        link = item.findtext("link", default="")
        published = item.findtext("pubDate", default="")
        items.append({"title": title, "link": link, "published": published})

    return items[:max_items]


def monitor_google_alerts(feed_urls: list[str]) -> list[dict[str, str]]:
    """
    Aggregate items from multiple Google Alert RSS feeds.
    Configure alert URLs in .env or pass directly.
    """
    all_items: list[dict[str, str]] = []
    for url in feed_urls:
        print(f"  [Monitor] Checking alert feed: {url[:60]}...")
        items = fetch_rss_items(url)
        all_items.extend(items)
    return all_items


# ── New-business detection ────────────────────────────────────────────────────

def check_new_businesses(
    verticals: list[str] | None = None,
    city: str | None = None,
    state: str | None = None,
    snapshot_tag: str = "default",
    sources: list[str] | None = None,
) -> list[BusinessLead]:
    """
    Prospect from all sources, diff against last snapshot, return new entries.
    Saves updated snapshot automatically.
    """
    print(f"\n[Monitor] Checking for new businesses — {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}")
    current = prospect_all(
        verticals=verticals,
        city=city,
        state=state,
        sources=sources,
    )
    new_leads = find_new_leads(current, snapshot_tag)
    save_snapshot(current, snapshot_tag)
    print(f"[Monitor] {len(new_leads)} new businesses found since last check.")
    return new_leads


# ── Digest report ─────────────────────────────────────────────────────────────

def generate_digest(
    new_leads: list[BusinessLead],
    alert_items: list[dict[str, str]] | None = None,
    output_path: str | None = None,
) -> str:
    """
    Write a plain-text digest of new opportunities.
    Returns the file path.
    """
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    if output_path is None:
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(config.OUTPUT_DIR, f"digest_{ts}.txt")

    lines: list[str] = [
        "=" * 60,
        f"  Opportunity Digest — {datetime.datetime.now().strftime('%A, %d %b %Y %H:%M')}",
        "=" * 60,
        "",
    ]

    if new_leads:
        lines.append(f"NEW BUSINESSES DETECTED ({len(new_leads)})")
        lines.append("-" * 40)
        for lead in new_leads:
            lines.append(f"  • {lead.name or '(no name)'}")
            lines.append(f"    Category : {lead.category}")
            lines.append(f"    Website  : {lead.website or '(none)'}")
            lines.append(f"    Phone    : {lead.phone or '—'}")
            lines.append(f"    City     : {lead.city}")
            lines.append(f"    Source   : {lead.source}")
            lines.append("")
    else:
        lines.append("No new businesses detected since last check.")
        lines.append("")

    if alert_items:
        lines.append(f"GOOGLE ALERT ITEMS ({len(alert_items)})")
        lines.append("-" * 40)
        for item in alert_items[:10]:
            lines.append(f"  • {item.get('title', '(no title)')}")
            lines.append(f"    {item.get('link', '')}")
            lines.append(f"    Published: {item.get('published', '')}")
            lines.append("")

    lines.append("=" * 60)
    content = "\n".join(lines)

    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write(content)

    print(content)
    return output_path


# ── Scheduler ─────────────────────────────────────────────────────────────────

def _run_check(
    verticals: list[str] | None,
    city: str | None,
    state: str | None,
    alert_feeds: list[str],
    snapshot_tag: str,
    sources: list[str] | None,
) -> None:
    new_leads = check_new_businesses(
        verticals=verticals,
        city=city,
        state=state,
        snapshot_tag=snapshot_tag,
        sources=sources,
    )
    alert_items = monitor_google_alerts(alert_feeds) if alert_feeds else []
    generate_digest(new_leads, alert_items)


def start_scheduler(
    interval_hours: int = config.MONITOR_INTERVAL_HOURS,
    verticals: list[str] | None = None,
    city: str | None = None,
    state: str | None = None,
    alert_feeds: list[str] | None = None,
    snapshot_tag: str = "default",
    sources: list[str] | None = None,
) -> None:
    """
    Start a blocking scheduler that runs the monitoring check every
    `interval_hours` hours. Press Ctrl+C to stop.
    """
    feeds = alert_feeds or []

    job = lambda: _run_check(verticals, city, state, feeds, snapshot_tag, sources)

    # Run immediately on start
    job()

    schedule.every(interval_hours).hours.do(job)
    print(f"\n[Monitor] Scheduler running — checks every {interval_hours}h. Press Ctrl+C to stop.\n")

    try:
        while True:
            schedule.run_pending()
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n[Monitor] Scheduler stopped.")
