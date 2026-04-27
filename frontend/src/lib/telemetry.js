const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();
const browserApiBase = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : 'http://127.0.0.1:8000';

export const API_BASE = configuredApiBase || browserApiBase;

const fetchJson = async (path) => {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`${path} request failed with ${response.status}`);
  }
  return response.json();
};

export const normalizeWorkers = (data) => {
  if (Array.isArray(data)) return data;

  if (data?.workers && Array.isArray(data.workers)) {
    return data.workers;
  }

  if (data && typeof data === 'object') {
    const source = data.workers && typeof data.workers === 'object' ? data.workers : data;
    return Object.entries(source).map(([id, worker]) => ({
      worker_id: worker?.worker_id || worker?.workerId || id,
      ...worker,
    }));
  }

  return [];
};

export const normalizeAlerts = (data) => {
  if (Array.isArray(data)) return data;
  if (data?.alerts && Array.isArray(data.alerts)) return data.alerts;
  if (data?.value && Array.isArray(data.value)) return data.value;
  return [];
};

export const fetchAnalyticsSnapshot = () => fetchJson('/analytics');
export const fetchWorkers = async () => normalizeWorkers(await fetchJson('/workers'));
export const fetchAlerts = async () => normalizeAlerts(await fetchJson('/alerts'));
export const fetchHealth = () => fetchJson('/health');
