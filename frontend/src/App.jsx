import { useState, useCallback, useEffect, useRef } from 'react';
import { Users, Search, Database, Activity, Loader2, Moon, Sun } from 'lucide-react';
import ClientsTab    from './tabs/ClientsTab';
import DatabaseTab   from './tabs/DatabaseTab';
import DiscoverTab   from './tabs/DiscoverTab';
import ToastContainer, { toast } from './components/ui/Toast';
import { useBusinesses } from './hooks/useBusinesses';
import { fetchStats, fetchBusinesses, pollJob } from './api';

const TABS = [
  {
    id:    'clients',
    label: 'Clients',
    icon:  <Users size={15} />,
    title: 'Probable Clients',
    desc:  'Priority A first — ready for outreach',
  },
  {
    id:    'database',
    label: 'Database',
    icon:  <Database size={15} />,
    title: 'Full Database',
    desc:  'Browse, search and filter all records',
  },
  {
    id:    'discover',
    label: 'Discover',
    icon:  <Search size={15} />,
    title: 'Discover',
    desc:  'Search for new businesses and run audits',
  },
];

function StatPill({ value, label, urgent }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
      urgent ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-blue-800 text-blue-200 dark:bg-blue-950 dark:text-blue-300'
    }`}>
      <span className="font-bold">{value ?? '—'}</span>
      <span className="opacity-75">{label}</span>
    </div>
  );
}

function ThemeToggle({ dark, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-blue-800 dark:hover:bg-blue-950 transition-colors text-xs font-medium flex-shrink-0"
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
      <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
    </button>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('clients');
  const { businesses, loading, reload } = useBusinesses();
  const [stats, setStats] = useState(null);

  // ── Theme ────────────────────────────────────────────────────────────────
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('seo-hunter-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('seo-hunter-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const toggleTheme = useCallback(() => setDark(d => !d), []);

  // ── Job state lives here so polling survives tab switches ────────────────
  const [currentJob,   setCurrentJob]   = useState(null);
  const [jobBizList,   setJobBizList]   = useState([]);
  const pollRef = useRef(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
  }, []);

  const handleSearchStarted = useCallback((jobId, localityId) => {
    setCurrentJob({ status: 'pending' });
    setJobBizList([]);
    clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const j = await pollJob(jobId);
        setCurrentJob(j);

        if (['done', 'error'].includes(j.status)) {
          clearInterval(pollRef.current);
          if (j.status === 'done') {
            const res = await fetchBusinesses({ locality_id: localityId, limit: 1000 });
            const items = res.items || [];
            setJobBizList(items);
            reload();
            fetchStats().then(setStats).catch(() => {});
            toast(`Done — ${items.length} businesses found`, 'success');
          } else {
            toast('Search failed', 'error');
          }
        }
      } catch (_) {}
    }, 2000);
  }, [reload]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const goDiscover = useCallback(() => setActiveTab('discover'), []);

  const jobRunning = currentJob && !['done', 'error'].includes(currentJob.status);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden transition-colors duration-200">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-blue-900 dark:bg-gray-900 text-white px-4 shadow-md z-30 border-b border-blue-800 dark:border-gray-800">
        <div className="flex items-center h-12 gap-0">

          {/* Brand */}
          <div className="flex items-center gap-2.5 pr-5 border-r border-blue-800 dark:border-gray-700 flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-blue-700 dark:bg-blue-800 flex items-center justify-center">
              <Activity size={14} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight">SEO Hunter</span>
              <span className="text-[10px] text-blue-300 dark:text-gray-400 block leading-none">Local SEO</span>
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="flex h-full flex-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 h-12 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-amber-400 text-white font-semibold'
                    : 'border-transparent text-blue-300 dark:text-gray-400 hover:text-white hover:border-blue-500'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.id === 'discover' && jobRunning && activeTab !== 'discover' && (
                  <span className="ml-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                    <Loader2 size={9} className="animate-spin" />
                    Running
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Stats */}
          {stats && (
            <div className="hidden lg:flex items-center gap-2 ml-auto flex-shrink-0">
              <StatPill value={stats.total_businesses} label="businesses" />
              <StatPill value={stats.priority_a}       label="Priority A" urgent />
              <StatPill value={stats.localities}       label="localities" />
            </div>
          )}

          {/* Theme toggle */}
          <div className="ml-3 pl-3 border-l border-blue-800 dark:border-gray-700 flex-shrink-0">
            <ThemeToggle dark={dark} onToggle={toggleTheme} />
          </div>
        </div>
      </header>

      {/* ── Page title bar ──────────────────────────────────────────────────── */}
      {(() => {
        const tab = TABS.find(t => t.id === activeTab);
        return (
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100">{tab?.title}</h1>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">{tab?.desc}</p>
            </div>
            {currentJob && currentJob.status !== 'error' && (
              <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg ${
                currentJob.status === 'done'
                  ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
              }`}>
                {currentJob.status !== 'done' && (
                  <Loader2 size={12} className="animate-spin" />
                )}
                {currentJob.status === 'done'
                  ? `Done — ${jobBizList.length} businesses`
                  : currentJob.status === 'auditing'
                    ? `Auditing ${jobBizList.length} businesses…`
                    : currentJob.status === 'scraping'
                      ? 'Discovering businesses…'
                      : 'Starting search…'}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'clients' && (
          <ClientsTab
            businesses={businesses}
            loading={loading}
            reload={reload}
            onDiscover={goDiscover}
          />
        )}
        {activeTab === 'database' && (
          <DatabaseTab
            businesses={businesses}
            loading={loading}
            reload={reload}
          />
        )}
        {activeTab === 'discover' && (
          <DiscoverTab
            currentJob={currentJob}
            jobBizList={jobBizList}
            onSearchStarted={handleSearchStarted}
          />
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="flex-shrink-0 bg-blue-900 dark:bg-gray-900 border-t border-blue-800 dark:border-gray-800 px-5 py-2 flex items-center justify-between text-[11px] text-blue-300 dark:text-gray-500">
        <span>
          <span className="font-semibold text-white dark:text-gray-400">SEO Hunter</span>
          {' '}— Find local businesses with outdated websites
        </span>
        <span className="hidden sm:inline">Data: OpenStreetMap · Nominatim · Overpass API</span>
        <span>© {new Date().getFullYear()} SEO Hunter. All rights reserved.</span>
      </footer>

      <ToastContainer />
    </div>
  );
}
