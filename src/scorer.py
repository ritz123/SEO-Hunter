"""
Scorer — Stage 3 scoring model from the strategy.

Takes an AuditResult and computes:
  - total score
  - priority tier (A / B / C)
  - top issues list (sorted by weight descending)
"""

from __future__ import annotations

from dataclasses import dataclass

import config
from src.auditor import AuditResult


@dataclass
class ScoredResult:
    url: str
    name: str = ""
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

    # Audit outcomes
    reachable: bool = True
    score: int = 0
    priority: str = "C"
    top_issues: list[str] = None   # type: ignore[assignment]
    signals: dict[str, bool] = None  # type: ignore[assignment]
    raw: dict = None  # type: ignore[assignment]
    audit_error: str = ""

    def __post_init__(self) -> None:
        if self.top_issues is None:
            self.top_issues = []
        if self.signals is None:
            self.signals = {}
        if self.raw is None:
            self.raw = {}


def score(audit_result: AuditResult) -> tuple[int, str, list[str]]:
    """
    Compute (total_score, priority_tier, top_issues) from an AuditResult.

    Priority tiers (from strategy):
      A  → score >= PRIORITY_A_THRESHOLD   (act first)
      B  → score >= PRIORITY_B_THRESHOLD   (secondary pipeline)
      C  → score <  PRIORITY_B_THRESHOLD   (lower priority)
    """
    total = 0
    issues: list[tuple[int, str]] = []  # (points, description)

    for signal_key, is_present in audit_result.signals.items():
        if not is_present:
            continue
        weight_info = config.SCORING_WEIGHTS.get(signal_key)
        if weight_info is None:
            continue
        points, description = weight_info
        total += points
        issues.append((points, description))

    # Sort issues by severity descending
    issues.sort(key=lambda x: x[0], reverse=True)
    top_issues = [desc for _, desc in issues[:5]]

    if total >= config.PRIORITY_A_THRESHOLD:
        tier = "A"
    elif total >= config.PRIORITY_B_THRESHOLD:
        tier = "B"
    else:
        tier = "C"

    return total, tier, top_issues


def build_scored_result(
    audit_result: AuditResult,
    lead=None,  # BusinessLead | None
) -> ScoredResult:
    """Combine an AuditResult with its source BusinessLead into a ScoredResult."""
    total, tier, top_issues = score(audit_result)

    sr = ScoredResult(
        url=audit_result.final_url or audit_result.url,
        reachable=audit_result.reachable,
        score=total,
        priority=tier,
        top_issues=top_issues,
        signals=audit_result.signals,
        raw=audit_result.raw,
        audit_error=audit_result.error,
    )

    if lead is not None:
        sr.name = lead.name
        sr.phone = lead.phone
        sr.address = lead.address
        sr.city = lead.city
        sr.category = lead.category
        sr.rating = lead.rating
        sr.review_count = lead.review_count
        sr.source = lead.source
        sr.gbp_url = lead.gbp_url
        sr.yelp_url = lead.yelp_url
        sr.notes = lead.notes

    return sr


def summary_stats(results: list[ScoredResult]) -> dict:
    """Return summary statistics across all scored results."""
    total = len(results)
    if total == 0:
        return {}
    a = sum(1 for r in results if r.priority == "A")
    b = sum(1 for r in results if r.priority == "B")
    c = sum(1 for r in results if r.priority == "C")
    unreachable = sum(1 for r in results if not r.reachable)
    avg_score = sum(r.score for r in results) / total

    signal_counts: dict[str, int] = {}
    for r in results:
        for sig, val in r.signals.items():
            if val:
                signal_counts[sig] = signal_counts.get(sig, 0) + 1

    most_common = sorted(signal_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "total": total,
        "priority_a": a,
        "priority_b": b,
        "priority_c": c,
        "unreachable": unreachable,
        "avg_score": round(avg_score, 1),
        "most_common_signals": most_common,
    }
