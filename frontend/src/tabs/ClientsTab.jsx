import { useState, useMemo } from 'react';
import {
  Users, Search, Globe, Phone, MapPin, TrendingDown,
  AlertTriangle, ChevronRight, RefreshCw, Mail, CheckCircle2,
  XCircle, ShieldAlert, Wifi, WifiOff,
} from 'lucide-react';
import PriorityBadge from '../components/ui/PriorityBadge';
import AuditReportModal from '../components/ui/AuditReportModal';

const PRIO_ORDER = { A: 0, B: 1, C: 2, null: 3, undefined: 3 };

// ── Priority accent colours ───────────────────────────────────────────────────
const PRIO_ACCENT = {
  A: 'border-l-red-500',
  B: 'border-l-amber-400',
  C: 'border-l-green-500',
};

const PRIO_SCORE_RING = {
  A: 'text-red-600   dark:text-red-400',
  B: 'text-amber-500 dark:text-amber-400',
  C: 'text-green-600 dark:text-green-400',
};

// ── KPI strip ────────────────────────────────────────────────────────────────
const KPI_VARIANTS = {
  total:     'border-gray-200   bg-gray-50    text-gray-800   dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200',
  a:         'border-red-200    bg-red-50     text-red-700    dark:border-red-800  dark:bg-red-950/50 dark:text-red-400',
  b:         'border-amber-200  bg-amber-50   text-amber-700  dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400',
  c:         'border-green-200  bg-green-50   text-green-700  dark:border-green-800 dark:bg-green-950/50 dark:text-green-400',
  nosite:    'border-purple-200 bg-purple-50  text-purple-700 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-400',
  nocontact: 'border-rose-200   bg-rose-50    text-rose-700   dark:border-rose-800  dark:bg-rose-950/50  dark:text-rose-400',
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
    <div className="flex gap-2 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 overflow-x-auto flex-shrink-0">
      <KpiCard label="All Clients"     value={total || '—'} variant="total" />
      <KpiCard label="Priority A"      value={a || '—'} sub="Most outdated" variant="a" />
      <KpiCard label="Priority B"      value={b || '—'} sub="Needs work"    variant="b" />
      <KpiCard label="Priority C"      value={c || '—'} sub="Decent site"   variant="c" />
      <KpiCard label="No Website"      value={nosite || '—'} sub="Highest need" variant="nosite" />
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
  all:       'bg-blue-800   border-blue-800   text-white dark:bg-blue-700 dark:border-blue-700',
  A:         'bg-red-600    border-red-600    text-white',
  B:         'bg-amber-500  border-amber-500  text-white',
  C:         'bg-green-600  border-green-600  text-white',
  nosite:    'bg-purple-600 border-purple-600 text-white',
  nocontact: 'bg-rose-600   border-rose-600   text-white',
};

// ── Score ring (SVG) ──────────────────────────────────────────────────────────
function ScoreRing({ score, priority }) {
  const max   = 15;
  const pct   = Math.min((score ?? 0) / max, 1);
  const r     = 16;
  const circ  = 2 * Math.PI * r;
  const dash  = pct * circ;

  const trackCls = 'stroke-gray-200 dark:stroke-gray-700';
  const fillCls  = {
    A: 'stroke-red-500',
    B: 'stroke-amber-400',
    C: 'stroke-green-500',
  }[priority] ?? 'stroke-gray-400';

  return (
    <div className="relative flex-shrink-0 w-10 h-10">
      <svg viewBox="0 0 40 40" className="w-10 h-10 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className={trackCls} />
        <circle
          cx="20" cy="20" r={r} fill="none" strokeWidth="4"
          className={fillCls}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-extrabold font-mono ${
        PRIO_SCORE_RING[priority] ?? 'text-gray-500 dark:text-gray-400'
      }`}>
        {score ?? '?'}
      </span>
    </div>
  );
}

// ── Contact dot ───────────────────────────────────────────────────────────────
function ContactDot({ has, title }) {
  return has
    ? <CheckCircle2 size={11} className="text-green-500" title={title} />
    : <XCircle      size={11} className="text-gray-300 dark:text-gray-600" title={`Missing: ${title}`} />;
}

// ── Business card ─────────────────────────────────────────────────────────────
function BusinessCard({ biz, onClick }) {
  const audit    = biz.audit;
  const priority = audit?.priority;
  const score    = audit?.score;
  const issue    = audit?.top_issues?.[0];
  const hasWebsite = !!biz.website;
  const accentBorder = PRIO_ACCENT[priority] ?? 'border-l-gray-300 dark:border-l-gray-600';

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left rounded-xl border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800
        border-l-4 ${accentBorder}
        p-4 hover:shadow-lg dark:hover:shadow-black/30
        hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-600
        transition-all duration-150 group
      `}
    >
      {/* Row 1 — name + score ring */}
      <div className="flex items-start gap-3 mb-3">
        <ScoreRing score={score} priority={priority} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-snug truncate group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
              {biz.name}
            </h3>
            <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-400 transition-colors flex-shrink-0 mt-0.5" />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <PriorityBadge priority={priority} />
            {biz.category && (
              <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                {biz.category}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 2 — address + website */}
      <div className="space-y-1 mb-3">
        {biz.address && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 truncate">
            <MapPin size={10} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
            {biz.address}
          </p>
        )}
        {hasWebsite ? (
          <p className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1.5 truncate">
            <Wifi size={10} className="flex-shrink-0" />
            {biz.website.replace(/^https?:\/\//, '').split('/')[0]}
          </p>
        ) : (
          <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1.5">
            <WifiOff size={10} className="flex-shrink-0" />
            No website
          </p>
        )}
        {biz.phone && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Phone size={10} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
            {biz.phone}
          </p>
        )}
        {biz.email && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 truncate">
            <Mail size={10} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
            {biz.email}
          </p>
        )}
      </div>

      {/* Row 3 — contact completeness */}
      <div className="flex items-center gap-1.5 pb-2.5 border-b border-gray-100 dark:border-gray-700/50">
        <ContactDot has={!!biz.phone}              title="Phone" />
        <ContactDot has={!!biz.email}              title="Email" />
        <ContactDot has={!!biz.address}            title="Address" />
        <ContactDot has={!!(biz.lat && biz.lng)}   title="Geo-tag" />
        {(biz.contact_score ?? 0) === 0 && (
          <span className="text-[10px] text-rose-500 dark:text-rose-400 font-medium ml-1">No contact info</span>
        )}
      </div>

      {/* Row 4 — top issue */}
      {issue ? (
        <div className="mt-2.5 flex items-start gap-1.5 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2.5 py-1.5">
          <AlertTriangle size={11} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <span className="text-[11px] text-amber-700 dark:text-amber-400 line-clamp-2 leading-snug">{issue}</span>
        </div>
      ) : !hasWebsite ? (
        <div className="mt-2.5 flex items-start gap-1.5 bg-purple-50 dark:bg-purple-950/40 rounded-lg px-2.5 py-1.5">
          <ShieldAlert size={11} className="text-purple-500 mt-0.5 flex-shrink-0" />
          <span className="text-[11px] text-purple-700 dark:text-purple-400 leading-snug">No online presence — high priority prospect</span>
        </div>
      ) : (
        <div className="mt-2.5 h-6" />
      )}
    </button>
  );
}

// ── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 border-l-gray-200 dark:border-l-gray-700 p-4 space-y-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          <div className="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-1/3" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-full" />
        <div className="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-2/3" />
      </div>
      <div className="h-7 bg-gray-100 dark:bg-gray-700/50 rounded-lg" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onDiscover }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Users size={28} className="text-gray-300 dark:text-gray-600" />
      </div>
      <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-2">No clients yet</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6 max-w-xs">
        Use <strong>Discover</strong> to search for local businesses and audit their websites.
        Priority&nbsp;A clients — the most outdated sites — will appear here first.
      </p>
      <button
        onClick={onDiscover}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-800 dark:bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 dark:hover:bg-blue-600 transition-colors"
      >
        <TrendingDown size={15} /> Open Discover
      </button>
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function ClientsTab({ businesses, loading, reload, onDiscover }) {
  const [filter,   setFilter]  = useState('all');
  const [query,    setQuery]   = useState('');
  const [reportId, setReport]  = useState(null);

  const filtered = useMemo(() => {
    let list = [...businesses].sort(
      (a, b) => (PRIO_ORDER[a.audit?.priority] ?? 3) - (PRIO_ORDER[b.audit?.priority] ?? 3)
    );

    if (filter === 'A')              list = list.filter(b => b.audit?.priority === 'A');
    else if (filter === 'B')         list = list.filter(b => b.audit?.priority === 'B');
    else if (filter === 'C')         list = list.filter(b => b.audit?.priority === 'C');
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
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* KPI strip */}
      <KpiStrip businesses={businesses} />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap flex-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                filter === f.id
                  ? CHIP_ACTIVE[f.id]
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-blue-400 hover:text-blue-700 dark:hover:border-blue-500 dark:hover:text-blue-400'
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
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Reload */}
        <button
          onClick={reload}
          title="Refresh"
          className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>

        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 hidden sm:block">
          {filtered.length} client{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          businesses.length === 0
            ? <EmptyState onDiscover={onDiscover} />
            : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400 dark:text-gray-600">
                <Search size={24} className="mb-3 text-gray-300 dark:text-gray-700" />
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
