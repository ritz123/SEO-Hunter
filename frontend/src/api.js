const BASE = '';  // same origin; Vite dev proxy handles /api → :8000

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  delete: (path)        => request('DELETE', path),
};

// ── High-level helpers ──────────────────────────────────────────────────────

export function fetchStats()      { return api.get('/api/stats'); }
export function fetchConfig()     { return api.get('/api/config'); }
export function fetchLocalities() { return api.get('/api/localities'); }

export function fetchBusinesses(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  return api.get('/api/businesses' + (qs ? '?' + qs : ''));
}

export function fetchBusiness(id) {
  return api.get(`/api/businesses/${id}`);
}

export function fetchAuditHistory(businessId) {
  return api.get(`/api/businesses/${businessId}/audits`);
}

export function reauditBusiness(id) {
  return api.post(`/api/businesses/${id}/audit`, {});
}

export function deleteLocality(id) {
  return api.delete(`/api/localities/${id}`);
}

export function startSearch(payload) {
  return api.post('/api/search', payload);
}

export function pollJob(jobId) {
  return api.get(`/api/jobs/${jobId}`);
}

export function geocode(q) {
  return api.get(`/api/geocode?q=${encodeURIComponent(q)}`);
}

export function geocodeSuggest(q) {
  return api.get(`/api/geocode/suggest?q=${encodeURIComponent(q)}`);
}

export function geocodeReverse(lat, lng) {
  return api.get(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
}
