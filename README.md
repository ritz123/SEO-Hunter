# siteCp — Local Business Outdated Website Finder

A Python CLI tool that implements a 6-stage SEO strategy for discovering local
business establishments with outdated websites and building a qualified outreach
prospect pipeline.

## Architecture

```
Stage 2: Prospect  →  Stage 3: Audit  →  Stage 4: Verify  →  Stage 5: Outreach
   (URLs)               (Score)           (Checklist)         (Templates)
                                                ↑
                                         Stage 6: Monitor (continuous)
```

## Quick Start

### 1. Install dependencies

```bash
uv sync
```

That's it — `uv` creates the virtual environment and installs all dependencies
from `uv.lock` automatically. No `pip`, no manual venv setup.

### 2. Configure API keys

```bash
cp .env.example .env
# Edit .env and add your API keys (see API Keys section below)
```

### 3. Audit a single site immediately

```bash
uv run python main.py check https://example-plumbing-company.com
```

### 4. Run the full weekly pipeline

```bash
uv run python main.py pipeline --city "Austin" --state TX --verticals "plumbers,dentists,HVAC"
```

This runs Stages 2, 3, and 4 in sequence and writes three output files to `output/`:
- `prospects_<timestamp>.csv` — full results, all tiers
- `prospects_priorityA_<timestamp>.csv` — Priority A only (highest urgency)
- `verification_checklist_<timestamp>.csv` — Stage 4 manual check template

---

## Commands

### `check` — Audit a single URL

```bash
python main.py check https://domain.com
```

Prints a detailed breakdown of all signals and their scores.

---

### `prospect` — Stage 2: discover business URLs

```bash
uv run python main.py prospect \
  --city "Portland" \
  --state OR \
  --verticals "chiropractors,optometrists" \
  --sources "yelp,yellow_pages" \
  --max-results 50
```

Exports a `leads_<timestamp>.csv` to `output/`. Pass this file to `audit`.

---

### `audit` — Stage 3: audit a URL list

```bash
# From a CSV produced by prospect:
uv run python main.py audit output/leads_20260712.csv --priority A --top 30

# From a plain-text file (one URL per line):
uv run python main.py audit urls.txt

# Single URL:
uv run python main.py audit --url https://domain.com
```

Options:
- `--priority A|B|C` — export only that tier to CSV
- `--check-nav` — also check navigation links (slower, ~+5s per site)
- `--top N` — show top N results in the console table

---

### `pipeline` — Stages 2+3+4 in one shot

```bash
uv run python main.py pipeline \
  --city "Denver" \
  --state CO \
  --verticals "plumbers,electricians,HVAC" \
  --max-results 30 \
  --check-nav
```

The recommended weekly workflow command.

---

### `verify` — Stage 4: export verification checklist

```bash
uv run python main.py verify output/prospects_20260712.csv --top 50
```

Generates a `verification_checklist_<timestamp>.csv` with pre-filled audit
data and blank columns for manual spot-checks (mobile rendering, indexation,
GBP URL match, decision maker name).

---

### `monitor` — Stage 6: continuous monitoring

```bash
# Run once and exit:
uv run python main.py monitor --city "Seattle" --once

# Run every 24 hours (blocking, Ctrl+C to stop):
uv run python main.py monitor --city "Seattle" --interval 24

# Include Google Alert RSS feeds:
uv run python main.py monitor \
  --city "Seattle" \
  --alert-feeds "https://www.google.com/alerts/feeds/...,https://..."
```

Compares current prospecting results against a saved snapshot to surface
**only new businesses** since the last check. Writes a digest file to `output/`.

---

### `templates` — Stage 5: outreach templates

```bash
uv run python main.py templates --type email   # Cold email templates
uv run python main.py templates --type call    # Cold call script + walk-in guide
```

---

## API Keys

| Key | Required? | Where to get it |
|---|---|---|
| `GOOGLE_PSI_API_KEY` | Recommended | [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) — free |
| `GOOGLE_MAPS_API_KEY` | Optional | [Google Cloud Console](https://console.cloud.google.com/) — Places API |
| `YELP_API_KEY` | Optional | [Yelp Fusion](https://www.yelp.com/developers) — free tier |
| `OUTSCRAPER_API_KEY` | Optional | [Outscraper](https://outscraper.com/) — paid |

Without any API keys, the tool still works using:
- Yellow Pages scraping
- Wayback Machine CDX API (free, no key)
- HTML-based signal detection (viewport, meta tags, copyright year, etc.)

PageSpeed scores will show as `-1` (not checked) without `GOOGLE_PSI_API_KEY`.

---

## Scoring Model

| Signal | Points |
|---|---|
| Home page unreachable | 5 |
| No HTTPS | 3 |
| Fails mobile-friendly test | 3 |
| SSL invalid or expired | 3 |
| PageSpeed score < 50 | 2 |
| Copyright year 2+ years old | 2 |
| Wayback snapshot 2+ years old | 2 |
| Deprecated tech (Flash, frames) | 2 |
| No meta viewport tag | 2 |
| Broken navigation links | 2 |
| Not indexed on Google | 2 |
| No structured data | 1 |
| Missing meta description | 1 |
| Missing title tag | 1 |
| No social media links | 1 |
| No call-to-action / contact form | 1 |
| Stale blog (2+ years old) | 1 |

**Priority A** (score ≥ 8): act first — high outreach urgency  
**Priority B** (score 5–7): secondary pipeline  
**Priority C** (score < 5): lower priority  

Thresholds are configurable in `.env` via `PRIORITY_A_THRESHOLD` and `PRIORITY_B_THRESHOLD`.

---

## Output Files

All outputs are written to the `output/` directory.

| File | Contents |
|---|---|
| `leads_<ts>.csv` | Raw business leads from prospecting |
| `prospects_<ts>.csv` | Fully audited and scored results |
| `prospects_priorityA_<ts>.csv` | Priority A prospects only |
| `verification_checklist_<ts>.csv` | Stage 4 manual check template |
| `digest_<ts>.txt` | Monitoring digest (new businesses found) |
| `snapshots/default.json` | Monitoring state snapshot |

---

## Workflow: Weekly Prospect Pipeline

```
Week 1  Select 2-3 verticals and a city
        → Edit TARGET_VERTICALS and TARGET_CITY in .env

Week 2  uv run python main.py pipeline --city "..." --verticals "..."
        → Produces scored CSV with 200-500 URLs audited

Week 3  Open verification_checklist_*.csv in Google Sheets
        → Manually spot-check top 50 prospects (5 checks each)
        → Fill in decision maker name and confirm priority tier

Week 4  Use outreach_email.txt and cold_call_script.txt templates
        → Contact Priority A prospects (20-30 businesses)
        → Goal: 5-10 conversations

Ongoing uv run python main.py monitor --city "..." --interval 24
        → Surfaces new businesses automatically
```

---

## Project Structure

```
siteCp/
├── main.py                    # CLI entry point (all commands)
├── config.py                  # Settings, scoring weights, API endpoints
├── pyproject.toml             # Project metadata and dependencies (uv)
├── uv.lock                    # Locked dependency graph
├── .env.example               # API key template
├── src/
│   ├── __init__.py
│   ├── auditor.py             # Signal checkers (technical, SEO, content)
│   ├── prospector.py          # Business URL discovery (Yelp, GMaps, YP, CSV)
│   ├── scorer.py              # Scoring model + priority tiers
│   ├── exporter.py            # CSV export + console table
│   └── monitor.py             # Continuous monitoring + scheduling
├── templates/
│   ├── outreach_email.txt     # Cold email templates (4 variants)
│   └── cold_call_script.txt   # Phone + walk-in scripts
└── output/                    # Generated CSV/digest files (git-ignored)
```
