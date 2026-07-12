# SEO Hunter

A web-based tool for discovering local businesses with outdated or insecure websites, auditing them automatically, and building a qualified outreach pipeline.

Built with **FastAPI** (Python backend), **React + Tailwind CSS** (frontend), **SQLite** (database), and **OpenStreetMap / Overpass API** (free, no API keys required).

---

## Features

- **Discover** — search for businesses by category and location using OpenStreetMap (Overpass API + Nominatim geocoding). Click on the map to set a search area.
- **Audit** — automated SEO and security audit covering 25+ signals per website.
- **Browse Clients** — priority-sorted card view of all audited businesses with contact completeness indicators.
- **Database** — searchable, sortable, paginated table of all records with CSV export.
- **Audit Reports** — detailed per-business report with categorised signal checklist, security findings, and a printable PDF-ready download.
- **Category Management** — add custom business categories and define synonyms/aliases (e.g. "realty" → also searches "real estate", "property", "estate agent").
- **Audit History** — every audit is stored; track a site's SEO health over time.
- **Contact Info** — phone, email (extracted from website), address, and geo-tag tracked per business with completeness indicators.

---

## Quick Start

### 1. Install Python dependencies

```bash
uv sync
```

`uv` creates the virtual environment and installs all packages from `uv.lock` automatically.

### 2. Install frontend dependencies (first time only)

```bash
cd frontend && npm install && cd ..
```

### 3. Configure (optional)

```bash
cp .env.example .env
# Edit .env if you want to set a default city, PageSpeed API key, etc.
```

### 4. Start the server

```bash
./run.sh
```

This builds the React frontend and starts the FastAPI server at **http://localhost:8000**.

**Other modes:**

```bash
./run.sh --no-build     # Skip React build (use existing static/ output)
./run.sh --dev          # Vite HMR on :5173 + API on :8000 (development)
./run.sh --port 8080    # Custom port
./run.sh --no-reload    # Disable uvicorn auto-reload
```

---

## Using the Web App

### Discover tab

1. Type a city or neighbourhood — Nominatim autocomplete will suggest locations.
2. Or click anywhere on the map to drop a pin.
3. Choose a business category (type freely or pick from the list).
4. Set the search radius and hit **Search & Audit**.
5. The job runs in the background — progress is shown in the header regardless of which tab you switch to.

### Clients tab

- Businesses are sorted by priority: **A** (most outdated) → **B** → **C**.
- Filter chips: Priority A/B/C, No Website, No Contact Info.
- Each card shows contact completeness dots: Phone · Email · Address · Geo-tag.
- Click any card to open the full audit report.

### Audit Report modal

- **Latest Report** — score ring, priority badge, top issues, full signal checklist grouped by category.
- **Business Info** — contact details, geo-tag with inline Leaflet map, links to Google Business / Yelp.
- **History** — every past audit with score and issue count.
- **Download Report** — generates a printable HTML report (opens in new tab, auto-triggers print dialog).
- **Re-audit Now** — re-runs the full audit and updates the database.

### Database tab

- Searchable, sortable table of all businesses.
- Filter by priority, website presence, or contact completeness.
- Export to CSV.

### Managing categories

In the Discover tab, click **Manage** next to the category field to:
- Add custom business categories.
- Define **aliases/synonyms** per category (e.g. `realty, property, estate agent` for "real estate") — all are searched simultaneously.
- Remove custom categories (default categories cannot be deleted).

---

## Audit Signals

### Security & HTTPS (high weight)

| Signal | Points |
|---|---|
| Exposed sensitive path (/.env, /.git, phpinfo.php…) | 4 |
| Home page unreachable (5xx / timeout / DNS) | 5 |
| No HTTPS | 3 |
| SSL invalid or expired | 3 |
| No HSTS header | 2 |
| No X-Frame-Options (clickjacking risk) | 2 |
| Mixed content (HTTP resources on HTTPS page) | 2 |
| No Content-Security-Policy | 1 |
| No X-Content-Type-Options | 1 |
| No Referrer-Policy | 1 |
| CMS / server version exposed | 1 |

### Mobile & Performance

| Signal | Points |
|---|---|
| Fails mobile-friendly test (no viewport) | 3 |
| No meta viewport tag | 2 |
| PageSpeed score < 50 | 2 |

### SEO Basics

| Signal | Points |
|---|---|
| Not indexed on Google | 2 |
| Missing title tag | 1 |
| Missing meta description | 1 |
| No structured data (JSON-LD / Microdata) | 1 |

### Content Freshness

| Signal | Points |
|---|---|
| Copyright year 2+ years old | 2 |
| Wayback Machine snapshot 2+ years old | 2 |
| Stale blog (most recent post 2+ years old) | 1 |

### Technical

| Signal | Points |
|---|---|
| Deprecated tech (Flash, frames, old jQuery) | 2 |
| Broken navigation links | 2 |
| No social media links | 1 |
| No call-to-action / contact form | 1 |

**Priority A** (score ≥ 8): act first — highest outreach urgency  
**Priority B** (score 5–7): secondary pipeline  
**Priority C** (score < 5): lower priority  

Thresholds are configurable in `.env` via `PRIORITY_A_THRESHOLD` and `PRIORITY_B_THRESHOLD`.

---

## API Keys

No API keys are required to run SEO Hunter. All discovery and geocoding uses free, open services.

| Key | Purpose | Where to get it |
|---|---|---|
| `GOOGLE_PSI_API_KEY` | PageSpeed scores (optional) | [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) — free quota |
| `YELP_API_KEY` | Yelp fallback prospecting (optional) | [Yelp Fusion](https://www.yelp.com/developers) |

Without keys, the auditor skips PageSpeed checks (score shows as `-1`) and uses OSM Overpass → Yellow Pages for discovery.

---

## Data Sources

| Source | Used for | Cost |
|---|---|---|
| [Overpass API](https://overpass-api.de) | Business discovery from OpenStreetMap | Free |
| [Nominatim](https://nominatim.openstreetmap.org) | City → lat/lng geocoding | Free |
| [OpenStreetMap](https://openstreetmap.org) | Map tiles (Leaflet) | Free |
| [Wayback Machine CDX API](https://archive.org/help/wayback_api.php) | Last snapshot date | Free |
| Yellow Pages | Fallback business prospecting | Free (scraped) |

---

## Project Structure

```
seo-hunter/
├── app.py                     # FastAPI backend — all REST API endpoints
├── config.py                  # Scoring weights, thresholds, API config
├── main.py                    # Legacy CLI entry point (kept for single-site checks)
├── pyproject.toml             # Python dependencies (managed by uv)
├── run.sh                     # Start script (build + serve)
├── .env.example               # Environment variable template
├── sitecp.db                  # SQLite database (auto-created on first run)
│
├── src/
│   ├── auditor.py             # 25+ signal checkers (SEO, security, content, mobile)
│   ├── scorer.py              # Scoring model + priority tier assignment
│   ├── database.py            # SQLAlchemy models (Business, AuditResult, Category…)
│   ├── osm_prospector.py      # Overpass API + Nominatim geocoding + 100+ OSM synonyms
│   ├── prospector.py          # Yellow Pages + Yelp fallback scrapers
│   └── monitor.py             # Continuous monitoring (legacy CLI)
│
├── frontend/                  # React + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── App.jsx            # App shell, tab navigation, global job state
│   │   ├── api.js             # Fetch wrappers for all API endpoints
│   │   ├── tabs/
│   │   │   ├── ClientsTab.jsx     # Priority-sorted client cards
│   │   │   ├── DatabaseTab.jsx    # Full searchable/sortable table
│   │   │   └── DiscoverTab.jsx    # Map search + category management
│   │   └── components/ui/
│   │       ├── AuditReportModal.jsx   # Full audit report with inline map
│   │       ├── PriorityBadge.jsx
│   │       └── Toast.jsx
│   └── vite.config.js
│
├── static/                    # Built React output (served by FastAPI)
└── templates/
    ├── outreach_email.txt     # Cold email templates
    └── cold_call_script.txt   # Phone + walk-in scripts
```

---

## Database Schema

The SQLite database (`sitecp.db`) is created automatically on first run.

| Table | Purpose |
|---|---|
| `localities` | Searched areas (city, lat/lng, radius, category) |
| `businesses` | Discovered businesses (name, website, phone, email, address, geo-tag…) |
| `audit_results` | Latest audit result per business (score, priority, signals JSON, raw metadata) |
| `audit_history` | Append-only audit log — full history per business |
| `scrape_jobs` | Background job tracking (status, progress counts) |
| `categories` | User-managed category list with aliases/synonyms |

---

## Environment Variables

Copy `.env.example` to `.env` and customise as needed.

```bash
# Optional API keys
GOOGLE_PSI_API_KEY=        # PageSpeed Insights (leave blank to skip)
YELP_API_KEY=              # Yelp Fusion (fallback prospecting)

# Prospecting defaults
TARGET_CITY="Bangalore"
TARGET_STATE="Karnataka"
TARGET_VERTICALS="restaurants,dentists,plumbers,..."
MAX_RESULTS_PER_SOURCE=50

# Scoring thresholds
PRIORITY_A_THRESHOLD=8
PRIORITY_B_THRESHOLD=5

# Server
WEB_HOST=0.0.0.0
WEB_PORT=8000

# HTTP behaviour
REQUEST_TIMEOUT=15
REQUEST_DELAY=1.5
```

---

## Outreach Templates

Pre-written templates are in `templates/`:

- **`outreach_email.txt`** — cold email variants for Priority A and B prospects
- **`cold_call_script.txt`** — phone call script and walk-in guide

Fill in the `[PLACEHOLDERS]` from the audit report before sending.
