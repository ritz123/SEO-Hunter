"""
Database layer — SQLAlchemy models and session management.

Tables:
  localities     — a searched area (city/lat-lng + category + radius)
  businesses     — individual businesses discovered in a locality
  audit_results  — latest SEO audit outcome for a business (1-per-business)
  audit_history  — every past audit run for a business (append-only)
  scrape_jobs    — tracks the progress of a scrape+audit run
"""

from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

import config


# ── Engine + session ──────────────────────────────────────────────────────────

engine = create_engine(
    config.DB_URL,
    connect_args={"check_same_thread": False} if "sqlite" in config.DB_URL else {},
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    """FastAPI dependency — yields a DB session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Base ──────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Models ────────────────────────────────────────────────────────────────────

class Locality(Base):
    __tablename__ = "localities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    radius_km = Column(Integer, default=5)
    category = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    businesses = relationship("Business", back_populates="locality", cascade="all, delete-orphan")
    jobs = relationship("ScrapeJob", back_populates="locality", cascade="all, delete-orphan")

    @property
    def business_count(self) -> int:
        return len(self.businesses)

    @property
    def audited_count(self) -> int:
        return sum(1 for b in self.businesses if b.audit_result is not None)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "lat": self.lat,
            "lng": self.lng,
            "radius_km": self.radius_km,
            "category": self.category,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "business_count": len(self.businesses),
            "audited_count": sum(1 for b in self.businesses if b.audit_result is not None),
        }


class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    locality_id = Column(Integer, ForeignKey("localities.id"), nullable=True, index=True)
    name = Column(String(255), nullable=True)
    website = Column(String(1024), nullable=True)
    phone = Column(String(64), nullable=True)
    address = Column(Text, nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    category = Column(String(255), nullable=True)
    rating = Column(Float, nullable=True)
    review_count = Column(Integer, nullable=True)
    source = Column(String(64), nullable=True)
    email = Column(String(255), nullable=True)
    gbp_url = Column(String(1024), nullable=True)
    yelp_url = Column(String(1024), nullable=True)
    apify_id = Column(String(255), nullable=True, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    locality = relationship("Locality", back_populates="businesses")
    audit_result = relationship("AuditResult", back_populates="business", uselist=False, cascade="all, delete-orphan")
    audit_history = relationship("AuditHistory", back_populates="business", cascade="all, delete-orphan", order_by="AuditHistory.audited_at.desc()")

    def to_dict(self, include_audit: bool = True) -> dict:
        d = {
            "id": self.id,
            "locality_id": self.locality_id,
            "name": self.name,
            "website": self.website,
            "phone": self.phone,
            "address": self.address,
            "lat": self.lat,
            "lng": self.lng,
            "category": self.category,
            "rating": self.rating,
            "review_count": self.review_count,
            "source": self.source,
            "gbp_url": self.gbp_url,
            "email": self.email,
            "yelp_url": self.yelp_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "contact_score": sum([
                bool(self.phone),
                bool(self.email),
                bool(self.address),
                bool(self.lat and self.lng),
            ]),
        }
        if include_audit and self.audit_result:
            d["audit"] = self.audit_result.to_dict()
        else:
            d["audit"] = None
        return d


class AuditResult(Base):
    __tablename__ = "audit_results"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, unique=True, index=True)
    score = Column(Integer, default=0)
    priority = Column(String(1), default="C")   # A / B / C
    reachable = Column(Boolean, default=True)
    signals = Column(Text, nullable=True)        # JSON dict
    raw = Column(Text, nullable=True)            # JSON dict
    top_issues = Column(Text, nullable=True)     # JSON list
    audit_error = Column(Text, nullable=True)
    audited_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="audit_result")

    def signals_dict(self) -> dict:
        return json.loads(self.signals) if self.signals else {}

    def raw_dict(self) -> dict:
        return json.loads(self.raw) if self.raw else {}

    def issues_list(self) -> list[str]:
        return json.loads(self.top_issues) if self.top_issues else []

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "business_id": self.business_id,
            "score": self.score,
            "priority": self.priority,
            "reachable": self.reachable,
            "signals": self.signals_dict(),
            "raw": self.raw_dict(),
            "top_issues": self.issues_list(),
            "audit_error": self.audit_error,
            "audited_at": self.audited_at.isoformat() if self.audited_at else None,
        }


class AuditHistory(Base):
    """
    Append-only log of every audit run for a business.
    Unlike AuditResult (which is overwritten), this grows forever so you can
    track how a site's SEO health changes over time.
    """
    __tablename__ = "audit_history"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    score = Column(Integer, default=0)
    priority = Column(String(1), default="C")
    reachable = Column(Boolean, default=True)
    signals = Column(Text, nullable=True)       # JSON dict
    top_issues = Column(Text, nullable=True)    # JSON list
    audit_error = Column(Text, nullable=True)
    audited_at = Column(DateTime, default=datetime.utcnow)

    business = relationship("Business", back_populates="audit_history")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "business_id": self.business_id,
            "score": self.score,
            "priority": self.priority,
            "reachable": self.reachable,
            "signals": json.loads(self.signals) if self.signals else {},
            "top_issues": json.loads(self.top_issues) if self.top_issues else [],
            "audit_error": self.audit_error,
            "audited_at": self.audited_at.isoformat() if self.audited_at else None,
        }


class Category(Base):
    """User-managed list of business categories for discovery searches."""
    __tablename__ = "categories"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(128), nullable=False, unique=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "name":       self.name,
            "is_default": self.is_default,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ScrapeJob(Base):
    __tablename__ = "scrape_jobs"

    id = Column(Integer, primary_key=True, index=True)
    locality_id = Column(Integer, ForeignKey("localities.id"), nullable=False, index=True)
    status = Column(String(16), default="pending")  # pending | scraping | auditing | done | failed
    apify_run_id = Column(String(255), nullable=True)
    businesses_found = Column(Integer, default=0)
    businesses_audited = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)

    locality = relationship("Locality", back_populates="jobs")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "locality_id": self.locality_id,
            "status": self.status,
            "apify_run_id": self.apify_run_id,
            "businesses_found": self.businesses_found,
            "businesses_audited": self.businesses_audited,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error": self.error,
        }


# ── Init ──────────────────────────────────────────────────────────────────────

def init_db() -> None:
    """Create all tables. Safe to call multiple times (uses CREATE IF NOT EXISTS)."""
    Base.metadata.create_all(bind=engine)
