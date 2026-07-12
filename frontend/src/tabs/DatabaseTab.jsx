import { useState, useMemo, useEffect } from 'react';
import {
  Search, ChevronUp, ChevronDown, ChevronsUpDown,
  Download, RefreshCw, ExternalLink, FileText,
} from 'lucide-react';
import PriorityBadge from '../components/ui/PriorityBadge';
import AuditReportModal from '../components/ui/AuditReportModal';

const PAGE_SIZE = 30;
const PRIO_ORDER = { A: 0, B: 1, C: 2 };

function SortIcon({ col, current, dir }) {
  if (current !== col) return <ChevronsUpDown size={11} className="text-gray-300" />;
  return dir === 'asc'
    ? <ChevronUp size={11} className="text-blue-700" />
    : <ChevronDown size={11} className="text-blue-700" />;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'2-digit' });
}

function exportCsv(rows) {
  const header = ['Name','Category','Address','Priority','Score','Website','Phone','Last Audit','Top Issue'];
  const lines = rows.map(b => [
    b.name, b.category, b.address,
    b.audit?.priority ?? '',
    b.audit?.score ?? '',
    b.website ?? '',
    b.phone ?? '',
    b.audit?.audited_at ? formatDate(b.audit.audited_at) : '',
    b.audit?.top_issues?.[0] ?? '',
  ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'seo-hunter-clients.csv'; a.click();
  URL.revokeObjectURL(url);
}

const COLS = [
  { key: 'name',     label: 'Business',  sortable: true },
  { key: 'category', label: 'Category',  sortable: true },
  { key: 'priority', label: 'Priority',  sortable: true },
  { key: 'score',    label: 'Score',     sortable: true },
  { key: 'website',  label: 'Website',   sortable: false },
  { key: 'audited',  label: 'Audited',   sortable: true },
  { key: 'issue',    label: 'Top Issue',  sortable: false },
  { key: 'actions',  label: '',          sortable: false },
];

export default function DatabaseTab({ businesses, loading, reload }) {
  const [query,    setQuery]    = useState('');
  const [priority, setPriority] = useState('');
  const [hasWeb,   setHasWeb]   = useState('');
  const [sortCol,  setSortCol]  = useState('priority');
  const [sortDir,  setSortDir]  = useState('asc');
  const [page,     setPage]     = useState(1);
  const [reportId, setReport]   = useState(null);

  // Reset to page 1 when filters change
  useEffect(() => setPage(1), [query, priority, hasWeb, sortCol, sortDir]);

  const filtered = useMemo(() => {
    let list = [...businesses];

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(b =>
        b.name?.toLowerCase().includes(q) ||
        b.address?.toLowerCase().includes(q) ||
        b.category?.toLowerCase().includes(q) ||
        b.website?.toLowerCase().includes(q)
      );
    }
    if (priority) list = list.filter(b => b.audit?.priority === priority);
    if (hasWeb === 'yes') list = list.filter(b => !!b.website);
    if (hasWeb === 'no')  list = list.filter(b => !b.website);

    list.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'priority':
          va = PRIO_ORDER[a.audit?.priority] ?? 9;
          vb = PRIO_ORDER[b.audit?.priority] ?? 9;
          break;
        case 'score':
          va = a.audit?.score ?? -1;
          vb = b.audit?.score ?? -1;
          break;
        case 'audited':
          va = a.audit?.audited_at ?? '';
          vb = b.audit?.audited_at ?? '';
          break;
        case 'category':
          va = a.category ?? '';
          vb = b.category ?? '';
          break;
        default:
          va = a.name ?? '';
          vb = b.name ?? '';
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

    return list;
  }, [businesses, query, priority, hasWeb, sortCol, sortDir]);

  const pages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice    = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, address, website…"
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Priority filter */}
        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="text-xs rounded-lg border border-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All priorities</option>
          <option value="A">Priority A</option>
          <option value="B">Priority B</option>
          <option value="C">Priority C</option>
        </select>

        {/* Website filter */}
        <select
          value={hasWeb}
          onChange={e => setHasWeb(e.target.value)}
          className="text-xs rounded-lg border border-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All sites</option>
          <option value="yes">Has website</option>
          <option value="no">No website</option>
        </select>

        <div className="flex gap-1.5 ml-auto flex-shrink-0">
          <button
            onClick={reload}
            className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => exportCsv(filtered)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
            title="Export CSV"
          >
            <Download size={12} /> CSV
          </button>
        </div>

        <span className="text-xs text-gray-400 self-center">
          {filtered.length.toLocaleString()} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-sm text-gray-400">
            <RefreshCw size={18} className="animate-spin mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
            <Search size={22} className="mb-2 text-gray-300" />
            {businesses.length === 0
              ? 'No data in database — run a Discover search first'
              : 'No records match the current filters'}
          </div>
        ) : (
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                {COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && toggleSort(col.key)}
                    className={`px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-gray-200 ${
                      col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && <SortIcon col={col.key} current={sortCol} dir={sortDir} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slice.map(biz => (
                <tr
                  key={biz.id}
                  className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  onClick={() => setReport(biz.id)}
                >
                  <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[180px]">
                    <span className="block truncate group-hover:text-blue-800 transition-colors">
                      {biz.name}
                    </span>
                    {biz.address && (
                      <span className="block text-[10px] text-gray-400 truncate">{biz.address}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 max-w-[120px]">
                    <span className="block truncate">{biz.category || '—'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <PriorityBadge priority={biz.audit?.priority} />
                  </td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-gray-700 text-center">
                    {biz.audit?.score ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 max-w-[140px]">
                    {biz.website ? (
                      <a
                        href={biz.website.startsWith('http') ? biz.website : 'https://' + biz.website}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 truncate"
                      >
                        <ExternalLink size={9} />
                        {biz.website.replace(/^https?:\/\//, '').split('/')[0]}
                      </a>
                    ) : (
                      <span className="text-purple-500">No website</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                    {biz.audit?.audited_at ? formatDate(biz.audit.audited_at) : '—'}
                  </td>
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <span className="block truncate text-gray-500">
                      {biz.audit?.top_issues?.[0] ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setReport(biz.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded border border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-700 transition-colors"
                      title="View audit report"
                    >
                      <FileText size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-gray-200 flex-shrink-0">
          <span className="text-xs text-gray-500">
            Page {safePage} of {pages} · {filtered.length} total
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-100 transition-colors"
            >«</button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-100 transition-colors"
            >‹</button>
            {Array.from({ length: Math.min(5, pages) }, (_, i) => {
              const p = Math.max(1, Math.min(pages - 4, safePage - 2)) + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    p === safePage
                      ? 'bg-blue-800 border-blue-800 text-white'
                      : 'border-gray-300 hover:bg-gray-100'
                  }`}
                >{p}</button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={safePage === pages}
              className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-100 transition-colors"
            >›</button>
            <button
              onClick={() => setPage(pages)}
              disabled={safePage === pages}
              className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-30 hover:bg-gray-100 transition-colors"
            >»</button>
          </div>
        </div>
      )}

      {reportId && (
        <AuditReportModal businessId={reportId} onClose={() => setReport(null)} />
      )}
    </div>
  );
}
