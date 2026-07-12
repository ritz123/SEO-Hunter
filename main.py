#!/usr/bin/env python3
"""
siteCp — Local Business Outdated Website Finder
================================================
A CLI tool implementing the 6-stage strategy for identifying local businesses
with outdated websites and generating a qualified outreach prospect pipeline.

Usage:
    python main.py prospect   — Stage 2: discover business URLs
    python main.py audit      — Stage 3: audit a URL list or CSV
    python main.py pipeline   — Stages 2+3+export in one shot
    python main.py verify     — Stage 4: export verification checklist
    python main.py monitor    — Stage 6: continuous monitoring
    python main.py templates  — Stage 5: display outreach templates
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import click
from tqdm import tqdm
from colorama import Fore, Style, init as colorama_init

colorama_init(autoreset=True)

import config
from src.auditor import audit, AuditResult
from src.prospector import (
    BusinessLead,
    prospect_all,
    prospect_from_csv,
    prospect_from_txt,
)
from src.scorer import build_scored_result, ScoredResult
from src.exporter import (
    export_csv,
    export_verification_checklist,
    print_table,
    print_summary,
)
from src.monitor import (
    check_new_businesses,
    monitor_google_alerts,
    generate_digest,
    start_scheduler,
)


# ── CLI root ──────────────────────────────────────────────────────────────────

@click.group()
def cli():
    """siteCp — find local businesses with outdated websites."""
    pass


# ── Prospect command ──────────────────────────────────────────────────────────

@cli.command()
@click.option("--city", default=None, help="Target city (overrides .env)")
@click.option("--state", default=None, help="Target state/region")
@click.option(
    "--verticals",
    default=None,
    help="Comma-separated verticals, e.g. 'plumbers,dentists'",
)
@click.option(
    "--sources",
    default="yelp,google_maps,yellow_pages",
    show_default=True,
    help="Comma-separated sources to use",
)
@click.option("--max-results", default=None, type=int, help="Max results per source per vertical")
@click.option("--output", default=None, help="Output CSV filepath")
def prospect(city, state, verticals, sources, max_results, output):
    """Stage 2 — Discover business URLs from Yelp, Google Maps, Yellow Pages."""
    city = city or config.TARGET_CITY
    state = state or config.TARGET_STATE
    vertical_list = [v.strip() for v in verticals.split(",")] if verticals else None
    source_list = [s.strip() for s in sources.split(",")]

    click.echo(f"\n{Fore.CYAN}[siteCp] Prospecting businesses in {city}{Style.RESET_ALL}")
    leads = prospect_all(
        verticals=vertical_list,
        city=city,
        state=state,
        max_per_source=max_results,
        sources=source_list,
    )

    # Filter out leads with no website (can't audit)
    with_site = [l for l in leads if l.website]
    without_site = len(leads) - len(with_site)

    click.echo(f"\n{Fore.GREEN}Found {len(leads)} total leads ({len(with_site)} with websites, {without_site} without){Style.RESET_ALL}")

    # Export to CSV
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    import csv
    import datetime
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = output or os.path.join(config.OUTPUT_DIR, f"leads_{ts}.csv")
    with open(filepath, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=[
            "name", "website", "phone", "address", "city",
            "category", "rating", "review_count", "source",
            "gbp_url", "yelp_url", "notes",
        ])
        writer.writeheader()
        for lead in leads:
            writer.writerow({
                "name": lead.name,
                "website": lead.website,
                "phone": lead.phone,
                "address": lead.address,
                "city": lead.city,
                "category": lead.category,
                "rating": lead.rating,
                "review_count": lead.review_count,
                "source": lead.source,
                "gbp_url": lead.gbp_url,
                "yelp_url": lead.yelp_url,
                "notes": lead.notes,
            })
    click.echo(f"Leads saved to: {Fore.YELLOW}{filepath}{Style.RESET_ALL}\n")


# ── Audit command ─────────────────────────────────────────────────────────────

@cli.command()
@click.argument("input_file", required=False)
@click.option("--url", default=None, help="Audit a single URL")
@click.option("--output", default=None, help="Output CSV filepath")
@click.option("--priority", default=None, type=click.Choice(["A", "B", "C"]), help="Filter output by priority tier")
@click.option("--check-nav", is_flag=True, default=False, help="Also check navigation links (slower)")
@click.option("--top", default=20, show_default=True, help="Number of results to show in table")
def audit_cmd(input_file, url, output, priority, check_nav, top):
    """
    Stage 3 — Audit websites from a CSV/TXT file or a single URL.

    INPUT_FILE can be:
      • A CSV exported by the 'prospect' command (has 'website' column)
      • A plain-text file with one URL per line
    """
    leads: list[BusinessLead] = []

    if url:
        leads = [BusinessLead(name="", website=url, source="manual")]
    elif input_file:
        path = Path(input_file)
        if not path.exists():
            click.echo(f"{Fore.RED}File not found: {input_file}{Style.RESET_ALL}")
            sys.exit(1)
        if path.suffix.lower() == ".csv":
            leads = prospect_from_csv(str(path))
        else:
            leads = prospect_from_txt(str(path))
    else:
        click.echo("Provide --url or an input file. Run 'python main.py audit --help' for usage.")
        sys.exit(1)

    # Filter to leads with websites
    auditable = [l for l in leads if l.website]
    click.echo(f"\n{Fore.CYAN}[siteCp] Auditing {len(auditable)} sites...{Style.RESET_ALL}\n")

    results: list[ScoredResult] = []
    for lead in tqdm(auditable, desc="Auditing", unit="site"):
        ar = audit(lead.website, check_nav_links=check_nav)
        sr = build_scored_result(ar, lead)
        results.append(sr)
        time.sleep(config.REQUEST_DELAY)

    # Display
    print_summary(results)
    print_table(results, top_n=top, priority_filter=priority)

    # Export
    filepath = export_csv(results, output, priority_filter=priority)
    click.echo(f"\nFull results saved to: {Fore.YELLOW}{filepath}{Style.RESET_ALL}")


# ── Pipeline command (prospect + audit + export) ──────────────────────────────

@cli.command()
@click.option("--city", default=None, help="Target city")
@click.option("--state", default=None, help="Target state")
@click.option("--verticals", default=None, help="Comma-separated verticals")
@click.option("--sources", default="yelp,google_maps,yellow_pages", show_default=True)
@click.option("--max-results", default=None, type=int)
@click.option("--check-nav", is_flag=True, default=False)
@click.option("--priority", default=None, type=click.Choice(["A", "B", "C"]))
@click.option("--top", default=20, show_default=True)
def pipeline(city, state, verticals, sources, max_results, check_nav, priority, top):
    """
    Stages 2 + 3 + export — prospect, audit, and export in one shot.

    This is the primary weekly workflow command from the strategy.
    """
    city = city or config.TARGET_CITY
    state = state or config.TARGET_STATE
    vertical_list = [v.strip() for v in verticals.split(",")] if verticals else None
    source_list = [s.strip() for s in sources.split(",")]

    click.echo(f"\n{Fore.CYAN}{'='*55}{Style.RESET_ALL}")
    click.echo(f"{Fore.CYAN}  siteCp Pipeline — {city}{Style.RESET_ALL}")
    click.echo(f"{Fore.CYAN}{'='*55}{Style.RESET_ALL}\n")

    # Stage 2: Prospect
    click.echo(f"{Fore.YELLOW}Stage 2: Prospecting...{Style.RESET_ALL}")
    leads = prospect_all(
        verticals=vertical_list,
        city=city,
        state=state,
        max_per_source=max_results,
        sources=source_list,
    )
    auditable = [l for l in leads if l.website]
    click.echo(f"  → {len(auditable)} sites to audit\n")

    # Stage 3: Audit
    click.echo(f"{Fore.YELLOW}Stage 3: Auditing...{Style.RESET_ALL}")
    results: list[ScoredResult] = []
    for lead in tqdm(auditable, desc="Auditing", unit="site"):
        ar = audit(lead.website, check_nav_links=check_nav)
        sr = build_scored_result(ar, lead)
        results.append(sr)
        time.sleep(config.REQUEST_DELAY)

    # Summary + table
    print_summary(results)
    print_table(results, top_n=top, priority_filter=priority)

    # Export full results
    full_csv = export_csv(results)
    click.echo(f"\nFull results : {Fore.YELLOW}{full_csv}{Style.RESET_ALL}")

    # Export Priority A only
    if any(r.priority == "A" for r in results):
        a_csv = export_csv(results, priority_filter="A")
        click.echo(f"Priority A   : {Fore.RED}{a_csv}{Style.RESET_ALL}")

    # Export verification checklist (Stage 4)
    checklist = export_verification_checklist(results, top_n=50)
    click.echo(f"Verification : {Fore.GREEN}{checklist}{Style.RESET_ALL}\n")


# ── Verify command ────────────────────────────────────────────────────────────

@cli.command()
@click.argument("audit_csv")
@click.option("--top", default=50, show_default=True, help="Top N prospects to include")
@click.option("--output", default=None)
def verify(audit_csv, top, output):
    """
    Stage 4 — Export manual verification checklist from an existing audit CSV.

    AUDIT_CSV is a CSV previously generated by the 'audit' or 'pipeline' command.
    """
    from src.exporter import _CSV_FIELDS
    import csv as _csv

    if not Path(audit_csv).exists():
        click.echo(f"{Fore.RED}File not found: {audit_csv}{Style.RESET_ALL}")
        sys.exit(1)

    results: list[ScoredResult] = []
    with open(audit_csv, newline="", encoding="utf-8") as fh:
        reader = _csv.DictReader(fh)
        for row in reader:
            sr = ScoredResult(
                url=row.get("url", ""),
                name=row.get("name", ""),
                phone=row.get("phone", ""),
                city=row.get("city", ""),
                category=row.get("category", ""),
                priority=row.get("priority", "C"),
                score=int(row.get("score", 0) or 0),
                notes=row.get("notes", ""),
            )
            sr.top_issues = [
                row.get("top_issue_1", ""),
                row.get("top_issue_2", ""),
                row.get("top_issue_3", ""),
            ]
            results.append(sr)

    filepath = export_verification_checklist(results, output, top_n=top)
    click.echo(f"\nVerification checklist saved to: {Fore.GREEN}{filepath}{Style.RESET_ALL}\n")


# ── Monitor command ───────────────────────────────────────────────────────────

@cli.command()
@click.option("--city", default=None)
@click.option("--state", default=None)
@click.option("--verticals", default=None)
@click.option("--sources", default="yelp,yellow_pages", show_default=True)
@click.option(
    "--interval",
    default=config.MONITOR_INTERVAL_HOURS,
    show_default=True,
    help="Hours between checks",
)
@click.option("--once", is_flag=True, default=False, help="Run one check then exit")
@click.option(
    "--alert-feeds",
    default=None,
    help="Comma-separated Google Alert RSS feed URLs",
)
@click.option("--snapshot-tag", default="default", show_default=True)
def monitor(city, state, verticals, sources, interval, once, alert_feeds, snapshot_tag):
    """Stage 6 — Continuously monitor for new business opportunities."""
    vertical_list = [v.strip() for v in verticals.split(",")] if verticals else None
    source_list = [s.strip() for s in sources.split(",")]
    feeds = [f.strip() for f in alert_feeds.split(",")] if alert_feeds else []

    if once:
        new_leads = check_new_businesses(
            verticals=vertical_list,
            city=city,
            state=state,
            snapshot_tag=snapshot_tag,
            sources=source_list,
        )
        alert_items = monitor_google_alerts(feeds) if feeds else []
        digest_path = generate_digest(new_leads, alert_items)
        click.echo(f"\nDigest saved to: {Fore.YELLOW}{digest_path}{Style.RESET_ALL}\n")
    else:
        start_scheduler(
            interval_hours=interval,
            verticals=vertical_list,
            city=city,
            state=state,
            alert_feeds=feeds,
            snapshot_tag=snapshot_tag,
            sources=source_list,
        )


# ── Templates command ─────────────────────────────────────────────────────────

@cli.command()
@click.option(
    "--type",
    "template_type",
    default="email",
    type=click.Choice(["email", "call"]),
    show_default=True,
)
def templates(template_type):
    """Stage 5 — Display outreach templates (email or cold call script)."""
    base = Path(__file__).parent / "templates"
    target = base / ("outreach_email.txt" if template_type == "email" else "cold_call_script.txt")
    if not target.exists():
        click.echo(f"{Fore.RED}Template file not found: {target}{Style.RESET_ALL}")
        sys.exit(1)
    click.echo_via_pager(target.read_text(encoding="utf-8"))


# ── Quick single-URL check ────────────────────────────────────────────────────

@cli.command()
@click.argument("url")
def check(url):
    """Quickly audit a single URL and print the result."""
    click.echo(f"\n{Fore.CYAN}Auditing: {url}{Style.RESET_ALL}")
    ar = audit(url, check_nav_links=True)
    sr = build_scored_result(ar)

    click.echo(f"\n{'─'*55}")
    click.echo(f"  URL       : {ar.final_url or ar.url}")
    click.echo(f"  Reachable : {'Yes' if ar.reachable else Fore.RED + 'No' + Style.RESET_ALL}")
    if not ar.reachable:
        click.echo(f"  Error     : {ar.error}")
        return

    tier_colour = Fore.RED if sr.priority == "A" else (Fore.YELLOW if sr.priority == "B" else Fore.WHITE)
    click.echo(f"  Score     : {sr.score}")
    click.echo(f"  Priority  : {tier_colour}{sr.priority}{Style.RESET_ALL}")
    click.echo(f"\n  Issues found:")
    for sig, present in ar.signals.items():
        if not present:
            continue
        weight_info = config.SCORING_WEIGHTS.get(sig)
        if weight_info:
            pts, desc = weight_info
            click.echo(f"    [{pts:>2} pts]  {desc}")

    click.echo(f"\n  Raw data:")
    for k, v in ar.raw.items():
        if v not in (None, "", [], -1):
            click.echo(f"    {k}: {v}")
    click.echo(f"{'─'*55}\n")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cli()
