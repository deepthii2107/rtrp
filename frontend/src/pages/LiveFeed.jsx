import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { API_BASE, fetchAnalyticsSnapshot } from '../lib/telemetry';

const navItems = [
  { label: 'Live Feed', icon: 'videocam', to: '/live-feed' },
  { label: 'Workers', icon: 'badge', to: '/workers' },
  { label: 'Analytics', icon: 'insert_chart', to: '/analytics' },
];

const cardConfig = [
  { key: 'active', label: 'Active', icon: 'group', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
  { key: 'idle', label: 'Idle', icon: 'pause_circle', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400' },
  { key: 'alerts', label: 'Alerts', icon: 'warning', iconBg: 'bg-rose-500/10', iconColor: 'text-rose-400' },
  { key: 'fps', label: 'FPS', icon: 'speed', iconBg: 'bg-sky-500/10', iconColor: 'text-sky-400' },
];

const normalizeTime = (timestamp) => {
  if (!timestamp) return '--:--:--';
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const formatDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  const hours = Math.floor(safeSeconds / 3600);

  if (hours > 0) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
};

const LiveFeed = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [loadState, setLoadState] = useState('loading');

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const data = await fetchAnalyticsSnapshot();
        if (!isMounted) return;
        setSnapshot(data);
        setLoadState('ready');
      } catch (error) {
        console.error('Failed to fetch live feed snapshot:', error);
        if (isMounted) setLoadState('error');
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const current = snapshot?.current || {};
  const workers = snapshot?.workers || [];
  const activeAlerts = snapshot?.alerts?.active || [];
  const history = snapshot?.history || [];
  const system = snapshot?.system || { online: false, pipeline_running: false, latest_fps: 0, uptime_seconds: 0 };

  const productivity = Number(current.productivity || 0);
  const uptimeBars = useMemo(() => {
    const samples = history.slice(-10);
    if (samples.length === 0) return Array.from({ length: 10 }, () => 0);
    return samples.map((sample) => Math.max(8, Math.min(100, Math.round((Number(sample.fps || 0) / 30) * 100))));
  }, [history]);

  const visibleAlerts = useMemo(() => {
    return activeAlerts.map((alert, index) => {
      const severity = Number(alert.idle_duration || 0) >= 300 ? 'critical' : 'warning';
      return {
        id: alert.id || `${alert.worker_id}-${index}`,
        workerName: `Worker ${alert.worker_id}`,
        reason: alert.message || `Idle for ${formatDuration(alert.idle_duration || 0)}`,
        timestamp: normalizeTime(alert.timestamp),
        severity,
      };
    });
  }, [activeAlerts]);

  const idleWorkers = useMemo(() => {
    return workers.filter((worker) => ['idle', 'alert'].includes((worker.status || '').toLowerCase()));
  }, [workers]);

  const metricValues = {
    active: `${current.active_count || 0}/${Math.max(current.occupied_count || 0, 1)}`,
    idle: String((current.idle_count || 0) + (current.alerting_count || 0)).padStart(2, '0'),
    alerts: String(activeAlerts.length).padStart(2, '0'),
    fps: Number(system.latest_fps || 0).toFixed(1),
  };

  const cardValueColor = {
    active: 'text-emerald-400',
    idle: 'text-amber-400',
    alerts: 'text-rose-400',
    fps: 'text-sky-400',
  };

  const cardGlow = {
    active: 'shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_14px_rgba(34,197,94,0.12),inset_0_1px_0_rgba(255,255,255,0.03)]',
    idle: 'shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_16px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,0.03)]',
    alerts: 'shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_20px_rgba(239,68,68,0.15),inset_0_1px_0_rgba(255,255,255,0.03)]',
    fps: 'shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_20px_rgba(59,130,246,0.15),inset_0_1px_0_rgba(255,255,255,0.03)]',
  };

  return (
    <main className="min-h-[calc(100vh-80px)] bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_68%)] px-4 pb-8 pt-5 text-[#E2E8F0] lg:px-6">
      <div className="mx-auto grid max-w-[1560px] gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-[calc(100vh-116px)] flex-col rounded-[24px] border border-white/5 bg-[#0f172a] px-6 py-7 shadow-[0_10px_30px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="mb-10">
            <p className="font-['Epilogue'] text-[2rem] font-semibold leading-none tracking-tight text-[#E2E8F0]">
              Brew Command
            </p>
            <p className="mt-2 text-lg font-medium text-[#94A3B8]">Station Alpha</p>
          </div>

          <nav className="space-y-3">
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) => `flex min-h-[62px] w-full items-center gap-4 rounded-2xl px-5 text-left transition duration-200 hover:-translate-y-0.5 ${
                  isActive
                    ? 'border-l-[3px] border-l-[#3b82f6] bg-[rgba(59,130,246,0.15)] text-sky-300 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                    : 'text-[#94A3B8] hover:bg-[#1e293b]'
                }`}
              >
                <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: item.label === 'Live Feed' ? "'FILL' 1" : "'FILL' 0" }}>
                  {item.icon}
                </span>
                <span className="text-[1rem] font-medium">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <section className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-8">
            <div className="grid gap-6 sm:grid-cols-2 2xl:grid-cols-4">
              {cardConfig.map((card) => (
                <article
                  key={card.key}
                  className={`min-h-[132px] rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[#0f172a] px-6 py-6 transition duration-200 hover:-translate-y-0.5 ${cardGlow[card.key]}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                        {card.label}
                      </p>
                      <p className={`mt-3 font-['Epilogue'] text-[32px] font-bold leading-none ${cardValueColor[card.key]}`}>
                        {metricValues[card.key]}
                      </p>
                    </div>
                    <div className={`grid h-[64px] w-[64px] place-items-center rounded-2xl ${card.iconBg}`}>
                      <span className={`material-symbols-outlined text-[2rem] ${card.iconColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                        {card.icon}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[#0f172a] shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="relative aspect-[16/9] overflow-hidden bg-[#020617]">
                {loadState === 'error' ? (
                  <div className="flex h-full items-center justify-center text-center text-[#94A3B8]">
                    Unable to load the live video stream right now.
                  </div>
                ) : (
                  <img
                    src={`${API_BASE}/video`}
                    alt="Live monitoring feed"
                    className="h-full w-full object-cover opacity-85"
                  />
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.08)_0%,rgba(15,23,42,0.18)_38%,rgba(2,6,23,0.56)_100%)]" />

                <div className="absolute left-6 top-6 flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(15,23,42,0.7)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-emerald-300 shadow-[0_0_12px_rgba(34,197,94,0.2)] backdrop-blur-[12px]">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
                    {system.pipeline_running ? 'Live' : 'Standby'}
                  </span>
                  <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(15,23,42,0.7)] px-4 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#E2E8F0] backdrop-blur-[12px]">
                    Authorized Workers: {current.authorized_count || 0}
                  </span>
                </div>

                <div className="absolute right-6 top-6 grid gap-3">
                  <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(15,23,42,0.7)] px-4 py-2 text-sm font-semibold tracking-[0.08em] text-sky-300 backdrop-blur-[12px]">
                    Productivity: {productivity}%
                  </span>
                  <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(15,23,42,0.7)] px-4 py-2 text-sm font-semibold tracking-[0.08em] text-[#E2E8F0] backdrop-blur-[12px]">
                    FPS: {Number(system.latest_fps || 0).toFixed(1)}
                  </span>
                </div>

                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[rgba(0,0,0,0.68)] to-transparent" />
              </div>
            </div>

            <section className="rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[#0f172a] p-6 shadow-[0_12px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-['Epilogue'] text-[1.2rem] font-bold text-[#E2E8F0]">Live Alert Stack</h2>
                  <p className="mt-1 text-sm font-medium text-[#94A3B8]">Current unresolved alerts.</p>
                </div>
                <span className="rounded-full bg-[#121821] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#94A3B8]">
                  {visibleAlerts.length} live
                </span>
              </div>

              <div className="space-y-4">
                {visibleAlerts.length > 0 ? visibleAlerts.map((alert, index) => {
                  const palette = alert.severity === 'critical'
                    ? {
                      border: 'border-rose-500/35',
                      glow: 'shadow-[0_12px_30px_rgba(0,0,0,0.45),0_0_20px_rgba(239,68,68,0.14)]',
                      dot: 'bg-rose-400',
                      badge: 'bg-rose-500/12 text-rose-200',
                    }
                    : {
                      border: 'border-amber-500/30',
                      glow: 'shadow-[0_12px_30px_rgba(0,0,0,0.45),0_0_18px_rgba(245,158,11,0.1)]',
                      dot: 'bg-amber-400',
                      badge: 'bg-amber-500/12 text-amber-200',
                    };

                  return (
                    <div
                      key={alert.id}
                      className={`rounded-2xl border bg-[#020617] p-5 opacity-100 transition duration-500 ${palette.border} ${palette.glow}`}
                      style={{ transform: 'translateY(0)', transitionDelay: `${index * 90}ms` }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <span className={`h-2.5 w-2.5 rounded-full ${palette.dot}`} />
                            <p className="font-['Epilogue'] text-lg font-bold text-[#E2E8F0]">{alert.workerName}</p>
                          </div>
                          <p className="mt-3 text-sm font-medium leading-7 text-[#CBD5E1]">{alert.reason}</p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex rounded-full px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] ${palette.badge}`}>
                            {alert.severity}
                          </span>
                          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#64748B]">{alert.timestamp}</p>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-3 grid h-16 w-16 place-items-center rounded-full bg-emerald-500/10 shadow-[0_0_16px_rgba(34,197,94,0.15)]">
                        <span className="material-symbols-outlined text-[32px] text-emerald-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      </div>
                      <h3 className="font-['Epilogue'] text-xl font-bold text-emerald-100">No Live Alerts</h3>
                      <p className="mt-1 text-sm font-medium text-emerald-400/70">There are no unresolved worker alerts right now.</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-8">
            <section className="rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[#0f172a] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.03)] transition duration-200 hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Zone Status</p>
                  <h3 className="mt-2 font-['Epilogue'] text-[1.35rem] font-semibold text-[#E2E8F0]">Authorized Zone</h3>
                </div>
                <span className={`mt-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${system.pipeline_running ? 'bg-emerald-500/14 text-emerald-300 shadow-[0_0_12px_rgba(34,197,94,0.18)]' : 'bg-rose-500/14 text-rose-300'}`}>
                  {system.pipeline_running ? 'Operational' : 'Standby'}
                </span>
              </div>

              <div className="mt-7 space-y-5">
                <div className="rounded-2xl border border-white/5 bg-[#020617] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.03)] transition duration-200 hover:-translate-y-0.5">
                  <p className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Live Productivity</p>
                  <p className="mt-3 font-['Epilogue'] text-[28px] font-bold text-[#22c55e]">{productivity}%</p>
                  <p className="mt-2 text-sm leading-7 text-[#64748B]">Active share of currently occupied worker slots.</p>
                </div>
                <div className="rounded-2xl border border-[rgba(239,68,68,0.3)] bg-[#020617] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_18px_rgba(239,68,68,0.08),inset_0_1px_0_rgba(255,255,255,0.03)] transition duration-200 hover:-translate-y-0.5">
                  <p className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Observed Idle</p>
                  <p className="mt-3 font-['Epilogue'] text-[28px] font-bold text-[#ef4444]">{idleWorkers.length}</p>
                  <p className="mt-2 text-sm leading-7 text-[#64748B]">Workers currently marked idle or alert by the classifier.</p>
                </div>
                <div className="rounded-2xl border border-sky-500/15 bg-[#020617] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_15px_rgba(34,197,94,0.15),inset_0_1px_0_rgba(255,255,255,0.03)] transition duration-200 hover:-translate-y-0.5">
                  <p className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">Frame Rate History</p>
                  <p className="mt-3 font-['Epilogue'] text-[28px] font-bold text-[#3b82f6]">
                    {Number(system.latest_fps || 0).toFixed(1)} FPS
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#64748B]">Latest processed frame rate.</p>
                  <div className="mt-4 flex h-12 items-end gap-1.5">
                    {uptimeBars.map((height, index) => (
                      <div
                        key={`${height}-${index}`}
                        className="flex-1 rounded-t-full bg-gradient-to-t from-sky-600 to-sky-400/80"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[#0f172a] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.03)] transition duration-200 hover:-translate-y-0.5">
              <div className="mb-6">
                <h2 className="font-['Epilogue'] text-[1.1rem] font-semibold text-[#E2E8F0]">System Snapshot</h2>
                <p className="mt-1 text-[14px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                  Real-time floor summary
                </p>
              </div>

              <div className="space-y-5 text-sm font-medium leading-7 text-[#CBD5E1]">
                <p>{current.active_count || 0} workers are active across {current.occupied_count || 0} occupied tracked positions.</p>
                <p>{idleWorkers.length} worker{idleWorkers.length === 1 ? '' : 's'} are in idle or alert state, with {activeAlerts.length} unresolved alerts.</p>
                <p>System uptime is {formatDuration(system.uptime_seconds || 0)} and the monitoring feed is {system.pipeline_running ? 'running live' : 'on standby'}.</p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
};

export default LiveFeed;
