"""
FastAPI web application — serves the map frontend and exposes the REST API.
Map layer: Leaflet.js + OpenStreetMap (no Google API keys required).
Geocoding: Nominatim (free, OSM-based).
Business discovery: Apify → OSM Overpass → Yellow Pages (fallback chain).

Routes:
  GET  /                            → map frontend (index.html)
  GET  /static/*                    → CSS / JS / assets

  GET  /api/geocode                 → Nominatim geocoding (city → lat/lng)
  GET  /api/geocode/suggest         → Nominatim autocomplete suggestions
  POST /api/search                  → start a scrape+audit job for a locality
  GET  /api/jobs/{job_id}           → poll job progress
  GET  /api/localities              → list all saved localities
  GET  /api/localities/{id}         → locality detail + business list
  GET  /api/businesses              → browse all businesses (filterable)
  GET  /api/businesses/{id}         → single business + audit detail
  POST /api/businesses/{id}/audit   → re-audit one business
  DELETE /api/localities/{id}       → delete a locality and its data
  GET  /api/stats                   → overall summary stats
  GET  /api/config                  → public config (feature flags)

Run:
  uv run python -m uvicorn app:app --reload --port 8000
"""

from __future__ import annotations

import json
import time
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import config
from src.database import (
    AuditHistory,
    AuditResult,
    Business,
    Locality,
    ScrapeJob,
    SessionLocal,
    get_db,
    init_db,
)
from src.auditor import audit as run_audit, AuditResult as AuditResultData
from src.scorer import build_scored_result
from src.apify_scraper import (
    ApifyBusiness,
    scrape_google_maps,
)
from src.prospector import (
    prospect_yellow_pages,
    prospect_yelp,
    BusinessLead,
)
from src.osm_prospector import (
    geocode,
    geocode_suggestions,
    reverse_geocode,
    search_overpass,
    OSMBusiness,
)

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="siteCp",
    description="Find local businesses with outdated websites",
    version="0.1.0",
)

STATIC_DIR = Path(__file__).parent / "static"

# Mount static files
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.on_event("startup")
def startup() -> None:
    init_db()
    _backfill_audit_history()


def _backfill_audit_history() -> None:
    """
    Runs on every startup:
      1. Deduplicates audit_history — keeps the lowest-id row per
         (business_id, audited_at) pair and deletes the rest.
      2. Backfills audit_results rows that have no matching history entry
         (matched by business_id AND audited_at) so re-runs are idempotent.
    """
    db = SessionLocal()
    try:
        # ── Step 1: remove duplicates ─────────────────────────────────────
        # Build set of (business_id, audited_at) → min(id) to keep
        from sqlalchemy import func
        keep_ids = {
            row[2]
            for row in db.query(
                AuditHistory.business_id,
                AuditHistory.audited_at,
                func.min(AuditHistory.id),
            ).group_by(AuditHistory.business_id, AuditHistory.audited_at).all()
        }
        all_ids = {row[0] for row in db.query(AuditHistory.id).all()}
        stale   = all_ids - keep_ids
        if stale:
            db.query(AuditHistory).filter(AuditHistory.id.in_(stale)).delete(
                synchronize_session=False
            )
            db.commit()
            print(f"[startup] Removed {len(stale)} duplicate audit history rows.")

        # ── Step 2: backfill missing entries ──────────────────────────────
        # Index existing history as (business_id, audited_at) tuples
        existing = {
            (row[0], row[1])
            for row in db.query(AuditHistory.business_id, AuditHistory.audited_at).all()
        }
        backfilled = 0
        for ar in db.query(AuditResult).all():
            key = (ar.business_id, ar.audited_at)
            if key in existing:
                continue
            db.add(AuditHistory(
                business_id=ar.business_id,
                score=ar.score,
                priority=ar.priority,
                reachable=ar.reachable,
                signals=ar.signals,
                top_issues=ar.top_issues,
                audit_error=ar.audit_error,
                audited_at=ar.audited_at or datetime.utcnow(),
            ))
            backfilled += 1
        if backfilled:
            db.commit()
            print(f"[startup] Backfilled {backfilled} audit history entries.")
    except Exception as exc:
        print(f"[startup] Audit history maintenance error: {exc}")
    finally:
        db.close()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    locality_name: str = Field(..., description="City or neighbourhood name, e.g. 'Austin, TX'")
    lat: float | None = Field(None, description="Latitude (from Maps geocoding)")
    lng: float | None = Field(None, description="Longitude (from Maps geocoding)")
    radius_km: int = Field(5, ge=1, le=50)
    category: str = Field("restaurants", description="Business category / search term")
    max_results: int = Field(50, ge=1, le=500)
    use_apify: bool = Field(True, description="Use Apify; falls back to Yellow Pages if False or no token")


class ReauditRequest(BaseModel):
    check_nav: bool = False


# ── Background task: scrape + audit ──────────────────────────────────────────

def _upsert_business_from_apify(
    db: Session,
    item: ApifyBusiness,
    locality_id: int,
) -> Business:
    """Insert or update a Business row from an Apify result."""
    biz = None
    if item.apify_id:
        biz = db.query(Business).filter_by(apify_id=item.apify_id).first()
    if biz is None and item.name:
        biz = (
            db.query(Business)
            .filter_by(name=item.name, locality_id=locality_id)
            .first()
        )
    if biz is None:
        biz = Business(locality_id=locality_id)
        db.add(biz)

    biz.name = item.name
    biz.website = item.website
    biz.phone = item.phone
    biz.address = item.address
    biz.lat = item.lat
    biz.lng = item.lng
    biz.category = item.category
    biz.rating = item.rating
    biz.review_count = item.review_count
    biz.gbp_url = item.gbp_url
    biz.apify_id = item.apify_id or biz.apify_id
    biz.source = "apify"
    db.commit()
    db.refresh(biz)
    return biz


def _upsert_business_from_lead(
    db: Session,
    lead: BusinessLead,
    locality_id: int,
) -> Business:
    biz = None
    if lead.name:
        biz = (
            db.query(Business)
            .filter_by(name=lead.name, locality_id=locality_id)
            .first()
        )
    if biz is None:
        biz = Business(locality_id=locality_id)
        db.add(biz)

    biz.name = lead.name
    biz.website = lead.website
    biz.phone = lead.phone
    biz.address = lead.address
    biz.category = lead.category
    biz.rating = lead.rating
    biz.review_count = lead.review_count
    biz.gbp_url = lead.gbp_url
    biz.yelp_url = lead.yelp_url
    biz.source = lead.source
    db.commit()
    db.refresh(biz)
    return biz


def _audit_and_save(db: Session, biz: Business) -> None:
    """Run SEO audit on a business and persist the result."""
    if not biz.website:
        return
    try:
        ar: AuditResultData = run_audit(biz.website, check_nav_links=False)
        sr = build_scored_result(ar)
    except Exception as exc:
        sr_err = type("SR", (), {
            "score": 0, "priority": "C", "reachable": False,
            "signals": {}, "raw": {}, "top_issues": [],
            "audit_error": str(exc),
        })()
        sr = sr_err  # type: ignore[assignment]

    existing = db.query(AuditResult).filter_by(business_id=biz.id).first()
    if existing is None:
        existing = AuditResult(business_id=biz.id)
        db.add(existing)

    now = datetime.utcnow()
    existing.score = sr.score
    existing.priority = sr.priority
    existing.reachable = sr.reachable
    existing.signals = json.dumps(sr.signals)
    existing.raw = json.dumps(sr.raw)
    existing.top_issues = json.dumps(sr.top_issues)
    existing.audit_error = sr.audit_error
    existing.audited_at = now

    # Append an immutable history entry for trend tracking
    history_entry = AuditHistory(
        business_id=biz.id,
        score=sr.score,
        priority=sr.priority,
        reachable=sr.reachable,
        signals=json.dumps(sr.signals),
        top_issues=json.dumps(sr.top_issues),
        audit_error=sr.audit_error,
        audited_at=now,
    )
    db.add(history_entry)
    db.commit()


def _run_scrape_and_audit(job_id: int, request: SearchRequest) -> None:
    """
    Long-running background task:
      1. Scrape businesses (Apify or fallback)
      2. Save to DB
      3. Audit each site
      4. Mark job done
    """
    db = SessionLocal()
    try:
        job = db.query(ScrapeJob).get(job_id)
        if not job:
            return
        job.status = "scraping"
        job.started_at = datetime.utcnow()
        db.commit()

        locality = db.query(Locality).get(job.locality_id)
        businesses_to_audit: list[Business] = []

        # ── Step 1: Scrape ─────────────────────────────────────────────────
        use_apify = request.use_apify and bool(config.APIFY_API_TOKEN)

        if use_apify:
            try:
                items, run_id = scrape_google_maps(
                    search_term=request.category,
                    location=request.locality_name,
                    max_items=request.max_results,
                    lat=request.lat,
                    lng=request.lng,
                    radius_km=request.radius_km,
                )
                job.apify_run_id = run_id
                db.commit()

                for item in items:
                    biz = _upsert_business_from_apify(db, item, job.locality_id)
                    businesses_to_audit.append(biz)

            except Exception as exc:
                job.error = f"Apify error: {exc} — falling back to Yellow Pages"
                db.commit()
                use_apify = False  # fall through to fallback

        if not use_apify:
            try:
                # Priority: OSM Overpass (free) → Yellow Pages → Yelp
                osm_items: list[OSMBusiness] = []
                if request.lat and request.lng:
                    osm_items = search_overpass(
                        vertical=request.category,
                        lat=request.lat,
                        lng=request.lng,
                        radius_km=request.radius_km,
                        max_results=request.max_results,
                    )

                if osm_items:
                    for item in osm_items:
                        lead = BusinessLead(
                            name=item.name,
                            website=item.website,
                            phone=item.phone,
                            address=item.address,
                            city=request.locality_name,
                            category=item.category,
                            source="osm",
                        )
                        biz = _upsert_business_from_lead(db, lead, job.locality_id)
                        # Persist coordinates from OSM
                        if item.lat and item.lng:
                            biz.lat = item.lat
                            biz.lng = item.lng
                            db.commit()
                        businesses_to_audit.append(biz)
                else:
                    # Fallback to Yellow Pages scraper
                    leads = prospect_yellow_pages(
                        vertical=request.category,
                        city=request.locality_name,
                        max_results=request.max_results,
                    )
                    if not leads and config.YELP_API_KEY:
                        leads = prospect_yelp(
                            vertical=request.category,
                            city=request.locality_name,
                            max_results=request.max_results,
                        )
                    for lead in leads:
                        biz = _upsert_business_from_lead(db, lead, job.locality_id)
                        businesses_to_audit.append(biz)
            except Exception as exc:
                job.status = "failed"
                job.error = str(exc)
                job.completed_at = datetime.utcnow()
                db.commit()
                return

        job.businesses_found = len(businesses_to_audit)
        job.status = "auditing"
        db.commit()

        # ── Step 2: Audit ──────────────────────────────────────────────────
        for i, biz in enumerate(businesses_to_audit):
            _audit_and_save(db, biz)
            job.businesses_audited = i + 1
            db.commit()
            time.sleep(config.REQUEST_DELAY * 0.5)

        job.status = "done"
        job.completed_at = datetime.utcnow()
        db.commit()

    except Exception as exc:
        db.rollback()
        try:
            job = db.query(ScrapeJob).get(job_id)
            if job:
                job.status = "failed"
                job.error = str(exc)
                job.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


# ── Frontend routes ───────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def serve_index():
    index = STATIC_DIR / "index.html"
    if not index.exists():
        return JSONResponse({"error": "Frontend not found"}, status_code=404)
    return FileResponse(str(index))


# ── Config endpoint (public) ──────────────────────────────────────────────────

@app.get("/api/config")
def get_config():
    """Return non-secret config values the frontend needs."""
    return {
        "has_apify": bool(config.APIFY_API_TOKEN),
        "default_city": config.TARGET_CITY,
        "default_verticals": config.DEFAULT_VERTICALS[:8],
    }


# ── Nominatim geocoding endpoints ─────────────────────────────────────────────

@app.get("/api/geocode")
def geocode_city(q: str = Query(..., min_length=2)):
    """
    Geocode a city/address via Nominatim.
    Always returns 200; check the `found` field to see if geocoding succeeded.
    """
    result = geocode(q)
    if not result:
        return {"found": False, "lat": None, "lng": None, "display_name": q}
    return {
        "found": True,
        "lat": result.lat,
        "lng": result.lng,
        "display_name": result.display_name,
    }


@app.get("/api/geocode/suggest")
def geocode_suggest(q: str = Query(..., min_length=2), limit: int = Query(5, le=10)):
    """Return Nominatim autocomplete suggestions for a partial city name."""
    return geocode_suggestions(q, limit=limit)


@app.get("/api/geocode/reverse")
def geocode_reverse(lat: float = Query(...), lng: float = Query(...)):
    """
    Reverse-geocode a lat/lng to a place name via Nominatim.
    Always returns 200; check the `found` field.
    """
    result = reverse_geocode(lat, lng)
    if not result:
        return {"found": False, "lat": lat, "lng": lng, "display_name": f"{lat:.4f}, {lng:.4f}"}
    return {
        "found": True,
        "lat": result.lat,
        "lng": result.lng,
        "display_name": result.display_name,
    }


# ── Search / job routes ───────────────────────────────────────────────────────

@app.post("/api/search")
def start_search(
    req: SearchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Create a locality + scrape job and kick off the background pipeline."""
    locality = Locality(
        name=req.locality_name,
        lat=req.lat,
        lng=req.lng,
        radius_km=req.radius_km,
        category=req.category,
    )
    db.add(locality)
    db.flush()

    job = ScrapeJob(locality_id=locality.id)
    db.add(job)
    db.commit()
    db.refresh(locality)
    db.refresh(job)

    # Detach from session before handing to thread
    job_id = job.id
    locality_id = locality.id

    # Run in a thread so FastAPI doesn't wait
    thread = threading.Thread(
        target=_run_scrape_and_audit,
        args=(job_id, req),
        daemon=True,
    )
    thread.start()

    return {
        "job_id": job_id,
        "locality_id": locality_id,
        "message": "Search started",
    }


@app.get("/api/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    """Poll the status of a scrape+audit job."""
    job = db.query(ScrapeJob).get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.to_dict()


# ── Locality routes ───────────────────────────────────────────────────────────

@app.get("/api/localities")
def list_localities(db: Session = Depends(get_db)):
    localities = db.query(Locality).order_by(Locality.created_at.desc()).all()
    return [loc.to_dict() for loc in localities]


@app.get("/api/localities/{locality_id}")
def get_locality(locality_id: int, db: Session = Depends(get_db)):
    loc = db.query(Locality).get(locality_id)
    if not loc:
        raise HTTPException(404, "Locality not found")
    return {
        **loc.to_dict(),
        "latest_job": (
            db.query(ScrapeJob)
            .filter_by(locality_id=locality_id)
            .order_by(ScrapeJob.id.desc())
            .first()
            or {}
        ),
    }


@app.delete("/api/localities/{locality_id}")
def delete_locality(locality_id: int, db: Session = Depends(get_db)):
    loc = db.query(Locality).get(locality_id)
    if not loc:
        raise HTTPException(404, "Locality not found")
    db.delete(loc)
    db.commit()
    return {"deleted": locality_id}


# ── Business routes ───────────────────────────────────────────────────────────

@app.get("/api/businesses")
def list_businesses(
    locality_id: int | None = Query(None),
    priority: str | None = Query(None, pattern="^[ABC]$"),
    category: str | None = Query(None),
    has_website: bool | None = Query(None),
    limit: int = Query(200, le=1000),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    q = db.query(Business)
    if locality_id is not None:
        q = q.filter(Business.locality_id == locality_id)
    if has_website is True:
        q = q.filter(Business.website != None, Business.website != "")
    if has_website is False:
        q = q.filter((Business.website == None) | (Business.website == ""))
    if category:
        q = q.filter(Business.category.ilike(f"%{category}%"))
    if priority:
        q = q.join(AuditResult).filter(AuditResult.priority == priority)

    total = q.count()
    businesses = q.order_by(Business.id.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [b.to_dict() for b in businesses],
    }


@app.get("/api/businesses/{business_id}")
def get_business(business_id: int, db: Session = Depends(get_db)):
    biz = db.query(Business).get(business_id)
    if not biz:
        raise HTTPException(404, "Business not found")
    return biz.to_dict(include_audit=True)


@app.post("/api/businesses/{business_id}/audit")
def reaudit_business(
    business_id: int,
    req: ReauditRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    biz = db.query(Business).get(business_id)
    if not biz:
        raise HTTPException(404, "Business not found")
    if not biz.website:
        raise HTTPException(400, "Business has no website to audit")

    def _do_audit(biz_id: int) -> None:
        _db = SessionLocal()
        try:
            b = _db.query(Business).get(biz_id)
            if b:
                _audit_and_save(_db, b)
        finally:
            _db.close()

    background_tasks.add_task(_do_audit, business_id)
    return {"message": "Audit started", "business_id": business_id}


@app.get("/api/businesses/{business_id}/audits")
def get_audit_history(
    business_id: int,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    """Return the full audit history for a business, newest-first."""
    biz = db.query(Business).get(business_id)
    if not biz:
        raise HTTPException(404, "Business not found")
    rows = (
        db.query(AuditHistory)
        .filter_by(business_id=business_id)
        .order_by(AuditHistory.audited_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "business_id": business_id,
        "business_name": biz.name,
        "website": biz.website,
        "history": [r.to_dict() for r in rows],
    }


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total_businesses = db.query(Business).count()
    audited = db.query(AuditResult).count()
    priority_a = db.query(AuditResult).filter_by(priority="A").count()
    priority_b = db.query(AuditResult).filter_by(priority="B").count()
    priority_c = db.query(AuditResult).filter_by(priority="C").count()
    localities = db.query(Locality).count()
    return {
        "localities": localities,
        "total_businesses": total_businesses,
        "audited": audited,
        "priority_a": priority_a,
        "priority_b": priority_b,
        "priority_c": priority_c,
    }


@app.get("/api/audit-history")
def list_audit_history(
    limit: int = Query(200, le=1000),
    offset: int = Query(0, ge=0),
    priority: str | None = Query(None, pattern="^[ABC]$"),
    business_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    Paginated, filterable log of every audit run ever recorded.
    Joins with businesses to return the business name and website.
    """
    q = (
        db.query(AuditHistory, Business)
        .join(Business, AuditHistory.business_id == Business.id)
        .order_by(AuditHistory.audited_at.desc())
    )
    if priority:
        q = q.filter(AuditHistory.priority == priority)
    if business_id:
        q = q.filter(AuditHistory.business_id == business_id)

    total = q.count()
    rows  = q.offset(offset).limit(limit).all()

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [
            {
                **h.to_dict(),
                "business_name": b.name,
                "website": b.website,
                "locality_id": b.locality_id,
            }
            for h, b in rows
        ],
    }


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    total_businesses = db.query(Business).count()
    audited = db.query(AuditResult).count()
    priority_a = db.query(AuditResult).filter_by(priority="A").count()
    priority_b = db.query(AuditResult).filter_by(priority="B").count()
    priority_c = db.query(AuditResult).filter_by(priority="C").count()
    localities = db.query(Locality).count()
    total_audit_runs = db.query(AuditHistory).count()
    return {
        "localities": localities,
        "total_businesses": total_businesses,
        "audited": audited,
        "priority_a": priority_a,
        "priority_b": priority_b,
        "priority_c": priority_c,
        "total_audit_runs": total_audit_runs,
    }


# ── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=config.WEB_HOST, port=config.WEB_PORT, reload=True)
