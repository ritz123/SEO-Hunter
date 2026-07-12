import { useState, useRef, useCallback, useEffect } from 'react';
import {
  MapContainer, TileLayer, Marker, Popup, Circle, useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import {
  Search, ChevronDown, ChevronUp, Loader2, CheckCircle2,
  AlertTriangle, MapPin, RefreshCw, Trash2, RotateCcw,
  Plus, X, Settings2,
} from 'lucide-react';
import {
  geocode, geocodeSuggest, geocodeReverse,
  startSearch, fetchLocalities, deleteLocality,
  fetchCategories, createCategory, deleteCategory,
} from '../api';
import { toast } from '../components/ui/Toast';
import PriorityBadge from '../components/ui/PriorityBadge';
import AuditReportModal from '../components/ui/AuditReportModal';

// ── Custom marker icon factory ────────────────────────────────────────────────
const PRIO_COLORS = { A: '#dc2626', B: '#d97706', C: '#16a34a', null: '#9ca3af' };

function makeIcon(priority) {
  const col = PRIO_COLORS[priority] ?? PRIO_COLORS[null];
  const svg = `<svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M11 0C4.925 0 0 4.925 0 11C0 19.25 11 28 11 28C11 28 22 19.25 22 11C22 4.925 17.075 0 11 0Z" fill="${col}"/>
    <circle cx="11" cy="11" r="4.5" fill="white"/>
  </svg>`;
  return L.divIcon({
    className: '',
    html: svg,
    iconSize: [22, 28],
    iconAnchor: [11, 28],
  });
}

const PIN_ICON = L.divIcon({
  className: '',
  html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#1e40af"/>
    <circle cx="14" cy="14" r="6" fill="white"/>
  </svg>`,
  iconSize:   [28, 36],
  iconAnchor: [14, 36],
});

// ── Map click handler ─────────────────────────────────────────────────────────
function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: onMapClick });
  return null;
}


const STATUS_STEPS = ['pending','scraping','auditing','done','error'];

function StatusBar({ job, businesses }) {
  if (!job) return null;

  const pct = job.status === 'done' ? 100
    : job.status === 'scraping' ? 40
    : job.status === 'auditing' ? 75
    : job.status === 'error'    ? 100
    : 10;

  const color = job.status === 'error' ? 'bg-red-500'
    : job.status === 'done'  ? 'bg-green-500'
    : 'bg-blue-600';

  return (
    <div className="px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-700 capitalize flex items-center gap-1.5">
          {job.status === 'done' && <CheckCircle2 size={13} className="text-green-500" />}
          {job.status === 'error' && <AlertTriangle size={13} className="text-red-500" />}
          {['pending','scraping','auditing'].includes(job.status) && (
            <Loader2 size={13} className="text-blue-600 animate-spin" />
          )}
          {job.status === 'done'    ? `Done — ${businesses.length} business${businesses.length !== 1 ? 'es' : ''} found`
           : job.status === 'error'  ? (job.error_message || 'Search failed')
           : job.status === 'auditing' ? `Auditing ${businesses.length} businesses…`
           : job.status === 'scraping' ? 'Discovering businesses…'
           : 'Starting…'}
        </span>
        <span className="text-xs text-gray-400">{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color} ${
            pct < 100 && job.status !== 'error' ? 'progress-indeterminate' : ''
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function DiscoverTab({ currentJob, jobBizList, onSearchStarted }) {
  // Search form state
  const [location,  setLocation]  = useState('');
  const [category,  setCategory]  = useState('');
  const [radius,    setRadius]    = useState(5);
  const [selectedGeo, setGeo]     = useState(null);  // { lat, lng, display_name }
  const [suggests,  setSuggests]  = useState([]);
  const [sugTimer,  setSugTimer]  = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [categories, setCategories] = useState([]);
  const [catManage,  setCatManage]  = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Map
  const mapRef                    = useRef(null);
  const [pinPos,    setPinPos]    = useState(null);
  const [localities, setLocs]     = useState([]);
  const [reportId,  setReport]    = useState(null);
  const [selBiz,    setSelBiz]    = useState(null);

  // Derive businesses from the prop; fall back to empty while job is running
  const businesses = jobBizList ?? [];
  const job        = currentJob;

  useEffect(() => {
    fetchLocalities().then(setLocs).catch(() => {});
    fetchCategories().then(r => setCategories(r.categories || [])).catch(() => {});
  }, []);

  async function handleAddCategory(e) {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) return;
    try {
      const cat = await createCategory(name);
      setCategories(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCatName('');
      toast(`Category "${cat.name}" added`, 'success');
    } catch (err) {
      toast(err.message || 'Already exists', 'error');
    }
  }

  async function handleDeleteCategory(id, name) {
    await deleteCategory(id);
    setCategories(prev => prev.filter(c => c.id !== id));
    toast(`"${name}" removed`, 'info');
  }

  // ── Nominatim autocomplete ────────────────────────────────────────────────
  function onLocationInput(val) {
    setLocation(val);
    setGeo(null);
    clearTimeout(sugTimer);
    if (val.length < 2) { setSuggests([]); return; }
    setSugTimer(setTimeout(async () => {
      try {
        const res = await geocodeSuggest(val);
        setSuggests(res.slice ? res : []);
      } catch (_) {}
    }, 350));
  }

  function pickSuggest(s) {
    setLocation(s.display_name);
    setGeo({ lat: parseFloat(s.lat), lng: parseFloat(s.lon), display_name: s.display_name });
    setSuggests([]);
    if (mapRef.current) {
      mapRef.current.setView([parseFloat(s.lat), parseFloat(s.lon)], 13);
    }
    setPinPos([parseFloat(s.lat), parseFloat(s.lon)]);
  }

  // ── Map click ─────────────────────────────────────────────────────────────
  const onMapClick = useCallback(async (e) => {
    const { lat, lng } = e.latlng;
    setPinPos([lat, lng]);
    try {
      const res = await geocodeReverse(lat, lng);
      const name = res.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setGeo({ lat, lng, display_name: name });
      setLocation(name);
    } catch (_) {
      setGeo({ lat, lng, display_name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
      setLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
    toast('Pin set — fill in the form and click Search & Audit', 'info');
  }, []);

  // ── Start search ──────────────────────────────────────────────────────────
  async function handleSearch(e) {
    e.preventDefault();

    let geo = selectedGeo;
    if (!geo && location.trim()) {
      try {
        const res = await geocode(location.trim());
        if (res.found) {
          geo = { lat: res.lat, lng: res.lng, display_name: res.display_name };
          setPinPos([res.lat, res.lng]);
          mapRef.current?.setView([res.lat, res.lng], 13);
        } else {
          toast('Location not found — try a different name', 'error');
          return;
        }
      } catch (_) {
        toast('Geocoding failed — check your connection', 'error');
        return;
      }
    }

    if (!geo) { toast('Please enter or click a location', 'error'); return; }

    try {
      const res = await startSearch({
        locality_name: geo.display_name,
        lat:      geo.lat,
        lng:      geo.lng,
        radius_km: radius,
        category:  category || null,
      });
      setPanelOpen(false);
      onSearchStarted(res.job_id, res.locality_id);
      toast('Search started!', 'info');
      // Refresh locality list after a short delay
      setTimeout(() => fetchLocalities().then(setLocs).catch(() => {}), 1000);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleDeleteLocality(id, e) {
    e.stopPropagation();
    try {
      await deleteLocality(id);
      setLocs(l => l.filter(x => x.id !== id));
      toast('Locality deleted', 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleRerun(loc) {
    setLocation(loc.name || '');
    setGeo(loc.lat ? { lat: loc.lat, lng: loc.lng, display_name: loc.name } : null);
    setCategory(loc.category || '');
    setRadius(loc.radius_km || 5);
    setPinPos(loc.lat ? [loc.lat, loc.lng] : null);
    if (loc.lat && mapRef.current) mapRef.current.setView([loc.lat, loc.lng], 13);
    setPanelOpen(true);
    toast('Form pre-filled — click "Search & Audit" to re-run', 'info');
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-80 flex-shrink-0 flex flex-col bg-white border-r border-gray-200 overflow-hidden">

        {/* Search form (collapsible) */}
        <div className="border-b border-gray-200">
          <button
            onClick={() => setPanelOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Search size={14} />
              Search &amp; Audit
            </span>
            {panelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {panelOpen && (
            <form onSubmit={handleSearch} className="px-4 pb-4 space-y-3">
              {/* Location */}
              <div className="relative">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                  Location
                </label>
                <input
                  value={location}
                  onChange={e => onLocationInput(e.target.value)}
                  placeholder="City, area or click on map"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {suggests.length > 0 && (
                  <ul className="absolute z-[500] w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto text-xs">
                    {suggests.map((s, i) => (
                      <li
                        key={i}
                        onClick={() => pickSuggest(s)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer truncate"
                      >
                        {s.display_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    Business Category
                  </label>
                  <button
                    type="button"
                    onClick={() => setCatManage(v => !v)}
                    className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                      catManage ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-blue-600'
                    }`}
                    title="Manage categories"
                  >
                    <Settings2 size={10} /> Manage
                  </button>
                </div>

                {/* Combobox with datalist */}
                <div className="flex gap-1.5">
                  <input
                    list="cat-datalist"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="Type or pick a category…"
                    className="flex-1 text-xs px-2 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <datalist id="cat-datalist">
                    {categories.map(c => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>

                {/* Manage panel */}
                {catManage && (
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">
                    {/* Add new category */}
                    <form onSubmit={handleAddCategory} className="flex gap-1.5">
                      <input
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        placeholder="New category name…"
                        className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="submit"
                        disabled={!newCatName.trim()}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-800 text-white text-xs font-semibold hover:bg-blue-900 disabled:opacity-50 transition-colors"
                      >
                        <Plus size={11} /> Add
                      </button>
                    </form>

                    {/* Category list */}
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {categories.map(c => (
                        <div key={c.id} className="flex items-center justify-between px-2 py-1 rounded-lg bg-white border border-gray-100 hover:border-gray-200 group">
                          <span
                            className="text-xs text-gray-700 cursor-pointer hover:text-blue-700 flex-1"
                            onClick={() => { setCategory(c.name); setCatManage(false); }}
                          >
                            {c.name}
                          </span>
                          {c.is_default
                            ? <span className="text-[9px] text-gray-300 font-medium mr-1">default</span>
                            : (
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(c.id, c.name)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 transition-all"
                                title="Remove category"
                              >
                                <X size={11} />
                              </button>
                            )
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Radius */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                  Radius: <span className="text-blue-700 font-bold">{radius} km</span>
                </label>
                <input
                  type="range" min="1" max="50" value={radius}
                  onChange={e => setRadius(Number(e.target.value))}
                  className="w-full accent-blue-700"
                />
              </div>

              <button
                type="submit"
                disabled={job && !['done','error'].includes(job?.status)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-800 text-white text-sm font-semibold hover:bg-blue-900 disabled:opacity-50 transition-colors"
              >
                {job && !['done','error'].includes(job?.status)
                  ? <><Loader2 size={14} className="animate-spin" /> Running…</>
                  : <><Search size={14} /> Search &amp; Audit</>}
              </button>
            </form>
          )}
        </div>

        {/* Job progress */}
        {job && (
          <div className="flex-shrink-0">
            <StatusBar job={job} businesses={businesses} />
          </div>
        )}

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {businesses.length > 0 ? (
            <>
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                {businesses.length} results
              </div>
              {businesses.map(biz => (
                <button
                  key={biz.id}
                  onClick={() => setSelBiz(biz)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    selBiz?.id === biz.id ? 'bg-blue-50 border-l-2 border-l-blue-700' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-xs font-semibold text-gray-900 line-clamp-1">{biz.name}</span>
                    <PriorityBadge priority={biz.audit?.priority} />
                  </div>
                  {biz.audit?.top_issues?.[0] && (
                    <p className="text-[10px] text-amber-600 line-clamp-1">
                      {biz.audit.top_issues[0]}
                    </p>
                  )}
                </button>
              ))}
            </>
          ) : localities.length > 0 ? (
            <>
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                Past searches
              </div>
              {localities.map(loc => (
                <div key={loc.id} className="flex items-center gap-1 px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{loc.name}</p>
                    {loc.category && (
                      <p className="text-[10px] text-gray-400">{loc.category} · {loc.radius_km} km</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRerun(loc)}
                    title="Re-run" className="p-1 text-gray-400 hover:text-blue-700 transition-colors"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    onClick={e => handleDeleteLocality(loc.id, e)}
                    title="Delete" className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center text-gray-400 px-6">
              <MapPin size={24} className="mb-3 text-gray-300" />
              <p className="text-xs font-medium">Enter a location above and click</p>
              <p className="text-xs">Search &amp; Audit to find businesses</p>
            </div>
          )}
        </div>

        {/* Selected business quick detail */}
        {selBiz && (
          <div className="border-t border-gray-200 bg-gray-50 p-3 flex-shrink-0">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="text-xs font-bold text-gray-900 line-clamp-2 flex-1">{selBiz.name}</span>
              <button onClick={() => setSelBiz(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <PriorityBadge priority={selBiz.audit?.priority} />
              <button
                onClick={() => setReport(selBiz.id)}
                className="text-[10px] px-2 py-0.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
              >
                View Report
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* ── Map ──────────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          className="h-full w-full"
          ref={mapRef}
          zoomControl
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <MapClickHandler onMapClick={onMapClick} />

          {/* Search origin pin */}
          {pinPos && (
            <>
              <Marker position={pinPos} icon={PIN_ICON}>
                <Popup>Search origin</Popup>
              </Marker>
              <Circle
                center={pinPos}
                radius={radius * 1000}
                pathOptions={{ color: '#1e40af', weight: 1.5, fillOpacity: 0.06 }}
              />
            </>
          )}

          {/* Business markers */}
          {businesses.map(biz => biz.lat && biz.lng ? (
            <Marker
              key={biz.id}
              position={[biz.lat, biz.lng]}
              icon={makeIcon(biz.audit?.priority ?? null)}
              eventHandlers={{ click: () => setSelBiz(biz) }}
            >
              <Popup>
                <div className="text-xs">
                  <strong>{biz.name}</strong>
                  {biz.audit?.priority && (
                    <span className={`ml-1 px-1 py-0.5 rounded text-[9px] font-bold
                      ${biz.audit.priority === 'A' ? 'bg-red-100 text-red-700' :
                        biz.audit.priority === 'B' ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'}`}>
                      {biz.audit.priority}
                    </span>
                  )}
                  <br/>{biz.address}
                  {biz.website && <><br/><a href={biz.website} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600">{biz.website}</a></>}
                </div>
              </Popup>
            </Marker>
          ) : null)}
        </MapContainer>

        {/* Map legend */}
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur rounded-lg border border-gray-200 shadow-md px-3 py-2 text-[10px] z-[400]">
          <div className="font-bold text-gray-600 mb-1 uppercase tracking-wide">Priority</div>
          {[['A','bg-red-500'],['B','bg-amber-400'],['C','bg-green-500'],['?','bg-gray-400']].map(([p,c]) => (
            <div key={p} className="flex items-center gap-1.5 mb-0.5">
              <div className={`w-2.5 h-2.5 rounded-full ${c}`} />
              <span className="text-gray-600">{p === '?' ? 'Unaudited' : `Priority ${p}`}</span>
            </div>
          ))}
        </div>
      </div>

      {reportId && (
        <AuditReportModal businessId={reportId} onClose={() => setReport(null)} />
      )}
    </div>
  );
}
