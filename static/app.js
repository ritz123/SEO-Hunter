/* ─── siteCp — Leaflet + OpenStreetMap + Browse Client List ───────────────
 *
 * Views:   Map  |  Browse Clients
 * Map:     Leaflet.js + OpenStreetMap tiles
 * Geocode: Nominatim (via /api/geocode backend proxy)
 * Browse:  filterable/sortable/paginated table with CSV export
 * ─────────────────────────────────────────────────────────────────────────── */

'use strict';

/* ── SVG icon library (no emoji as structural icons) ────────────────────────*/
const SVG = {
  search:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  phone:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.85 12.5 19.79 19.79 0 0 1 1.77 3.88 2 2 0 0 1 3.7 1.72l2.97-.84a2 2 0 0 1 2.69 1.29l1.58 3.7a2 2 0 0 1-.45 2l-1.48 1.23a16 16 0 0 0 6.29 6.29l1.23-1.48a2 2 0 0 1 2-.45l3.7 1.58a2 2 0 0 1 1.29 2.69z"/></svg>`,
  globe:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  star:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="#d97706" stroke="#d97706" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  copy:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  report:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  refresh:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
  mapIcon:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>`,
  trash:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  check:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  xMark:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  warning:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  extLink:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  pin:      `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
};

/* ── Global state ───────────────────────────────────────────────────────────*/
let map, markerLayer;
let allBusinesses   = [];      // all loaded from API
let browseFiltered  = [];      // after filters applied
let browseSorted    = [];      // after sort applied
let browsePage      = 1;
const PAGE_SIZE     = 25;
let browseSort      = { col: 'priority', dir: 'asc' };  // Priority A first by default
let activeMapFilter = 'all';
let selectedBizId   = null;
let currentLocalityId = null;
let selectedGeo     = null;
let suggestTimer    = null;
let pollTimer       = null;
let currentView     = 'browse';

const PRIO_COLOR = { A:'#dc2626', B:'#d97706', C:'#16a34a', null:'#9ca3af' };
const PRIO_LABEL = {
  A: 'Priority A — Most outdated',
  B: 'Priority B — Needs work',
  C: 'Priority C — Decent site',
  null: 'Not yet audited',
};

/* ── Tab switching ──────────────────────────────────────────────────────────*/
function switchTab(view) {
  // Reset sidebar detail when leaving map view
  if (currentView === 'map' && view !== 'map') {
    closeSidebarDetail(true /* silent */);
  }

  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.getElementById(`tab-${view}`).classList.add('active');

  if (view === 'map') {
    ensureMapInit();
    // Ensure the search panel is open when user visits Discover
    document.getElementById('search-panel').classList.remove('collapsed');
    setTimeout(() => { map.invalidateSize(); renderMarkers(); }, 80);
  } else if (view === 'browse') {
    if (!allBusinesses.length) loadAllBusinesses();
    else { populateBrowseDropdowns(); applyBrowseFilters(); }
  } else if (view === 'database') {
    loadDbTab();
  }
}

/* ── Map initialisation (lazy — only when Discover tab is first opened) ─────*/
let pinMarker    = null;   // the dropped location pin
let radiusCircle = null;   // the search-radius circle
let mapReady     = false;

function ensureMapInit() {
  if (mapReady) return;
  initMap();
}

function initMap() {
  if (mapReady) return;
  mapReady = true;
  map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);

  // Click-to-select location
  map.on('click', onMapClick);

  // Re-draw radius circle when radius input changes
  document.getElementById('inp-radius').addEventListener('input', updateRadiusCircle);
}

async function onMapClick(e) {
  const { lat, lng } = e.latlng;
  placePin(lat, lng);

  // Reverse geocode to fill the location input
  try {
    const geo = await api('GET', `/api/geocode/reverse?lat=${lat}&lng=${lng}`);
    selectedGeo = { lat, lng, display_name: geo.display_name };
    document.getElementById('inp-locality').value = geo.display_name;
    toast(`Pin set: ${geo.display_name}`, '');
  } catch (_) {
    selectedGeo = { lat, lng, display_name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
    document.getElementById('inp-locality').value = selectedGeo.display_name;
  }
}

function placePin(lat, lng) {
  // Fade the hint out once the user has clicked
  const hint = document.getElementById('map-hint');
  if (hint) hint.classList.add('hide');

  // Remove previous pin
  if (pinMarker)    { map.removeLayer(pinMarker); }
  if (radiusCircle) { map.removeLayer(radiusCircle); }

  // Drop a pulsing pin marker
  const pinIcon = L.divIcon({
    className: '',
    html: `<div class="map-pin"><svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#1e40af"/><circle cx="14" cy="14" r="6" fill="white"/></svg></div>`,
    iconSize:   [28, 36],
    iconAnchor: [14, 36],
  });
  pinMarker = L.marker([lat, lng], { icon: pinIcon, zIndexOffset: 1000 })
    .addTo(map)
    .bindTooltip('Search origin — click "Search & Audit"', { permanent: false });

  updateRadiusCircle(lat, lng);
}

function updateRadiusCircle(latOrEvent, lngArg) {
  if (!pinMarker) return;
  const center = pinMarker.getLatLng();
  const lat = (typeof latOrEvent === 'number') ? latOrEvent : center.lat;
  const lng = lngArg ?? center.lng;
  const km  = parseInt(document.getElementById('inp-radius').value) || 5;

  if (radiusCircle) map.removeLayer(radiusCircle);
  radiusCircle = L.circle([lat, lng], {
    radius:      km * 1000,
    color:       '#2563eb',
    fillColor:   '#2563eb',
    fillOpacity: 0.08,
    weight:      1.5,
    dashArray:   '6 4',
  }).addTo(map);
}

function clearPin() {
  if (pinMarker)    { map.removeLayer(pinMarker);    pinMarker    = null; }
  if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
  selectedGeo = null;
}

/* ── Nominatim autocomplete ─────────────────────────────────────────────────*/
function onLocalityInput() {
  clearTimeout(suggestTimer);
  const q = document.getElementById('inp-locality').value.trim();
  if (q.length < 2) { closeSuggest(); return; }
  suggestTimer = setTimeout(() => fetchSuggestions(q), 350);
}

async function fetchSuggestions(q) {
  try {
    const items = await api('GET', `/api/geocode/suggest?q=${encodeURIComponent(q)}&limit=5`);
    renderSuggestions(items);
  } catch (_) { closeSuggest(); }
}

function renderSuggestions(items) {
  const dd = document.getElementById('suggest-dropdown');
  if (!items.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = items.map((it, i) =>
    `<div class="suggest-item" onclick="selectSuggestion(${i})">${esc(it.display_name)}</div>`
  ).join('');
  dd._items = items;
  dd.style.display = 'block';
}

function selectSuggestion(idx) {
  const dd   = document.getElementById('suggest-dropdown');
  const item = dd._items[idx];
  document.getElementById('inp-locality').value = item.display_name;
  selectedGeo = item;
  closeSuggest();
  if (map) map.setView([item.lat, item.lng], 12);
}

function closeSuggest() {
  const dd = document.getElementById('suggest-dropdown');
  dd.style.display = 'none';
}

document.addEventListener('click', e => {
  if (!e.target.closest('#inp-locality') && !e.target.closest('#suggest-dropdown')) closeSuggest();
});

/* ── Search panel toggle ────────────────────────────────────────────────────*/
function toggleSearchPanel() {
  document.getElementById('search-panel').classList.toggle('collapsed');
}

/* ── Search ─────────────────────────────────────────────────────────────────*/
async function startSearch() {
  const localityInput = document.getElementById('inp-locality').value.trim();
  if (!localityInput) { toast('Enter a city name first', 'error'); return; }

  const category = document.getElementById('inp-category').value;
  const radius   = parseInt(document.getElementById('inp-radius').value) || 5;
  const maxRes   = parseInt(document.getElementById('inp-max').value) || 50;
  const useApify = document.getElementById('chk-apify').checked;

  const btn = document.getElementById('btn-search');
  btn.disabled = true;
  closeSuggest();

  let lat = selectedGeo?.lat ?? null;
  let lng = selectedGeo?.lng ?? null;

  if (!lat || !lng) {
    try {
      const geo = await api('GET', `/api/geocode?q=${encodeURIComponent(localityInput)}`);
      if (geo.found) {
        lat = geo.lat; lng = geo.lng;
        if (map) { map.setView([lat, lng], 12); placePin(lat, lng); }
      } else {
        toast('Location not geocoded — searching by name only', '');
      }
    } catch (_) {}
  }

  try {
    const res = await api('POST', '/api/search', {
      locality_name: localityInput,
      lat, lng, radius_km: radius,
      category, max_results: maxRes,
      use_apify: useApify,
    });
    currentLocalityId = res.locality_id;
    startPolling(res.job_id, res.locality_id);
    showProgress('Starting…', 0, 0, 0);
  } catch (e) {
    toast('Search failed: ' + e.message, 'error');
    btn.disabled = false;
  }
}

/* ── Polling ────────────────────────────────────────────────────────────────*/
function startPolling(jobId, localityId) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const job = await api('GET', `/api/jobs/${jobId}`);
      updateProgress(job);
      if (job.status === 'done') {
        clearInterval(pollTimer);
        document.getElementById('btn-search').disabled = false;
        hideProgress();
        await loadBusinesses(localityId);
        refreshStats();
        // Auto-collapse search form so the results list gets full space
        document.getElementById('search-panel').classList.add('collapsed');
        toast(`Found ${job.businesses_found}, audited ${job.businesses_audited}`, 'success');
      } else if (job.status === 'failed') {
        clearInterval(pollTimer);
        document.getElementById('btn-search').disabled = false;
        hideProgress();
        toast('Failed: ' + (job.error || 'unknown'), 'error');
      }
    } catch (e) { console.error('Poll error', e); }
  }, 3000);
}

function updateProgress(job) {
  const labels = { pending:'Pending…', scraping:'Scraping…', auditing:'Auditing websites…', done:'Done!', failed:'Failed' };
  const found   = job.businesses_found  || 0;
  const audited = job.businesses_audited || 0;
  const pct = found > 0 ? Math.round((audited / found) * 100) : (job.status === 'scraping' ? 20 : 0);
  showProgress(labels[job.status] || job.status, pct, found, audited);
}

function showProgress(label, pct, found, audited) {
  document.getElementById('progress-wrap').classList.add('visible');
  document.getElementById('progress-label').textContent = label;
  document.getElementById('progress-bar').style.width   = pct + '%';
  document.getElementById('progress-counts').textContent =
    found > 0 ? `${audited} / ${found} audited` : '';
}

function hideProgress() {
  setTimeout(() => document.getElementById('progress-wrap').classList.remove('visible'), 1500);
}

/* ── Load businesses from API ───────────────────────────────────────────────*/
async function loadBusinesses(localityId) {
  const qs  = localityId ? `?locality_id=${localityId}&limit=1000` : '?limit=1000';
  const res = await api('GET', '/api/businesses' + qs);
  const incoming = res.items || [];

  if (localityId) {
    // Merge: replace records for this locality, keep others
    const others = allBusinesses.filter(b => b.locality_id !== localityId);
    allBusinesses = [...others, ...incoming];
  } else {
    allBusinesses = incoming;
  }

  renderMapList();
  renderMarkers();
  populateBrowseDropdowns();
  applyBrowseFilters();
  refreshClientKPIs();
}

async function loadAllBusinesses() {
  try {
    const res = await api('GET', '/api/businesses?limit=2000');
    allBusinesses = res.items || [];
    renderMapList();
    renderMarkers();
    populateBrowseDropdowns();
    applyBrowseFilters();
    refreshClientKPIs();
  } catch (_) {}
}

/* ── Clients tab KPI strip ──────────────────────────────────────────────────*/
function refreshClientKPIs() {
  const els = {
    total:  document.getElementById('kpi-total'),
    a:      document.getElementById('kpi-a'),
    b:      document.getElementById('kpi-b'),
    c:      document.getElementById('kpi-c'),
    nosite: document.getElementById('kpi-nosite'),
  };
  if (!els.total) return;

  const total  = allBusinesses.length;
  const countA = allBusinesses.filter(b => b.audit?.priority === 'A').length;
  const countB = allBusinesses.filter(b => b.audit?.priority === 'B').length;
  const countC = allBusinesses.filter(b => b.audit?.priority === 'C').length;
  const nosite = allBusinesses.filter(b => !b.website).length;

  els.total.textContent  = total  || '—';
  els.a.textContent      = countA || '—';
  els.b.textContent      = countB || '—';
  els.c.textContent      = countC || '—';
  els.nosite.textContent = nosite || '—';
}

/* ── Map sidebar list ───────────────────────────────────────────────────────*/
function setMapFilter(filter, btn) {
  activeMapFilter = filter;
  document.querySelectorAll('.filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMapList();
  renderMarkers();
}

function mapFilteredBusinesses() {
  if (activeMapFilter === 'all')     return allBusinesses;
  if (activeMapFilter === 'no-site') return allBusinesses.filter(b => !b.website);
  return allBusinesses.filter(b => b.audit?.priority === activeMapFilter);
}

function renderMapList() {
  const list  = document.getElementById('business-list');
  const items = mapFilteredBusinesses();

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">
      <svg class="es-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <div class="es-title">No businesses match this filter</div>
      <div class="es-sub">Try selecting "All" or running a new search.</div>
    </div>`;
    return;
  }

  const order = { A:0, B:1, C:2 };
  items.sort((a, b) => {
    const pa = order[a.audit?.priority] ?? 3;
    const pb = order[b.audit?.priority] ?? 3;
    return pa !== pb ? pa - pb : (b.audit?.score ?? 0) - (a.audit?.score ?? 0);
  });

  list.innerHTML = items.map(b => {
    const prio    = b.audit?.priority ?? null;
    const score   = b.audit?.score ?? '—';
    const meta    = [b.category, b.address].filter(Boolean).join(' · ').substring(0, 55);
    const topIssue = b.audit?.top_issues?.[0] ?? '';
    return `<div class="biz-item${b.id === selectedBizId ? ' selected' : ''}"
                 onclick="selectBusiness(${b.id})" data-id="${b.id}">
      <div class="prio-badge prio-${prio || 'none'}">${prio || '?'}</div>
      <div class="biz-info">
        <div class="biz-name">${esc(b.name || b.website || '(unnamed)')}</div>
        <div class="biz-meta">${esc(meta)}</div>
        ${topIssue ? `<div class="biz-issue" style="display:flex;align-items:center;gap:4px">${SVG.warning} ${esc(topIssue)}</div>` : ''}
      </div>
      <div class="biz-score">${score}</div>
    </div>`;
  }).join('');
}

/* ── Leaflet markers ────────────────────────────────────────────────────────*/
function renderMarkers() {
  if (!map) return;
  markerLayer.clearLayers();
  const items  = mapFilteredBusinesses().filter(b => b.lat && b.lng);
  const bounds = [];

  items.forEach(b => {
    const color  = PRIO_COLOR[b.audit?.priority ?? null];
    const marker = L.circleMarker([b.lat, b.lng], {
      radius: 9, fillColor: color, fillOpacity: .9, color: '#fff', weight: 2,
    });
    marker.bindPopup(`
      <div style="font-size:13px;min-width:160px">
        <strong>${esc(b.name || '(unnamed)')}</strong><br>
        <span style="color:#6b7280;font-size:11px">${esc(b.category || '')}</span><br>
        ${b.audit
          ? `<span style="color:${color};font-weight:700">Priority ${b.audit.priority} · Score ${b.audit.score}</span>`
          : '<span style="color:#9ca3af">Not audited yet</span>'}
      </div>`, { maxWidth: 220 });
    marker.on('click', () => selectBusiness(b.id));
    markerLayer.addLayer(marker);
    bounds.push([b.lat, b.lng]);
  });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [32, 32] });
    if (bounds.length === 1) map.setZoom(14);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   BROWSE VIEW
══════════════════════════════════════════════════════════════════════════ */

/* Populate locality + category dropdowns from loaded data */
function populateBrowseDropdowns() {
  const locSel = document.getElementById('bf-locality');
  const catSel = document.getElementById('bf-category');

  const currentLoc = locSel.value;
  const currentCat = catSel.value;

  // Gather unique values
  const localities = [...new Map(
    allBusinesses
      .filter(b => b.locality_id)
      .map(b => [b.locality_id, b])
  ).values()].map(b => ({ id: b.locality_id, name: b.city || `Locality ${b.locality_id}` }));

  const categories = [...new Set(allBusinesses.map(b => b.category).filter(Boolean))].sort();

  locSel.innerHTML = `<option value="">All localities</option>` +
    localities.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
  catSel.innerHTML = `<option value="">All categories</option>` +
    categories.map(c => `<option value="${c}">${esc(c)}</option>`).join('');

  locSel.value = currentLoc;
  catSel.value = currentCat;
}

/* Priority chip group wiring */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#bf-priority .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#bf-priority .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyBrowseFilters();
    });
  });
});

/* Apply all filters + refresh table */
function applyBrowseFilters() {
  const priority = document.querySelector('#bf-priority .chip.active')?.dataset.val ?? '';
  const locId    = document.getElementById('bf-locality').value;
  const category = document.getElementById('bf-category').value.toLowerCase();
  const website  = document.getElementById('bf-website').value;
  const search   = document.getElementById('bf-search').value.toLowerCase().trim();

  browseFiltered = allBusinesses.filter(b => {
    if (priority && b.audit?.priority !== priority) return false;
    if (locId    && String(b.locality_id) !== locId) return false;
    if (category && !(b.category || '').toLowerCase().includes(category)) return false;
    if (website === 'yes' && !b.website)  return false;
    if (website === 'no'  &&  b.website)  return false;
    if (search) {
      const hay = `${b.name || ''} ${b.address || ''} ${b.category || ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  browsePage = 1;
  applyBrowseSort();
}

/* Sort */
function sortBrowse(col) {
  if (browseSort.col === col) {
    browseSort.dir = browseSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    browseSort.col = col;
    browseSort.dir = col === 'name' ? 'asc' : 'desc';
  }
  applyBrowseSort();
}

function applyBrowseSort() {
  const { col, dir } = browseSort;
  const prioOrder = { A:0, B:1, C:2, '':3, undefined:3, null:3 };

  browseSorted = [...browseFiltered].sort((a, b) => {
    let va, vb;
    switch (col) {
      case 'priority': va = prioOrder[a.audit?.priority]; vb = prioOrder[b.audit?.priority]; break;
      case 'score':    va = a.audit?.score ?? -1;         vb = b.audit?.score ?? -1;         break;
      case 'name':     va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break;
      case 'category': va = (a.category||'').toLowerCase(); vb = (b.category||'').toLowerCase(); break;
      case 'city':     va = (a.city||a.address||'').toLowerCase(); vb = (b.city||b.address||'').toLowerCase(); break;
      case 'rating':   va = a.rating ?? 0;                vb = b.rating ?? 0;               break;
      default:         va = 0; vb = 0;
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });

  renderBrowseTable();
  updateSortHeaders();
}

/* Update sort indicator in headers */
function updateSortHeaders() {
  document.querySelectorAll('.biz-table th[data-col]').forEach(th => {
    th.classList.remove('sorted', 'sorted-asc', 'sorted-desc');
    if (th.dataset.col === browseSort.col) {
      th.classList.add('sorted', `sorted-${browseSort.dir}`);
    }
  });
}

/* Render the table body for the current page */
function renderBrowseTable() {
  const tbody = document.getElementById('biz-tbody');
  const total = browseSorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  browsePage  = Math.min(browsePage, pages);

  document.getElementById('browse-count').textContent =
    `${total} business${total !== 1 ? 'es' : ''}`;

  if (!total) {
    if (!allBusinesses.length) {
      tbody.innerHTML = `<tr><td colspan="10">
        <div class="clients-empty">
          <svg class="clients-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <div class="clients-empty-title">No clients in your database yet</div>
          <div class="clients-empty-sub">
            Use <strong>Discover</strong> to search for local businesses and audit their websites.<br>
            Priority&nbsp;A clients — those with the most outdated sites — appear here first, ready for outreach.
          </div>
          <button class="btn btn-primary" style="display:inline-flex;margin-top:4px" onclick="switchTab('map')">
            Open Discover &rarr;
          </button>
        </div>
      </td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="10" class="table-empty">No clients match the current filters.</td></tr>`;
    }
    renderPagination(0, 0);
    return;
  }

  const start = (browsePage - 1) * PAGE_SIZE;
  const slice = browseSorted.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = slice.map(b => {
    const prio   = b.audit?.priority ?? '';
    const score  = b.audit?.score ?? null;
    const issue  = b.audit?.top_issues?.[0] ?? '';
    const rating = b.rating ? `<span style="display:inline-flex;align-items:center;gap:3px">${SVG.star} ${b.rating}</span>` : '—';

    // Score bar colour
    const barColor = prio === 'A' ? '#dc2626' : prio === 'B' ? '#d97706' : '#16a34a';
    const barPct   = score != null ? Math.min(100, Math.round((score / 20) * 100)) : 0;

    const websiteCell = b.website
      ? `<a class="tbl-link" href="${esc(b.website)}" target="_blank" rel="noopener"
              onclick="event.stopPropagation()">${SVG.extLink} visit</a>
         <button class="copy-btn" title="Copy URL"
                 onclick="event.stopPropagation();copyText('${esc(b.website)}')">${SVG.copy}</button>`
      : `<span style="color:#d1d5db;font-size:11px">none</span>`;

    const phoneCell = b.phone
      ? `<a class="tbl-link" href="tel:${esc(b.phone)}"
              onclick="event.stopPropagation()">${esc(b.phone)}</a>
         <button class="copy-btn" title="Copy phone"
                 onclick="event.stopPropagation();copyText('${esc(b.phone)}')">${SVG.copy}</button>`
      : `<span style="color:#d1d5db;font-size:11px">—</span>`;

    return `<tr onclick="selectBusiness(${b.id})"${b.id === selectedBizId ? ' class="selected"' : ''} data-id="${b.id}">
      <td><span class="tbl-prio tbl-prio-${prio}">${prio || '?'}</span></td>
      <td>
        <div class="score-bar-wrap">
          <span style="font-weight:700;font-size:13px">${score ?? '—'}</span>
          ${score != null ? `<div class="score-bar"><div class="score-bar-fill" style="width:${barPct}%;background:${barColor}"></div></div>` : ''}
        </div>
      </td>
      <td title="${esc(b.name || '')}" style="font-weight:500">${esc((b.name || b.website || '(unnamed)').substring(0, 32))}</td>
      <td>${esc(b.category || '—')}</td>
      <td>${esc((b.city || (b.address || '').split(',').pop()?.trim() || '—').substring(0, 20))}</td>
      <td>${websiteCell}</td>
      <td>${phoneCell}</td>
      <td>${rating}</td>
      <td title="${esc(issue)}" style="color:#6b7280;font-size:11px">${esc(issue.substring(0, 45))}</td>
      <td>
        <div class="tbl-actions">
          <button class="btn btn-ghost btn-sm" style="padding:3px 7px;font-size:11px"
                  onclick="event.stopPropagation();selectBusiness(${b.id})">Details</button>
          ${b.audit ? `<button class="btn btn-sm report-btn"
                  onclick="event.stopPropagation();openReport(${b.id})" title="View full audit report">${SVG.report} Report</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  renderPagination(browsePage, pages);
}

/* Pagination controls */
function renderPagination(page, pages) {
  const el = document.getElementById('pagination');
  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = `<button class="page-btn" onclick="goPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹ Prev</button>`;

  // Show at most 7 page buttons
  const range = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= page - 2 && i <= page + 2)) range.push(i);
    else if (range[range.length - 1] !== '…') range.push('…');
  }

  range.forEach(p => {
    if (p === '…') {
      html += `<span class="page-info">…</span>`;
    } else {
      html += `<button class="page-btn${p === page ? ' active' : ''}" onclick="goPage(${p})">${p}</button>`;
    }
  });

  html += `<button class="page-btn" onclick="goPage(${page + 1})" ${page >= pages ? 'disabled' : ''}>Next ›</button>`;
  html += `<span class="page-info">Page ${page} of ${pages}</span>`;
  el.innerHTML = html;
}

function goPage(page) {
  browsePage = page;
  renderBrowseTable();
  document.querySelector('.table-wrap')?.scrollTo(0, 0);
}

/* Export filtered list as CSV */
function exportBrowseCSV() {
  if (!browseSorted.length) { toast('No data to export', 'error'); return; }
  const cols = ['priority','score','name','category','city','website','phone','rating','review_count','top_issue','address','gbp_url'];
  const header = cols.join(',');
  const rows = browseSorted.map(b => cols.map(c => {
    let v = '';
    switch (c) {
      case 'priority':    v = b.audit?.priority ?? ''; break;
      case 'score':       v = b.audit?.score ?? ''; break;
      case 'top_issue':   v = b.audit?.top_issues?.[0] ?? ''; break;
      case 'city':        v = b.city || ''; break;
      default:            v = b[c] ?? '';
    }
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(','));
  const csv  = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sitecp_clients_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${browseSorted.length} businesses`, 'success');
}

/* ── Detail panel (shared) ──────────────────────────────────────────────────*/
async function selectBusiness(id) {
  selectedBizId = id;

  // Highlight in map list
  document.querySelectorAll('.biz-item').forEach(el =>
    el.classList.toggle('selected', parseInt(el.dataset.id) === id));
  // Highlight in browse table
  document.querySelectorAll('#biz-tbody tr[data-id]').forEach(el =>
    el.classList.toggle('selected', parseInt(el.dataset.id) === id));

  const biz = await api('GET', `/api/businesses/${id}`);
  showDetail(biz);

  if (map && biz.lat && biz.lng && currentView === 'map') {
    map.panTo([biz.lat, biz.lng]);
    if (map.getZoom() < 13) map.setZoom(13);
  }
}

/* Build the reusable detail body HTML (used by both sidebar and slide-over panel) */
function buildDetailBodyHTML(biz) {
  const audit = biz.audit;
  const prio  = audit?.priority ?? null;
  let html = '';

  if (audit) {
    html += `<div class="detail-section">
      <div class="score-ring">
        <div class="score-number score-${prio}">${audit.score}</div>
        <div class="score-meta"><strong>Priority ${prio}</strong>${PRIO_LABEL[prio] || ''}</div>
      </div>`;

    if (audit.top_issues?.length) {
      html += `<h3>Top Issues</h3><ul class="issue-list">`;
      audit.top_issues.forEach(i => html += `<li><span class="issue-dot"></span>${esc(i)}</li>`);
      html += '</ul>';
    }
    html += '</div>';

    const SIG_LABELS = {
      broken_home_page:'Home page broken',       no_https:'No HTTPS',
      ssl_invalid_or_expired:'SSL invalid',       fails_mobile_friendly:'Not mobile-friendly',
      no_meta_viewport:'No viewport tag',         pagespeed_score_low:'Slow (PSI<50)',
      copyright_year_old:'Old copyright year',    deprecated_tech:'Deprecated tech',
      missing_meta_description:'No meta desc',   missing_title:'No title tag',
      no_structured_data:'No structured data',    wayback_stale:'Not updated (Wayback)',
      broken_nav_links:'Broken nav links',        no_social_links:'No social links',
      no_cta:'No CTA / form',                     stale_blog:'Stale blog',
      not_indexed:'Not indexed',
    };
    const sigs = audit.signals || {};
    const sigKeys = Object.keys(SIG_LABELS).filter(k => k in sigs);
    if (sigKeys.length) {
      html += `<div class="detail-section"><h3>Signals</h3><div class="signal-grid">`;
      sigKeys.forEach(k => {
        const bad = sigs[k];
        html += `<div class="signal-chip ${bad ? 'bad' : 'good'}">
          <span class="signal-dot"></span>${SIG_LABELS[k]}
        </div>`;
      });
      html += '</div></div>';
    }

    const raw = audit.raw || {};
    const rawRows = [
      raw.pagespeed_score >= 0        ? `PageSpeed: ${raw.pagespeed_score}/100` : null,
      raw.copyright_year              ? `Copyright: ${raw.copyright_year}`       : null,
      raw.wayback_last_snapshot       ? `Last archived: ${raw.wayback_last_snapshot}` : null,
    ].filter(Boolean);
    if (rawRows.length) {
      html += `<div class="detail-section"><h3>Raw data</h3>`;
      rawRows.forEach(r => html += `<div style="font-size:12px;color:#6b7280;padding:2px 0">${r}</div>`);
      html += '</div>';
    }
  } else {
    html += `<div style="font-size:13px;color:#6b7280;padding:20px 0;text-align:center">
      No audit data yet.<br>Click <strong>Re-audit</strong>.
    </div>`;
  }

  html += `<div class="detail-section"><h3>Contact</h3><div class="contact-links">`;
  if (biz.phone)    html += `<a href="tel:${esc(biz.phone)}">${SVG.phone} ${esc(biz.phone)}</a>`;
  if (biz.website)  html += `<a href="${esc(biz.website)}" target="_blank" rel="noopener">${SVG.globe} ${esc(biz.website)}</a>`;
  if (biz.yelp_url) html += `<a href="${esc(biz.yelp_url)}" target="_blank" rel="noopener">${SVG.star} Yelp page</a>`;
  if (!biz.phone && !biz.website)
    html += `<span style="color:#9ca3af;font-size:12px">No contact info</span>`;
  html += '</div></div>';

  if (biz.rating) {
    html += `<div class="detail-section"><h3>Rating</h3>
      <span style="display:inline-flex;align-items:center;gap:4px">${SVG.star} ${biz.rating} <span style="color:var(--gray-500);font-size:12px">(${biz.review_count || 0} reviews)</span></span></div>`;
  }

  return html;
}

function showDetail(biz) {
  const html = buildDetailBodyHTML(biz);

  if (currentView === 'map') {
    // Show inline in sidebar — map stays full width
    document.getElementById('sdet-name').textContent = biz.name || biz.website || '(unnamed)';
    document.getElementById('sdet-addr').textContent = biz.address || '';
    document.getElementById('sdet-body').innerHTML   = html;

    const wLink = document.getElementById('sdet-website');
    wLink.href  = biz.website || '#';
    wLink.style.display = biz.website ? '' : 'none';

    const gLink = document.getElementById('sdet-gbp');
    gLink.href  = biz.gbp_url || '#';
    gLink.style.display = biz.gbp_url ? '' : 'none';

    document.getElementById('sdet-report-btn').style.display = biz.audit ? '' : 'none';

    document.getElementById('business-list').style.display    = 'none';
    document.getElementById('sidebar-filter-bar').style.display = 'none';
    document.getElementById('sidebar-detail').classList.add('open');

    // Make sure the external slide-over is closed
    document.getElementById('detail-panel').classList.remove('open');
  } else {
    // Browse view: use the right-side slide-over panel
    document.getElementById('dp-name').textContent = biz.name || biz.website || '(unnamed)';
    document.getElementById('dp-addr').textContent = biz.address || '';
    document.getElementById('dp-body').innerHTML   = html;

    const wLink = document.getElementById('dp-website');
    wLink.href  = biz.website || '#';
    wLink.style.display = biz.website ? '' : 'none';

    const gLink = document.getElementById('dp-gbp');
    gLink.href  = biz.gbp_url || '#';
    gLink.style.display = biz.gbp_url ? '' : 'none';

    document.getElementById('detail-panel').classList.add('open');
  }
}

function closeSidebarDetail(silent = false) {
  document.getElementById('sidebar-detail').classList.remove('open');
  document.getElementById('business-list').style.display    = '';
  document.getElementById('sidebar-filter-bar').style.display = '';
  if (!silent) {
    selectedBizId = null;
    document.querySelectorAll('.biz-item').forEach(el => el.classList.remove('selected'));
  }
}

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  closeSidebarDetail();
  selectedBizId = null;
  document.querySelectorAll('.biz-item, #biz-tbody tr[data-id]')
    .forEach(el => el.classList.remove('selected'));
}

function openReportForSelected() {
  if (selectedBizId) openReport(selectedBizId);
}

async function reauditSelected() {
  if (!selectedBizId) return;
  try {
    await api('POST', `/api/businesses/${selectedBizId}/audit`, { check_nav: false });
    toast('Re-audit started — refreshing in 10s…', 'success');
    setTimeout(async () => {
      const biz = await api('GET', `/api/businesses/${selectedBizId}`);
      // Update in allBusinesses
      const idx = allBusinesses.findIndex(b => b.id === biz.id);
      if (idx >= 0) allBusinesses[idx] = biz;
      showDetail(biz);
      renderMapList();
      applyBrowseFilters();
    }, 10000);
  } catch (e) { toast('Re-audit failed: ' + e.message, 'error'); }
}

/* ── History (panel removed — history is in the Insights tab) ───────────────*/
function toggleHistory() { /* no-op — history panel removed */ }
async function refreshHistory() { /* no-op — use Insights tab */ }

async function loadLocality(id) {
  currentLocalityId = id;
  document.getElementById('history-panel').classList.remove('open');
  await loadBusinesses(id);
  closeDetail();
}

async function deleteLocality(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this locality and all its data?')) return;
  await api('DELETE', `/api/localities/${id}`);
  if (currentLocalityId === id) {
    currentLocalityId = null;
    allBusinesses = [];
    renderMapList();
    renderMarkers();
    browseFiltered = []; browseSorted = [];
    renderBrowseTable();
  }
  refreshHistory();
  refreshStats();
  toast('Locality deleted');
}

/* ── Stats ──────────────────────────────────────────────────────────────────*/
async function refreshStats() {
  try {
    const s = await api('GET', '/api/stats');
    document.getElementById('stat-localities').textContent = s.localities;
    document.getElementById('stat-businesses').textContent = s.total_businesses;
    document.getElementById('stat-prio-a').textContent     = s.priority_a;
  } catch (_) {}
}

/* ── Helpers ────────────────────────────────────────────────────────────────*/
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
}

/* ── Database Tab ────────────────────────────────────────────────────────────*/

let dbLocalities  = [];           // raw localities from API
const dbLocalityMap = new Map(); // id → locality object for safe onclick refs
let dbHistoryAll  = [];   // raw audit history from API
let dbHistoryFiltered = [];
let dbHistPage    = 1;
const DB_PAGE     = 50;

async function loadDbTab() {
  // Stats cards
  try {
    const s = await api('GET', '/api/stats');
    document.getElementById('dbs-localities').textContent  = s.localities ?? 0;
    document.getElementById('dbs-businesses').textContent  = s.total_businesses ?? 0;
    document.getElementById('dbs-audited').textContent     = s.audited ?? 0;
    document.getElementById('dbs-prio-a').textContent      = s.priority_a ?? 0;
    document.getElementById('dbs-prio-b').textContent      = s.priority_b ?? 0;
    document.getElementById('dbs-prio-c').textContent      = s.priority_c ?? 0;
    document.getElementById('dbs-runs').textContent        = s.total_audit_runs ?? 0;
  } catch (_) {}

  loadDbLocalities();
  loadDbHistory();
}

/* ── Localities sub-tab ── */
async function loadDbLocalities() {
  try {
    const data = await api('GET', '/api/localities');
    dbLocalities = Array.isArray(data) ? data : (data.localities || []);
    dbLocalityMap.clear();
    dbLocalities.forEach(l => dbLocalityMap.set(l.id, l));
    filterLocalities();
  } catch (_) {
    document.getElementById('db-loc-tbody').innerHTML =
      '<tr><td colspan="7" class="table-empty">Failed to load.</td></tr>';
  }
}

function filterLocalities() {
  const q = (document.getElementById('db-loc-search')?.value || '').toLowerCase();
  const rows = q
    ? dbLocalities.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.category || '').toLowerCase().includes(q))
    : dbLocalities;

  document.getElementById('db-loc-count').textContent =
    `${rows.length} locality${rows.length !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('db-loc-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No localities found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(l => `
    <tr>
      <td><strong>${esc(l.name || '—')}</strong></td>
      <td>${esc(l.category || '—')}</td>
      <td>${l.radius_km ?? '—'} km</td>
      <td>${l.business_count ?? 0}</td>
      <td>${l.audited_count ?? 0}</td>
      <td style="white-space:nowrap;font-size:12px;color:#6b7280">${fmtDate(l.created_at)}</td>
      <td>
        <div class="tbl-actions">
          <button class="btn btn-sm rerun-btn"
                  onclick="rerunLocality(${l.id})" title="Re-run this search">${SVG.refresh} Re-run</button>
          <button class="btn btn-ghost btn-sm" style="font-size:11px"
                  onclick="switchTab('map');loadLocalityOnMap(${l.id})" title="View on map">${SVG.mapIcon} Map</button>
          <button class="btn btn-ghost btn-sm" style="font-size:11px;color:#dc2626"
                  onclick="deleteLocality(event,${l.id})" title="Delete">${SVG.trash}</button>
        </div>
      </td>
    </tr>`).join('');
}

async function loadLocalityOnMap(localityId) {
  // Switch to map, then load that locality's businesses
  try {
    const data = await api('GET', `/api/businesses?locality_id=${localityId}&limit=500`);
    const bisList = data.businesses || data;
    allBusinesses = [...allBusinesses.filter(b => b.locality_id !== localityId), ...bisList];
    renderMarkers();
    if (bisList.length && bisList[0].lat) {
      map.setView([bisList[0].lat, bisList[0].lng], 13);
    }
  } catch (_) {}
}

async function rerunLocality(localityId) {
  const locality = dbLocalityMap.get(localityId);
  if (!locality) { toast('Locality not found', 'error'); return; }

  // Switch to map tab first so the user sees progress
  switchTab('map');
  await new Promise(r => setTimeout(r, 80)); // let map render

  // Pre-fill the search form with saved parameters
  document.getElementById('inp-locality').value = locality.name || '';
  document.getElementById('inp-radius').value   = locality.radius_km || 5;
  if (locality.category) {
    const sel = document.getElementById('inp-category');
    const opt = [...sel.options].find(o => o.value === locality.category);
    if (opt) sel.value = locality.category;
  }

  // Place pin + radius circle if we have coordinates
  if (locality.lat && locality.lng) {
    placePin(locality.lat, locality.lng);
    selectedGeo = { lat: locality.lat, lng: locality.lng, display_name: locality.name };
    map.setView([locality.lat, locality.lng], 12);
  } else {
    clearPin();
  }

  toast(`Re-running search for "${locality.name}"…`, '');
  startSearch();
}

/* ── Audit History sub-tab ── */
async function loadDbHistory() {
  try {
    const data = await api('GET', '/api/audit-history?limit=1000');
    dbHistoryAll = data.items || [];
    filterAuditHistory();
  } catch (_) {
    document.getElementById('db-hist-tbody').innerHTML =
      '<tr><td colspan="8" class="table-empty">Failed to load.</td></tr>';
  }
}

function filterAuditHistory() {
  const q    = (document.getElementById('db-hist-search')?.value || '').toLowerCase();
  const prio = document.getElementById('db-hist-prio')?.value || '';

  dbHistoryFiltered = dbHistoryAll.filter(h => {
    if (prio && h.priority !== prio) return false;
    if (q) {
      const hay = `${h.business_name || ''} ${h.website || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  dbHistPage = 1;
  renderDbHistory();
}

function renderDbHistory() {
  const total  = dbHistoryFiltered.length;
  const pages  = Math.max(1, Math.ceil(total / DB_PAGE));
  dbHistPage   = Math.min(dbHistPage, pages);
  const start  = (dbHistPage - 1) * DB_PAGE;
  const slice  = dbHistoryFiltered.slice(start, start + DB_PAGE);

  document.getElementById('db-hist-count').textContent =
    `${total} run${total !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('db-hist-tbody');
  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No audit history found.</td></tr>';
    renderDbHistPagination(0, 0);
    return;
  }

  tbody.innerHTML = slice.map(h => {
    const issue   = (h.top_issues || [])[0] || '';
    const website = h.website
      ? `<a class="tbl-link" href="${esc(h.website)}" target="_blank" rel="noopener"
              onclick="event.stopPropagation()">${SVG.extLink} ${esc(h.website.replace(/^https?:\/\//, '').substring(0,30))}</a>`
      : '<span style="color:#d1d5db;font-size:11px">none</span>';
    const reachDot = `<span class="status-dot ${h.reachable === false ? 'offline' : 'online'}" title="${h.reachable === false ? 'Unreachable' : 'Reachable'}"></span>`;
    return `<tr>
      <td style="font-weight:500">${esc((h.business_name || '(unnamed)').substring(0,32))}</td>
      <td>${website}</td>
      <td><strong>${h.score ?? '—'}</strong></td>
      <td><span class="tbl-prio tbl-prio-${h.priority}">${h.priority || '?'}</span></td>
      <td style="text-align:center">${reachDot}</td>
      <td style="font-size:11px;color:#6b7280" title="${esc(issue)}">${esc(issue.substring(0,45))}</td>
      <td style="white-space:nowrap;font-size:12px;color:#6b7280">${fmtDate(h.audited_at)}</td>
      <td>
        <button class="btn btn-ghost btn-sm report-btn" style="font-size:11px;gap:4px"
                onclick="openReport(${h.business_id})">${SVG.report}</button>
      </td>
    </tr>`;
  }).join('');

  renderDbHistPagination(dbHistPage, pages);
}

function renderDbHistPagination(page, pages) {
  const el = document.getElementById('db-hist-pagination');
  if (!el || pages <= 1) { if (el) el.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="dbHistGoPage(${page-1})" ${page<=1?'disabled':''}>‹</button>`;
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) {
      html += `<button class="page-btn${p===page?' active':''}" onclick="dbHistGoPage(${p})">${p}</button>`;
    } else if (Math.abs(p - page) === 3) {
      html += `<span class="page-ellipsis">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="dbHistGoPage(${page+1})" ${page>=pages?'disabled':''}>›</button>`;
  el.innerHTML = html;
}

function dbHistGoPage(p) {
  dbHistPage = p;
  renderDbHistory();
  document.getElementById('dbt-history')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchDbTab(tab, btn) {
  document.querySelectorAll('.db-subtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.db-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById(`dbt-${tab}`)?.classList.add('active');
}

function exportHistoryCSV() {
  const rows = dbHistoryFiltered;
  if (!rows.length) { toast('No data to export', ''); return; }
  const header = 'Business,Website,Score,Priority,Reachable,Top Issue,Audited At';
  const lines  = rows.map(h =>
    [h.business_name, h.website, h.score, h.priority,
     h.reachable, (h.top_issues||[])[0]||'', h.audited_at]
    .map(v => `"${String(v ?? '').replace(/"/g,'""')}"`)
    .join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `audit-history-${Date.now()}.csv`,
  });
  a.click();
}

/* ── Audit Report Modal ──────────────────────────────────────────────────────*/

const SIGNAL_LABELS = {
  https:            { label: 'HTTPS',             good: true  },
  ssl_valid:        { label: 'Valid SSL',          good: true  },
  mobile_friendly:  { label: 'Mobile-friendly',   good: true  },
  responsive_meta:  { label: 'Responsive Meta',   good: true  },
  has_meta_desc:    { label: 'Meta Description',  good: true  },
  has_title:        { label: 'Page Title',         good: true  },
  has_structured_data:{ label: 'Structured Data', good: true  },
  has_social_links: { label: 'Social Links',       good: true  },
  has_cta:          { label: 'Call-to-Action',     good: true  },
  reachable:        { label: 'Site Reachable',     good: true  },
  copyright_stale:  { label: 'Stale Copyright',    good: false },
  has_deprecated_tech:{ label: 'Deprecated Tech',  good: false },
  has_stale_blog:   { label: 'Stale Blog',         good: false },
  no_meta_desc:     { label: 'No Meta Desc',       good: false },
};

let reportBizId = null;

async function openReport(bizId) {
  reportBizId = bizId;
  const modal = document.getElementById('report-modal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Load latest report from cached businesses list
  const biz = allBusinesses.find(b => b.id === bizId);
  if (!biz) return;

  document.getElementById('report-biz-name').textContent = biz.name || '(unnamed)';
  const urlEl = document.getElementById('report-biz-url');
  urlEl.textContent = biz.website || '—';
  urlEl.href = biz.website || '#';

  renderLatestReport(biz.audit);

  // Switch to latest tab
  switchReportTab('latest', document.querySelector('.mtab-btn'));

  // Load history async
  loadAuditHistory(bizId);
}

function renderLatestReport(audit) {
  if (!audit) {
    document.getElementById('report-score-badge').textContent = 'No audit yet';
    document.getElementById('report-audited-at').textContent = '';
    document.getElementById('report-reachable').textContent = '';
    document.getElementById('report-issues').innerHTML = '<li>No audit data.</li>';
    document.getElementById('report-signals').innerHTML = '';
    return;
  }

  const badge = document.getElementById('report-score-badge');
  badge.textContent  = `Score: ${audit.score ?? '—'}  |  Priority ${audit.priority ?? '?'}`;
  badge.className    = `report-score-badge prio-${audit.priority || 'none'}`;

  document.getElementById('report-audited-at').textContent =
    audit.audited_at ? `Audited ${fmtDate(audit.audited_at)}` : '';
  document.getElementById('report-reachable').innerHTML =
    `<span class="status-dot ${audit.reachable === false ? 'offline' : 'online'}" style="margin-right:4px"></span>${audit.reachable === false ? 'Site unreachable' : 'Site reachable'}`;

  // Issues
  const issues = audit.top_issues || [];
  document.getElementById('report-issues').innerHTML = issues.length
    ? issues.map(i => `<li>${esc(i)}</li>`).join('')
    : '<li style="color:#6b7280">No critical issues detected.</li>';

  // Signals grid
  const signals = audit.signals || {};
  const entries = Object.entries(signals);
  if (!entries.length) {
    document.getElementById('report-signals').innerHTML = '<p style="color:#6b7280;font-size:13px">Signal data not available.</p>';
  } else {
    document.getElementById('report-signals').innerHTML = entries.map(([k, v]) => {
      const meta     = SIGNAL_LABELS[k] || { label: k.replace(/_/g,' '), good: true };
      const passing  = meta.good ? !!v : !v;
      const icon     = passing ? SVG.check : SVG.xMark;
      const labelCls = passing ? 'sig-pass' : 'sig-fail';
      return `<div class="sig-item ${labelCls}">
        <span class="sig-icon">${icon}</span>
        <span class="sig-label">${meta.label}</span>
      </div>`;
    }).join('');
  }

  // Error block
  const errBlock = document.getElementById('report-error-block');
  if (audit.audit_error) {
    errBlock.style.display = '';
    errBlock.innerHTML   = `<span style="display:inline-flex;align-items:center;gap:6px">${SVG.warning} Audit error: ${esc(audit.audit_error)}</span>`;
  } else {
    errBlock.style.display = 'none';
  }
}

async function loadAuditHistory(bizId) {
  document.getElementById('report-history-rows').innerHTML =
    '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:16px">Loading…</td></tr>';
  document.getElementById('report-history-empty').style.display = 'none';
  document.getElementById('report-history-chart').innerHTML     = '';

  try {
    const data = await api('GET', `/api/businesses/${bizId}/audits`);
    renderHistoryTab(data.history || []);
  } catch (_) {
    document.getElementById('report-history-rows').innerHTML =
      '<tr><td colspan="5" style="color:#dc2626;padding:12px">Failed to load history.</td></tr>';
  }
}

function renderHistoryTab(history) {
  const empty = document.getElementById('report-history-empty');
  const tbody = document.getElementById('report-history-rows');

  if (!history.length) {
    tbody.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  // Mini spark-line chart using inline SVG
  const scores  = [...history].reverse().map(h => h.score ?? 0);
  const maxS    = Math.max(...scores, 1);
  const W = 520, H = 60, pad = 6;
  const pts = scores.map((s, i) => {
    const x = pad + (i / Math.max(scores.length - 1, 1)) * (W - pad * 2);
    const y = H - pad - (s / maxS) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  document.getElementById('report-history-chart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="history-sparkline" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>
      ${scores.map((s, i) => {
        const x = pad + (i / Math.max(scores.length - 1, 1)) * (W - pad * 2);
        const y = H - pad - (s / maxS) * (H - pad * 2);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#2563eb"/>`;
      }).join('')}
    </svg>
    <div class="sparkline-label">Score trend (oldest → newest) · ${scores.length} run${scores.length !== 1 ? 's' : ''}</div>`;

  // Table rows
  tbody.innerHTML = history.map(h => {
    const issues = (h.top_issues || []).slice(0, 2).join('; ');
    const reachDot = `<span class="status-dot ${h.reachable === false ? 'offline' : 'online'}" title="${h.reachable === false ? 'Unreachable' : 'Reachable'}"></span>`;
    return `<tr>
      <td style="white-space:nowrap">${fmtDate(h.audited_at)}</td>
      <td><strong>${h.score ?? '—'}</strong></td>
      <td><span class="tbl-prio tbl-prio-${h.priority}">${h.priority || '?'}</span></td>
      <td style="text-align:center">${reachDot}</td>
      <td style="font-size:11px;color:#6b7280">${esc(issues || '—')}</td>
    </tr>`;
  }).join('');
}

function switchReportTab(tab, btn) {
  document.querySelectorAll('.mtab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mtab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById(`mtab-${tab}`)?.classList.add('active');
}

function closeReport(e) {
  if (e && e.target !== document.getElementById('report-modal')) return;
  document.getElementById('report-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

/* ── Boot ───────────────────────────────────────────────────────────────────*/
async function boot() {
  // Map is initialised lazily when the user first opens the Discover tab.
  try {
    const cfg = await api('GET', '/api/config');
    if (cfg.has_apify) document.getElementById('chk-apify').checked = true;
  } catch (_) {}
  refreshStats();
  // Pre-load all saved businesses — Clients tab is the landing page so this
  // populates it immediately without any user action.
  loadAllBusinesses();
}

document.addEventListener('DOMContentLoaded', boot);
