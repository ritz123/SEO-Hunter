import { useEffect, useState } from 'react';
import {
  X, ExternalLink, RotateCcw, CheckCircle2, XCircle,
  AlertTriangle, Globe, Smartphone, Lock, Gauge, Clock,
  Search, Wrench, FileText, Star, Phone, MapPin, Tag, Mail,
} from 'lucide-react';
import { fetchBusiness, fetchAuditHistory, reauditBusiness } from '../../api';
import { toast } from './Toast';
import PriorityBadge from './PriorityBadge';

// ── Signal metadata ──────────────────────────────────────────────────────────

const SIGNAL_META = {
  // Reachability & HTTPS
  broken_home_page:        { label: 'Broken Home Page',          desc: 'Home page is unreachable (5xx / timeout / DNS failure)' },
  no_https:                { label: 'No HTTPS',                  desc: 'Site does not redirect to HTTPS' },
  ssl_invalid_or_expired:  { label: 'SSL Invalid / Expired',     desc: 'SSL certificate is invalid, self-signed, or expired' },
  // Security headers
  missing_hsts:            { label: 'No HSTS Header',            desc: 'Missing Strict-Transport-Security — vulnerable to SSL-stripping' },
  missing_xframe:          { label: 'No X-Frame-Options',        desc: 'Missing clickjacking protection (X-Frame-Options / frame-ancestors)' },
  missing_csp:             { label: 'No Content-Security-Policy',desc: 'Missing CSP header — XSS attacks not mitigated' },
  missing_xcto:            { label: 'No X-Content-Type-Options', desc: 'Missing nosniff header — MIME-sniffing risk' },
  missing_referrer_policy: { label: 'No Referrer-Policy',        desc: 'Referrer information leaks to third-party sites' },
  // Security hygiene
  exposed_sensitive_path:  { label: 'Sensitive Path Exposed',    desc: 'Critical file accessible (/.env, /.git/HEAD, phpinfo.php, etc.)' },
  mixed_content:           { label: 'Mixed Content',             desc: 'HTTP resources loaded on HTTPS page — marked as insecure' },
  cms_version_exposed:     { label: 'CMS Version Exposed',       desc: 'CMS or server version visible in source/headers — aids attackers' },
  // Mobile & performance
  no_meta_viewport:        { label: 'No Viewport Tag',           desc: 'Missing meta viewport — not optimised for mobile' },
  fails_mobile_friendly:   { label: 'Not Mobile Friendly',       desc: 'Site fails mobile-friendly criteria (no viewport)' },
  pagespeed_score_low:     { label: 'Slow PageSpeed',            desc: 'Google PageSpeed score below 50 (mobile)' },
  // SEO basics
  missing_title:           { label: 'Missing Title Tag',         desc: 'Page <title> tag is absent or empty' },
  missing_meta_description:{ label: 'Missing Meta Description',  desc: 'Meta description tag is absent' },
  no_structured_data:      { label: 'No Structured Data',        desc: 'No JSON-LD or Microdata schema markup found' },
  not_indexed:             { label: 'Not Indexed',               desc: 'Site appears to not be indexed by Google' },
  // Content freshness
  copyright_year_old:      { label: 'Outdated Copyright',        desc: 'Footer copyright year is 2+ years behind' },
  stale_blog:              { label: 'Stale Content',             desc: 'Most recent blog/news post is 2+ years old' },
  wayback_stale:           { label: 'Stale Wayback Snapshot',    desc: 'Last archived snapshot is 2+ years old' },
  // Technical
  deprecated_tech:         { label: 'Deprecated Technology',     desc: 'Uses deprecated tech (Flash, Frames, old jQuery, etc.)' },
  broken_nav_links:        { label: 'Broken Nav Links',          desc: 'One or more navigation links return errors' },
  no_social_links:         { label: 'No Social Links',           desc: 'No social media profile links found on the page' },
  no_cta:                  { label: 'No Call-to-Action',         desc: 'No contact forms or CTA buttons detected' },
};

const CATEGORIES = [
  {
    id: 'reachability', label: 'Reachability & HTTPS', Icon: Lock,
    color: 'red',
    signals: ['broken_home_page', 'no_https', 'ssl_invalid_or_expired'],
  },
  {
    id: 'security', label: 'Security Headers', Icon: Lock,
    color: 'pink',
    signals: ['missing_hsts', 'missing_xframe', 'missing_csp', 'missing_xcto', 'missing_referrer_policy'],
  },
  {
    id: 'hygiene', label: 'Security Hygiene', Icon: Wrench,
    color: 'rose',
    signals: ['exposed_sensitive_path', 'mixed_content', 'cms_version_exposed'],
  },
  {
    id: 'mobile', label: 'Mobile & Performance', Icon: Smartphone,
    color: 'orange',
    signals: ['no_meta_viewport', 'fails_mobile_friendly', 'pagespeed_score_low'],
  },
  {
    id: 'seo', label: 'SEO Basics', Icon: Search,
    color: 'blue',
    signals: ['missing_title', 'missing_meta_description', 'no_structured_data', 'not_indexed'],
  },
  {
    id: 'content', label: 'Content Freshness', Icon: Clock,
    color: 'amber',
    signals: ['copyright_year_old', 'stale_blog', 'wayback_stale'],
  },
  {
    id: 'technical', label: 'Technical', Icon: Wrench,
    color: 'purple',
    signals: ['deprecated_tech', 'broken_nav_links', 'no_social_links', 'no_cta'],
  },
];

const CAT_COLORS = {
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    icon: 'text-red-500',    pill: 'bg-red-100 text-red-700' },
  pink:   { bg: 'bg-pink-50',   border: 'border-pink-200',   icon: 'text-pink-500',   pill: 'bg-pink-100 text-pink-700' },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',   icon: 'text-rose-500',   pill: 'bg-rose-100 text-rose-700' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-500', pill: 'bg-orange-100 text-orange-700' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   icon: 'text-blue-500',   pill: 'bg-blue-100 text-blue-700' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'text-amber-500',  pill: 'bg-amber-100 text-amber-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', icon: 'text-purple-500', pill: 'bg-purple-100 text-purple-700' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function ScoreRing({ score, size = 80 }) {
  if (score == null) return <span className="text-gray-400 text-sm">—</span>;
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626';
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>
        {score}
      </text>
    </svg>
  );
}

// ── Print/export ─────────────────────────────────────────────────────────────

function generatePrintReport(biz, audit) {
  const signals = audit?.signals || {};
  const raw = audit?.raw || {};
  const issues = audit?.top_issues || [];
  const priorityColors = { A: '#dc2626', B: '#d97706', C: '#16a34a' };
  const pColor = priorityColors[audit?.priority] || '#6b7280';

  const sigRows = CATEGORIES.map(cat => {
    const rows = cat.signals.map(key => {
      const present = signals[key];
      const meta = SIGNAL_META[key] || { label: key, desc: '' };
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${meta.label}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">${meta.desc}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center">
          ${present
            ? '<span style="color:#dc2626;font-weight:600">✗ Issue</span>'
            : '<span style="color:#16a34a;font-weight:600">✓ Pass</span>'}
        </td>
      </tr>`;
    }).join('');
    return `<tr><td colspan="3" style="padding:8px 12px;background:#f9fafb;font-size:12px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.05em">${cat.label}</td></tr>${rows}`;
  }).join('');

  const metaRows = [
    raw.pagespeed_score != null && raw.pagespeed_score !== -1 && `<tr><td style="padding:5px 12px;font-size:13px;color:#374151;width:220px">PageSpeed Score</td><td style="padding:5px 12px;font-size:13px;font-weight:600">${raw.pagespeed_score}</td></tr>`,
    raw.copyright_year && `<tr><td style="padding:5px 12px;font-size:13px;color:#374151">Copyright Year Detected</td><td style="padding:5px 12px;font-size:13px;font-weight:600">${raw.copyright_year}</td></tr>`,
    raw.wayback_last_snapshot && `<tr><td style="padding:5px 12px;font-size:13px;color:#374151">Last Wayback Snapshot</td><td style="padding:5px 12px;font-size:13px;font-weight:600">${raw.wayback_last_snapshot}</td></tr>`,
    raw.latest_blog_year && `<tr><td style="padding:5px 12px;font-size:13px;color:#374151">Latest Blog Post Year</td><td style="padding:5px 12px;font-size:13px;font-weight:600">${raw.latest_blog_year}</td></tr>`,
    raw.cms_version && `<tr><td style="padding:5px 12px;font-size:13px;color:#374151">CMS / Server Version</td><td style="padding:5px 12px;font-size:13px;font-weight:600;color:#dc2626">${raw.cms_version}</td></tr>`,
    raw.exposed_paths?.length && `<tr><td style="padding:5px 12px;font-size:13px;color:#374151">Exposed Sensitive Paths</td><td style="padding:5px 12px;font-size:13px;font-weight:600;color:#dc2626">${raw.exposed_paths.join(', ')}</td></tr>`,
  ].filter(Boolean).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>SEO Audit Report — ${biz.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; margin: 0; padding: 32px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; margin: 24px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #1e40af">
    <div>
      <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">SEO Audit Report · SEO Hunter</div>
      <h1>${biz.name}</h1>
      ${biz.address ? `<div style="font-size:13px;color:#6b7280;margin-top:2px">${biz.address}</div>` : ''}
      ${biz.website ? `<div style="font-size:13px;margin-top:2px"><a href="${biz.website}" style="color:#1e40af">${biz.website}</a></div>` : ''}
    </div>
    <div style="text-align:center">
      <div style="font-size:36px;font-weight:800;color:${pColor}">${audit?.score ?? '—'}</div>
      <div style="font-size:11px;color:#6b7280">Score</div>
      <div style="margin-top:4px;display:inline-block;padding:3px 10px;border-radius:20px;background:${pColor};color:#fff;font-size:12px;font-weight:700">Priority ${audit?.priority ?? '—'}</div>
    </div>
  </div>

  <h2>Business Details</h2>
  <table>
    ${biz.phone ? `<tr><td style="padding:5px 12px;font-size:13px;color:#374151;width:180px">Phone</td><td style="padding:5px 12px;font-size:13px;font-weight:600">${biz.phone}</td></tr>` : ''}
    ${biz.category ? `<tr><td style="padding:5px 12px;font-size:13px;color:#374151">Category</td><td style="padding:5px 12px;font-size:13px;font-weight:600">${biz.category}</td></tr>` : ''}
    ${biz.rating ? `<tr><td style="padding:5px 12px;font-size:13px;color:#374151">Rating</td><td style="padding:5px 12px;font-size:13px;font-weight:600">${biz.rating} / 5 (${biz.review_count ?? 0} reviews)</td></tr>` : ''}
    ${audit?.audited_at ? `<tr><td style="padding:5px 12px;font-size:13px;color:#374151">Audited</td><td style="padding:5px 12px;font-size:13px;font-weight:600">${formatDate(audit.audited_at)}</td></tr>` : ''}
  </table>

  ${issues.length > 0 ? `
  <h2>Top Issues</h2>
  <ul style="margin:0;padding:0 0 0 20px">
    ${issues.map(i => `<li style="font-size:13px;color:#374151;padding:3px 0">${i}</li>`).join('')}
  </ul>` : ''}

  <h2>Full Signal Audit</h2>
  <table style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:#f9fafb">
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Signal</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Description</th>
        <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600">Result</th>
      </tr>
    </thead>
    <tbody>${sigRows}</tbody>
  </table>

  ${metaRows ? `
  <h2>Metadata Detected</h2>
  <table style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <tbody>${metaRows}</tbody>
  </table>` : ''}

  <div style="margin-top:32px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:12px">
    Generated by SEO Hunter · ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })} · Data sourced from OpenStreetMap, Wayback Machine
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AuditReportModal({ businessId, onClose }) {
  const [biz,       setBiz]       = useState(null);
  const [history,   setHistory]   = useState([]);
  const [tab,       setTab]       = useState('report');
  const [loading,   setLoading]   = useState(true);
  const [reauditing, setReauditing] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    setLoading(true);
    Promise.all([
      fetchBusiness(businessId),
      fetchAuditHistory(businessId),
    ]).then(([b, h]) => {
      setBiz(b);
      setHistory(h.history || []);
    }).catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [businessId]);

  async function handleReaudit() {
    if (!biz?.website) { toast('No website to audit', 'error'); return; }
    setReauditing(true);
    try {
      await reauditBusiness(businessId);
      toast('Re-audit started — refresh in a moment', 'info');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setReauditing(false);
    }
  }

  const audit = biz?.audit;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex-1 min-w-0">
            {loading
              ? <div className="h-5 bg-gray-200 rounded animate-pulse w-48 mb-1" />
              : <>
                  <h2 className="font-bold text-gray-900 text-lg leading-tight">{biz?.name}</h2>
                  {biz?.address && (
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <MapPin size={11} />{biz.address}
                    </p>
                  )}
                </>
            }
          </div>
          <button onClick={onClose} className="ml-3 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-gray-100 px-5 flex-shrink-0">
          {[
            { id: 'report',  label: 'Latest Report' },
            { id: 'details', label: 'Business Info' },
            { id: 'history', label: `History (${history.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-blue-800 text-blue-800'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {loading
            ? <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />)}</div>
            : tab === 'report'  ? <ReportTab  biz={biz} audit={audit} />
            : tab === 'details' ? <DetailsTab biz={biz} />
            : <HistoryTab history={history} />
          }
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-wrap flex-shrink-0">
          {biz?.website && (
            <a
              href={biz.website.startsWith('http') ? biz.website : 'https://' + biz.website}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-white transition-colors"
            >
              <ExternalLink size={12} /> Visit Site
            </a>
          )}
          {biz?.gbp_url && (
            <a href={biz.gbp_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-white transition-colors"
            >
              <Globe size={12} /> Google Business
            </a>
          )}
          {biz?.yelp_url && (
            <a href={biz.yelp_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-white transition-colors"
            >
              <Star size={12} /> Yelp
            </a>
          )}
          {audit && (
            <button
              onClick={() => generatePrintReport(biz, audit)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-white transition-colors"
            >
              <FileText size={12} /> Download Report
            </button>
          )}
          <button
            onClick={handleReaudit}
            disabled={reauditing || !biz?.website}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-800 text-white text-xs font-semibold hover:bg-blue-900 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={12} className={reauditing ? 'animate-spin' : ''} />
            {reauditing ? 'Auditing…' : 'Re-audit Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Report tab ────────────────────────────────────────────────────────────────

function ReportTab({ biz, audit }) {
  if (!audit) {
    return (
      <div className="p-10 text-center text-gray-500">
        <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" />
        <p className="text-sm font-semibold">No audit data yet</p>
        <p className="text-xs text-gray-400 mt-1">Click "Re-audit Now" to generate a report</p>
      </div>
    );
  }

  const signals = audit.signals || {};
  const raw     = audit.raw || {};
  const issues  = audit.top_issues || [];

  const issueCount = Object.values(signals).filter(Boolean).length;
  const passCount  = Object.values(signals).filter(v => !v).length;

  return (
    <div className="p-5 space-y-6">

      {/* Score hero */}
      <div className="flex items-center gap-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
        <ScoreRing score={audit.score} size={88} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <PriorityBadge priority={audit.priority} size="lg" />
            {audit.reachable === false && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                <XCircle size={11} /> Unreachable
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Audited <span className="font-medium text-gray-700">{formatDate(audit.audited_at)}</span>
          </p>
          <div className="flex gap-3 mt-2">
            <span className="text-xs font-medium text-red-600">{issueCount} issues found</span>
            <span className="text-xs font-medium text-green-600">{passCount} checks passed</span>
          </div>
          {audit.audit_error && (
            <p className="text-xs text-red-500 mt-1 truncate">{audit.audit_error}</p>
          )}
        </div>

        {/* Raw metadata pills */}
        <div className="flex flex-col gap-1.5 text-right flex-shrink-0">
          {raw.pagespeed_score != null && raw.pagespeed_score !== -1 && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${raw.pagespeed_score >= 50 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <Gauge size={10} className="inline mr-1" />PSI {raw.pagespeed_score}
            </span>
          )}
          {raw.copyright_year && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              © {raw.copyright_year}
            </span>
          )}
          {raw.wayback_last_snapshot && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
              Archived {raw.wayback_last_snapshot}
            </span>
          )}
          {raw.latest_blog_year && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
              Blog: {raw.latest_blog_year}
            </span>
          )}
        </div>
      </div>

      {/* Top issues */}
      {issues.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Top Issues</h4>
          <div className="space-y-1.5">
            {issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
                <AlertTriangle size={12} className="text-red-500 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-red-800">{issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categorised signals */}
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Full Signal Checklist</h4>
        <div className="space-y-3">
          {CATEGORIES.map(cat => {
            const c = CAT_COLORS[cat.color];
            const catSignals = cat.signals.filter(k => k in signals);
            if (!catSignals.length) return null;
            const catIssues = catSignals.filter(k => signals[k]).length;
            return (
              <div key={cat.id} className={`rounded-xl border ${c.border} overflow-hidden`}>
                <div className={`flex items-center justify-between px-3 py-2 ${c.bg}`}>
                  <div className="flex items-center gap-2">
                    <cat.Icon size={13} className={c.icon} />
                    <span className="text-xs font-semibold text-gray-700">{cat.label}</span>
                  </div>
                  {catIssues > 0
                    ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.pill}`}>{catIssues} issue{catIssues > 1 ? 's' : ''}</span>
                    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">All passed</span>
                  }
                </div>
                <div className="divide-y divide-gray-100 bg-white">
                  {catSignals.map(key => {
                    const present = signals[key];
                    const meta = SIGNAL_META[key] || { label: key.replace(/_/g,' '), desc: '' };
                    return (
                      <div key={key} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors">
                        <div>
                          <p className="text-xs font-medium text-gray-800">{meta.label}</p>
                          <p className="text-[11px] text-gray-400">{meta.desc}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                          {present
                            ? <><XCircle size={14} className="text-red-500" /><span className="text-xs font-semibold text-red-600">Issue</span></>
                            : <><CheckCircle2 size={14} className="text-green-500" /><span className="text-xs font-semibold text-green-600">Pass</span></>
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Security findings detail */}
      {(raw.exposed_paths?.length > 0 || raw.cms_version || raw.deprecated_patterns?.length > 0) && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Security Findings</h4>
          <div className="space-y-2">
            {raw.exposed_paths?.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-700 mb-1.5">Exposed Sensitive Paths</p>
                <div className="flex flex-wrap gap-1.5">
                  {raw.exposed_paths.map((p, i) => (
                    <code key={i} className="text-[11px] bg-white border border-red-300 text-red-700 px-2 py-0.5 rounded font-mono">{p}</code>
                  ))}
                </div>
              </div>
            )}
            {raw.cms_version && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs font-semibold text-amber-700 mb-0.5">CMS / Server Version Detected</p>
                <code className="text-xs text-amber-800 font-mono">{raw.cms_version}</code>
              </div>
            )}
            {raw.deprecated_patterns?.length > 0 && (
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                <p className="text-xs font-semibold text-orange-700 mb-1.5">Deprecated Code Patterns</p>
                <div className="flex flex-wrap gap-1.5">
                  {raw.deprecated_patterns.map((p, i) => (
                    <code key={i} className="text-[11px] bg-white border border-orange-300 text-orange-700 px-2 py-0.5 rounded font-mono">{p}</code>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Details tab ───────────────────────────────────────────────────────────────

function DetailsTab({ biz }) {
  if (!biz) return null;
  const hasPhone   = !!biz.phone;
  const hasEmail   = !!biz.email;
  const hasAddress = !!biz.address;
  const hasGeo     = !!(biz.lat && biz.lng);
  const contactScore = (hasPhone ? 1 : 0) + (hasEmail ? 1 : 0) + (hasAddress ? 1 : 0) + (hasGeo ? 1 : 0);

  const rows = [
    { label: 'Website',  icon: Globe,  value: biz.website, link: biz.website?.startsWith('http') ? biz.website : biz.website ? 'https://' + biz.website : null },
    { label: 'Phone',    icon: Phone,  value: biz.phone,   link: biz.phone ? `tel:${biz.phone}` : null },
    { label: 'Email',    icon: Mail,   value: biz.email,   link: biz.email ? `mailto:${biz.email}` : null },
    { label: 'Address',  icon: MapPin, value: biz.address },
    { label: 'Geo-tag',  icon: MapPin, value: (biz.lat && biz.lng) ? `${biz.lat.toFixed(5)}, ${biz.lng.toFixed(5)}` : null },
    { label: 'Category', icon: Tag,    value: biz.category },
    { label: 'Rating',   icon: Star,   value: biz.rating != null ? `${biz.rating} / 5 (${biz.review_count ?? 0} reviews)` : null },
    { label: 'Source',   icon: Search, value: biz.source },
    { label: 'Added',    icon: Clock,  value: biz.created_at ? formatDate(biz.created_at) : null },
  ].filter(r => r.value);

  return (
    <div className="p-5">
      {/* Contact completeness summary */}
      <div className={`flex items-center justify-between p-3 rounded-xl mb-4 border ${
        contactScore === 0 ? 'bg-rose-50 border-rose-200' :
        contactScore >= 3 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
      }`}>
        <div>
          <p className={`text-xs font-semibold ${
            contactScore === 0 ? 'text-rose-700' : contactScore >= 3 ? 'text-green-700' : 'text-amber-700'
          }`}>
            {contactScore === 0 ? 'No contact information found'
             : contactScore === 4 ? 'Complete contact information'
             : `${contactScore}/4 contact fields available`}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">Phone · Email · Address · Geo-tag</p>
        </div>
        <div className="flex gap-1.5">
          {[
            { label: 'Ph', has: hasPhone },
            { label: 'Em', has: hasEmail },
            { label: 'Ad', has: hasAddress },
            { label: 'Geo', has: hasGeo },
          ].map(({ label, has }) => (
            <div key={label} className={`flex flex-col items-center text-[9px] font-bold gap-0.5 ${has ? 'text-green-600' : 'text-gray-300'}`}>
              {has ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
            <row.icon size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">{row.label}</p>
              {row.link
                ? <a href={row.link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline break-all">{row.value}</a>
                : <p className="text-sm text-gray-800 break-words">{row.value}</p>
              }
            </div>
          </div>
        ))}
      </div>

      {(biz.gbp_url || biz.yelp_url) && (
        <div className="mt-4 flex gap-2 flex-wrap">
          {biz.gbp_url && (
            <a href={biz.gbp_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <Globe size={12} /> View on Google Business
            </a>
          )}
          {biz.yelp_url && (
            <a href={biz.yelp_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <Star size={12} /> View on Yelp
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab({ history }) {
  if (!history.length) {
    return (
      <div className="p-10 text-center text-gray-400">
        <Clock size={28} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm">No audit history yet</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {history.map((h, i) => {
        const issueCount = Object.values(h.signals || {}).filter(Boolean).length;
        return (
          <div key={i} className="px-5 py-3.5 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={h.priority} />
                {h.score != null && (
                  <span className="text-xs font-mono font-bold text-gray-700">Score {h.score}</span>
                )}
                <span className="text-xs text-gray-400">{issueCount} issues</span>
              </div>
              <span className="text-xs text-gray-400">{formatDate(h.audited_at)}</span>
            </div>
            {h.top_issues?.slice(0, 2).map((issue, j) => (
              <p key={j} className="text-xs text-gray-500 truncate">{issue}</p>
            ))}
            {h.reachable === false && (
              <p className="text-xs text-red-500 mt-1">Site was unreachable</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
