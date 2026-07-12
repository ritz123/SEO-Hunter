import { useState, useMemo } from 'react';
import {
  Users, Search, Globe, Phone, MapPin, TrendingDown,
  AlertTriangle, ChevronRight, RefreshCw, Mail, CheckCircle2, XCircle,
} from 'lucide-react';
import PriorityBadge from '../components/ui/PriorityBadge';
import AuditReportModal from '../components/ui/AuditReportModal';

const PRIO_ORDER = { A: 0, B: 1, C: 2, null: 3, undefined: 3 };

// ── KPI strip ────────────────────────────────────────────────────────────────
const KPI_VARIANTS = {
  total:     'border-gray-200   bg-gray-50    text-gray-800',
  a:         'border-red-200    bg-red-50     text-red-700',
  b:         'border-amber-200  bg-amber-50   text-amber-700',
  c:         'border-green-200  bg-green-50   text-green-700',
  nosite:    'border-purple-200 bg-purple-50  text-purple-700',
  nocontact: 'border-rose-200   bg-rose-50    text-rose-700',
};

function KpiCard({ label, value, sub, variant }) {
  return (
    <div className={`flex flex-col items-center p-3 rounded-xl border flex-1 min-w-[80px] ${KPI_VARIANTS[variant]}`}>
      <span className="text-2xl font-extrabold font-mono leading-none">{value ?? '—'}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide mt-1 opacity-80">{label}</span>
      {sub && <span className="text-[9px] opacity-60 mt-0.5">{sub}</span>}
    </div>
  );
}

function KpiStrip({ businesses }) {
  const total     = businesses.length;
  const a         = businesses.filter(b => b.audit?.priority === 'A').length;
  const b         = businesses.filter(b => b.audit?.priority === 'B').length;
  const c         = businesses.filter(b => b.audit?.priority === 'C').length;
  const nosite    = businesses.filter(b => !b.website).length;
  const nocontact = businesses.filter(b => (b.contact_score ?? 0) === 0).length;

  return (
    <div className="flex gap-2 px-4 py-3 bg-white border-b border-gray-200 overflow-x-auto flex-shrink-0">
      <KpiCard label="All Clients"    value={total || '—'} variant="total" />
      <KpiCard label="Priority A"     value={a || '—'} sub="Most outdated" variant="a" />
      <KpiCard label="Priority B"     value={b || '—'} sub="Needs work"    variant="b" />
      <KpiCard label="Priority C"     value={c || '—'} sub="Decent site"   variant="c" />
      <KpiCard label="No Website"     value={nosite || '—'} sub="Highest need" variant="nosite" />
      <KpiCard label="No Contact Info" value={nocontact || '—'} sub="Unreachable" variant="nocontact" />
    </div>
  );
}

// ── Filter chips ─────────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'A',         label: 'Priority A' },
  { id: 'B',         label: 'Priority B' },
  { id: 'C',         label: 'Priority C' },
  { id: 'nosite',    label: 'No Website' },
  { id: 'nocontact', label: 'No Contact Info' },
];

const CHIP_ACTIVE = {
  all:       'bg-blue-800   border-blue-800   text-white',
  A:         'bg-red-600    border-red-600    text-white',
  B:         'bg-amber-500  border-amber-500  text-white',
  C:         'bg-green-600  border-green-600  text-white',
  nosite:    'bg-purple-600 border-purple-600 text-white',
  nocontact: 'bg-rose-600   border-rose-600   text-white',
};

// ── Contact dot ───────────────────────────────────────────────────────────────
function ContactDot({ has, title }) {
  return has
    ? <CheckCircle2 size={11} className="text-green-500" title={title} />
    : <XCircle      size={11} className="text-gray-200"  title={`Missing: ${title}`} />;
}

// ── Business card ─────────────────────────────────────────────────────────────
function BusinessCard({ biz, onClick }) {
  const audit = biz.audit;
  const issue = audit?.top_issues?.[0];

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate group-hover:text-blue-800 transition-colors">
            {biz.name}
          </h3>
          {biz.address && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
              <MapPin size={10} className="flex-shrink-0" />
              {biz.address}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <PriorityBadge priority={audit?.priority} />
          {audit?.score != null && (
            <span className="text-xs font-mono font-bold text-gray-600">{audit.score}</span>
          )}
          <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors" />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {biz.category && (
          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {biz.category}
          </span>
        )}
        {biz.website ? (
          <span className="text-[10px] text-blue-600 flex items-center gap-0.5">
            <Globe size={9} /> {biz.website.replace(/^https?:\/\//, '').split('/')[0]}
          </span>
        ) : (
          <span className="text-[10px] text-purple-600 font-medium flex items-center gap-0.5">
            <Globe size={9} /> No website
          </span>
        )}
        {biz.phone && (
          <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
            <Phone size={9} /> {biz.phone}
          </span>
        )}
        {biz.email && (
          <span className="text-[10px] text-gray-500 flex items-center gap-0.5 truncate max-w-[140px]">
            <Mail size={9} /> {biz.email}
          </span>
        )}
      </div>

      {/* Contact completeness indicator */}
      <div className="mt-2 flex items-center gap-1.5">
        <ContactDot has={!!biz.phone}   title="Phone" />
        <ContactDot has={!!biz.email}   title="Email" />
        <ContactDot has={!!biz.address} title="Address" />
        <ContactDot has={!!(biz.lat && biz.lng)} title="Geo-tag" />
        {(biz.contact_score ?? 0) === 0 && (
          <span className="text-[10px] text-rose-600 font-medium ml-1">No contact info</span>
        )}
      </div>

      {issue && (
        <div className="mt-2 flex items-start gap-1.5">
          <AlertTriangle size={10} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <span className="text-[11px] text-amber-700 line-clamp-1">{issue}</span>
        </div>
      )}
    </button>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onDiscover }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <Users size={28} className="text-gray-300" />
      </div>
      <h3 className="text-base font-bold text-gray-800 mb-2">No clients yet</h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-6 max-w-xs">
        Use <strong>Discover</strong> to search for local businesses and audit their websites.
        Priority&nbsp;A clients — the most outdated sites — will appear here first.
      </p>
      <button
        onClick={onDiscover}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 transition-colors"
      >
        <TrendingDown size={15} /> Open Discover
      </button>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function ClientsTab({ businesses, loading, reload, onDiscover }) {
  const [filter,  setFilter]  = useState('all');
  const [query,   setQuery]   = useState('');
  const [reportId, setReport] = useState(null);

  const filtered = useMemo(() => {
    let list = [...businesses].sort(
      (a, b) => (PRIO_ORDER[a.audit?.priority] ?? 3) - (PRIO_ORDER[b.audit?.priority] ?? 3)
    );

    if (filter === 'A')         list = list.filter(b => b.audit?.priority === 'A');
    else if (filter === 'B')    list = list.filter(b => b.audit?.priority === 'B');
    else if (filter === 'C')    list = list.filter(b => b.audit?.priority === 'C');
    else if (filter === 'nosite')    list = list.filter(b => !b.website);
    else if (filter === 'nocontact') list = list.filter(b => (b.contact_score ?? 0) === 0);

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(b =>
        b.name?.toLowerCase().includes(q) ||
        b.address?.toLowerCase().includes(q) ||
        b.category?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [businesses, filter, query]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* KPI strip */}
      <KpiStrip businesses={businesses} />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap flex-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                filter === f.id
                  ? CHIP_ACTIVE[f.id]
                  : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-56 flex-shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, category…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Reload */}
        <button
          onClick={reload}
          title="Refresh"
          className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>

        <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
          {filtered.length} client{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          businesses.length === 0
            ? <EmptyState onDiscover={onDiscover} />
            : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
                <Search size={24} className="mb-3 text-gray-300" />
                <p className="text-sm font-medium">No clients match these filters</p>
              </div>
            )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map(biz => (
              <BusinessCard key={biz.id} biz={biz} onClick={() => setReport(biz.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Audit report modal */}
      {reportId && (
        <AuditReportModal
          businessId={reportId}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  );
}
