"""
Exporter — Stage 3 & 4 of the strategy.

Exports ScoredResults to:
  - CSV (primary, CRM-ready)
  - Console table (quick overview)
  - Verification checklist template (Stage 4)
"""

from __future__ import annotations

import csv
import datetime
import os
from pathlib import Path

from tabulate import tabulate

import config
from src.scorer import ScoredResult, summary_stats


# ── CSV export ────────────────────────────────────────────────────────────────

_CSV_FIELDS = [
    "priority",
    "score",
    "name",
    "url",
    "phone",
    "address",
    "city",
    "category",
    "rating",
    "review_count",
    "source",
    "gbp_url",
    "yelp_url",
    "reachable",
    "audit_error",
    "top_issue_1",
    "top_issue_2",
    "top_issue_3",
    "pagespeed_score",
    "copyright_year",
    "wayback_last_snapshot",
    "notes",
    # Individual signal columns for filtering in Excel / Sheets
    "sig_no_https",
    "sig_ssl_invalid",
    "sig_fails_mobile",
    "sig_no_viewport",
    "sig_pagespeed_low",
    "sig_copyright_old",
    "sig_deprecated_tech",
    "sig_missing_meta_desc",
    "sig_missing_title",
    "sig_no_structured_data",
    "sig_wayback_stale",
    "sig_broken_nav",
    "sig_no_social",
    "sig_no_cta",
    "sig_stale_blog",
    "sig_broken_home_page",
    "sig_not_indexed",
    # Manual verification columns (left blank for human fill-in)
    "manual_mobile_check",
    "manual_indexed",
    "manual_decision_maker",
    "manual_outreach_sent",
    "manual_outcome",
]


def _row(sr: ScoredResult) -> dict:
    issues = sr.top_issues + ["", "", ""]
    sigs = sr.signals
    raw = sr.raw
    return {
        "priority": sr.priority,
        "score": sr.score,
        "name": sr.name,
        "url": sr.url,
        "phone": sr.phone,
        "address": sr.address,
        "city": sr.city,
        "category": sr.category,
        "rating": sr.rating,
        "review_count": sr.review_count,
        "source": sr.source,
        "gbp_url": sr.gbp_url,
        "yelp_url": sr.yelp_url,
        "reachable": sr.reachable,
        "audit_error": sr.audit_error,
        "top_issue_1": issues[0],
        "top_issue_2": issues[1],
        "top_issue_3": issues[2],
        "pagespeed_score": raw.get("pagespeed_score", ""),
        "copyright_year": raw.get("copyright_year", ""),
        "wayback_last_snapshot": raw.get("wayback_last_snapshot", ""),
        "notes": sr.notes,
        "sig_no_https": sigs.get("no_https", ""),
        "sig_ssl_invalid": sigs.get("ssl_invalid_or_expired", ""),
        "sig_fails_mobile": sigs.get("fails_mobile_friendly", ""),
        "sig_no_viewport": sigs.get("no_meta_viewport", ""),
        "sig_pagespeed_low": sigs.get("pagespeed_score_low", ""),
        "sig_copyright_old": sigs.get("copyright_year_old", ""),
        "sig_deprecated_tech": sigs.get("deprecated_tech", ""),
        "sig_missing_meta_desc": sigs.get("missing_meta_description", ""),
        "sig_missing_title": sigs.get("missing_title", ""),
        "sig_no_structured_data": sigs.get("no_structured_data", ""),
        "sig_wayback_stale": sigs.get("wayback_stale", ""),
        "sig_broken_nav": sigs.get("broken_nav_links", ""),
        "sig_no_social": sigs.get("no_social_links", ""),
        "sig_no_cta": sigs.get("no_cta", ""),
        "sig_stale_blog": sigs.get("stale_blog", ""),
        "sig_broken_home_page": sigs.get("broken_home_page", ""),
        "sig_not_indexed": sigs.get("not_indexed", ""),
        # Manual columns left blank
        "manual_mobile_check": "",
        "manual_indexed": "",
        "manual_decision_maker": "",
        "manual_outreach_sent": "",
        "manual_outcome": "",
    }


def export_csv(
    results: list[ScoredResult],
    filepath: str | None = None,
    priority_filter: str | None = None,
) -> str:
    """
    Write results to CSV. Returns the output filepath.

    priority_filter: if set to "A" or "B", only export that tier.
    """
    os.makedirs(config.OUTPUT_DIR, exist_ok=True)

    if filepath is None:
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        tag = f"_priority{priority_filter}" if priority_filter else ""
        filepath = os.path.join(config.OUTPUT_DIR, f"prospects{tag}_{ts}.csv")

    filtered = results
    if priority_filter:
        filtered = [r for r in results if r.priority == priority_filter]

    # Sort: Priority A first, then by score descending
    priority_order = {"A": 0, "B": 1, "C": 2}
    filtered.sort(key=lambda r: (priority_order.get(r.priority, 9), -r.score))

    with open(filepath, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=_CSV_FIELDS)
        writer.writeheader()
        for sr in filtered:
            writer.writerow(_row(sr))

    return filepath


# ── Console table ─────────────────────────────────────────────────────────────

def print_table(
    results: list[ScoredResult],
    top_n: int = 20,
    priority_filter: str | None = None,
) -> None:
    """Print a colour-coded summary table to stdout."""
    from colorama import Fore, Style, init
    init(autoreset=True)

    filtered = results
    if priority_filter:
        filtered = [r for r in results if r.priority == priority_filter]

    priority_order = {"A": 0, "B": 1, "C": 2}
    filtered.sort(key=lambda r: (priority_order.get(r.priority, 9), -r.score))
    filtered = filtered[:top_n]

    rows = []
    for r in filtered:
        colour = Fore.RED if r.priority == "A" else (Fore.YELLOW if r.priority == "B" else Fore.WHITE)
        rows.append([
            f"{colour}{r.priority}{Style.RESET_ALL}",
            r.score,
            (r.name or r.url)[:35],
            r.city,
            r.category,
            r.top_issues[0][:45] if r.top_issues else "",
        ])

    print(
        tabulate(
            rows,
            headers=["Tier", "Score", "Business", "City", "Category", "Top Issue"],
            tablefmt="rounded_outline",
        )
    )


# ── Summary stats ─────────────────────────────────────────────────────────────

def print_summary(results: list[ScoredResult]) -> None:
    stats = summary_stats(results)
    if not stats:
        print("No results to summarise.")
        return

    print("\n── Audit Summary ──────────────────────────────────────────────")
    print(f"  Total prospects analysed : {stats['total']}")
    print(f"  Priority A (score ≥ {config.PRIORITY_A_THRESHOLD})   : {stats['priority_a']}")
    print(f"  Priority B (score ≥ {config.PRIORITY_B_THRESHOLD})   : {stats['priority_b']}")
    print(f"  Priority C (low score)   : {stats['priority_c']}")
    print(f"  Unreachable sites        : {stats['unreachable']}")
    print(f"  Average audit score      : {stats['avg_score']}")
    print("\n  Most common issues found:")
    for sig, count in stats["most_common_signals"]:
        desc = config.SCORING_WEIGHTS.get(sig, ("", sig))[1]
        print(f"    [{count:>3}x]  {desc}")
    print("───────────────────────────────────────────────────────────────\n")


# ── Verification checklist template ──────────────────────────────────────────

def export_verification_checklist(
    results: list[ScoredResult],
    filepath: str | None = None,
    top_n: int = 50,
) -> str:
    """
    Export a Stage 4 manual verification checklist for the top-N prospects.
    Produces a CSV with audit-pre-filled columns and blank manual columns.
    """
    priority_order = {"A": 0, "B": 1, "C": 2}
    sorted_results = sorted(
        results, key=lambda r: (priority_order.get(r.priority, 9), -r.score)
    )[:top_n]

    os.makedirs(config.OUTPUT_DIR, exist_ok=True)
    if filepath is None:
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = os.path.join(config.OUTPUT_DIR, f"verification_checklist_{ts}.csv")

    checklist_fields = [
        "priority", "score", "name", "url", "phone", "city", "category",
        "top_issue_1", "top_issue_2", "top_issue_3",
        # Stage 4 manual checks
        "✓ Renders on mobile?",
        "✓ Copyright year in footer?",
        "✓ site:domain.com indexed?",
        "✓ GBP URL matches site?",
        "✓ Content fresh (About/Services)?",
        "Decision maker name",
        "Decision maker contact",
        "Outreach priority confirmed (A/B/C)",
        "Notes",
    ]

    with open(filepath, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=checklist_fields, extrasaction="ignore")
        writer.writeheader()
        for sr in sorted_results:
            issues = sr.top_issues + ["", "", ""]
            writer.writerow({
                "priority": sr.priority,
                "score": sr.score,
                "name": sr.name,
                "url": sr.url,
                "phone": sr.phone,
                "city": sr.city,
                "category": sr.category,
                "top_issue_1": issues[0],
                "top_issue_2": issues[1],
                "top_issue_3": issues[2],
                "✓ Renders on mobile?": "",
                "✓ Copyright year in footer?": "",
                "✓ site:domain.com indexed?": "",
                "✓ GBP URL matches site?": "",
                "✓ Content fresh (About/Services)?": "",
                "Decision maker name": "",
                "Decision maker contact": "",
                "Outreach priority confirmed (A/B/C)": sr.priority,
                "Notes": sr.notes,
            })

    return filepath
