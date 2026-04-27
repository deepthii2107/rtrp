import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { fetchAnalyticsSnapshot } from '../lib/telemetry';

const navItems = [
  { label: 'Live Feed', icon: 'videocam', to: '/live-feed' },
  { label: 'Workers', icon: 'badge', to: '/workers' },
  { label: 'Analytics', icon: 'insert_chart', to: '/analytics' },
];

const HISTORY_LIMIT = 24;
const CHART_ANIMATION_MS = 800;

const createPlaceholderHistory = () => Array.from({ length: HISTORY_LIMIT }, (_, index) => ({
  productivity: 0,
  active_count: 0,
  idle_count: 0,
  alert_count: 0,
  label: index === HISTORY_LIMIT - 1 ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--',
}));

const toLabel = (timestamp) => new Date(timestamp * 1000).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const formatHours = (seconds = 0) => {
  const hours = Math.max(0, Number(seconds) || 0) / 3600;
  return hours >= 10 ? hours.toFixed(1) : hours.toFixed(2);
};

const getWorkerStats = (worker) => {
  const totalSeconds = Number(worker.total_time_in_shop || 0);
  const idleSeconds = Number(worker.idle_duration_seconds || 0);
  const activeSeconds = Math.max(0, totalSeconds - idleSeconds);
  const efficiency = totalSeconds > 0 ? Math.max(0, Math.min(100, Math.round((activeSeconds / totalSeconds) * 100))) : 0;

  return {
    totalSeconds,
    idleSeconds,
    activeSeconds,
    efficiency,
  };
};

const getBarGradient = (value) => {
  if (value >= 85) return 'from-[#16A34A] via-[#22C55E] to-[#86EFAC]';
  if (value >= 70) return 'from-[#84CC16] via-[#F59E0B] to-[#FCD34D]';
  return 'from-[#F97316] via-[#EF4444] to-[#FCA5A5]';
};

const buildProductivityPoints = (history) => {
  const width = 520;
  const height = 202;
  const samples = history.length > 0 ? history : createPlaceholderHistory();
  const step = samples.length > 1 ? width / (samples.length - 1) : width;

  return samples.map((sample, index) => ({
    x: 20 + index * step,
    y: 232 - ((sample.productivity || 0) / 100) * height,
    label: sample.label,
    value: sample.productivity || 0,
    active: sample.active_count || 0,
    idle: (sample.idle_count || 0) + (sample.alert_count || 0),
  }));
};

const buildCurvePath = (points) => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const controlDistance = (point.x - previous.x) / 2;
    return `${path} C ${previous.x + controlDistance} ${previous.y}, ${point.x - controlDistance} ${point.y}, ${point.x} ${point.y}`;
  }, '');
};

const buildAreaPath = (points) => {
  if (points.length === 0) return '';
  const linePath = buildCurvePath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  return `${linePath} L ${lastPoint.x} 232 L ${firstPoint.x} 232 Z`;
};

const buildAxisLabels = (points) => {
  if (points.length === 0) {
    return [
      { x: 20, label: '--:--:--' },
      { x: 540, label: '--:--:--' },
    ];
  }

  const desiredLabels = Math.min(5, points.length);
  const step = desiredLabels === 1 ? 0 : (points.length - 1) / (desiredLabels - 1);
  const indexes = new Set(Array.from({ length: desiredLabels }, (_, index) => Math.round(index * step)));

  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => ({
      x: points[index].x,
      label: points[index].label,
    }));
};

const Analytics = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [health, setHealth] = useState({ online: false, pipelineRunning: false, latestFps: 0 });
  const [history, setHistory] = useState(() => createPlaceholderHistory());
  const [animatedHistory, setAnimatedHistory] = useState(() => createPlaceholderHistory());
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const animationFrameRef = useRef(null);
  const previousHistoryRef = useRef(createPlaceholderHistory());

  useEffect(() => {
    let isMounted = true;

    const fetchAnalytics = async () => {
      try {
        const data = await fetchAnalyticsSnapshot();
        if (!isMounted) return;

        const nextHistory = (data.history || []).slice(-HISTORY_LIMIT).map((point) => ({
          ...point,
          label: toLabel(point.timestamp),
        }));

        setSnapshot(data);
        setHealth({
          online: true,
          pipelineRunning: Boolean(data.system?.pipeline_running),
          latestFps: Number(data.system?.latest_fps || 0),
          uptime: Number(data.system?.uptime_seconds || 0),
        });
        setHistory(nextHistory.length > 0 ? nextHistory : createPlaceholderHistory());
      } catch (error) {
        console.error('Failed to fetch analytics snapshot:', error);
        if (isMounted) {
          setHealth((previous) => ({ ...previous, online: false }));
        }
      }
    };

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startHistory = previousHistoryRef.current;
    const targetHistory = history;
    const startTime = performance.now();

    const animate = (timestamp) => {
      const progress = Math.min(1, (timestamp - startTime) / CHART_ANIMATION_MS);
      const easedProgress = 1 - ((1 - progress) ** 3);

      const nextAnimatedHistory = targetHistory.map((point, index) => {
        const sourcePoint = startHistory[index] || startHistory[startHistory.length - 1] || point;
        return {
          productivity: sourcePoint.productivity + ((point.productivity || 0) - (sourcePoint.productivity || 0)) * easedProgress,
          active_count: sourcePoint.active_count + ((point.active_count || 0) - (sourcePoint.active_count || 0)) * easedProgress,
          idle_count: sourcePoint.idle_count + ((point.idle_count || 0) - (sourcePoint.idle_count || 0)) * easedProgress,
          alert_count: sourcePoint.alert_count + ((point.alert_count || 0) - (sourcePoint.alert_count || 0)) * easedProgress,
          label: point.label,
        };
      });

      setAnimatedHistory(nextAnimatedHistory);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        previousHistoryRef.current = targetHistory;
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [history]);

  const workers = snapshot?.workers || [];
  const activeAlerts = snapshot?.alerts?.active || [];
  const current = snapshot?.current || {};

  const metrics = useMemo(() => [
    {
      label: 'Productivity',
      value: `${current.productivity || 0}%`,
      trend: `${current.active_count || 0} active · ${(current.idle_count || 0) + (current.alerting_count || 0)} idle`,
      direction: (current.idle_count || 0) + (current.alerting_count || 0) > 0 ? 'down' : 'up',
      icon: 'show_chart',
      accent: '#22C55E',
    },
    {
      label: 'Tracked Hours',
      value: formatHours(current.total_tracked_seconds || 0),
      trend: health.pipelineRunning ? 'session total' : 'standby',
      direction: health.pipelineRunning ? 'up' : 'down',
      icon: 'schedule',
      accent: '#3B82F6',
    },
    {
      label: 'Active Alerts',
      value: String(activeAlerts.length),
      trend: `${current.alerting_count || 0} alerting`,
      direction: activeAlerts.length > 0 ? 'down' : 'up',
      icon: 'warning',
      accent: '#F59E0B',
    },
    {
      label: 'Pipeline FPS',
      value: Number(health.latestFps || 0).toFixed(1),
      trend: health.pipelineRunning ? 'live fps' : 'no frames',
      direction: health.pipelineRunning ? 'up' : 'down',
      icon: 'speed',
      accent: '#60A5FA',
    },
  ], [activeAlerts.length, current.active_count, current.alerting_count, current.idle_count, current.productivity, current.total_tracked_seconds, health.latestFps, health.pipelineRunning]);

  const teamEfficiency = useMemo(() => {
    return workers
      .map((worker, index) => {
        const stats = getWorkerStats(worker);
        return {
          name: worker.name || `Worker ${worker.worker_id || index + 1}`,
          role: worker.in_zone === false ? 'Outside Zone' : `Status: ${(worker.status || 'outside').toUpperCase()}`,
          value: stats.efficiency,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [workers]);

  const productivityPoints = useMemo(() => buildProductivityPoints(animatedHistory), [animatedHistory]);
  const productivityPath = useMemo(() => buildCurvePath(productivityPoints), [productivityPoints]);
  const productivityAreaPath = useMemo(() => buildAreaPath(productivityPoints), [productivityPoints]);
  const axisLabels = useMemo(() => buildAxisLabels(productivityPoints), [productivityPoints]);
  const peakPoint = useMemo(() => {
    if (productivityPoints.length === 0) return null;
    return productivityPoints.reduce((best, point) => (point.value > best.value ? point : best), productivityPoints[0]);
  }, [productivityPoints]);
  const latestPoint = productivityPoints[productivityPoints.length - 1];
  const previousPoint = productivityPoints[productivityPoints.length - 2] || latestPoint;
  const trendDropping = latestPoint && previousPoint ? latestPoint.value < previousPoint.value : false;

  const insights = useMemo(() => {
    const realHistory = history.filter((point) => point.label !== '--:--:--');
    const peakHistoryPoint = realHistory.reduce((best, point) => (!best || point.productivity > best.productivity ? point : best), null);
    const highestIdleWorker = workers
      .map((worker, index) => ({
        name: worker.name || `Worker ${worker.worker_id || index + 1}`,
        idleSeconds: Number(worker.idle_duration_seconds || 0),
      }))
      .sort((a, b) => b.idleSeconds - a.idleSeconds)[0];
    const alertSpike = realHistory.some((point) => (point.alert_count || 0) > 0);

    return [
      peakHistoryPoint
        ? `Peak productivity reached ${peakHistoryPoint.productivity}% at ${peakHistoryPoint.label}.`
        : 'Waiting for enough live data to identify a peak productivity moment.',
      highestIdleWorker && highestIdleWorker.idleSeconds > 0
        ? `${highestIdleWorker.name} currently has the largest idle exposure at ${Math.floor(highestIdleWorker.idleSeconds)}s.`
        : 'No tracked worker currently shows measurable idle exposure.',
      alertSpike
        ? 'Alert activity is present in the recent history and should be reviewed against the live feed.'
        : 'No alert spike appears in the current history window.',
    ];
  }, [history, workers]);

  const handleGraphHover = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * 520 + 20;
    const nearest = productivityPoints.reduce((best, point) => {
      if (!best) return point;
      return Math.abs(point.x - relativeX) < Math.abs(best.x - relativeX) ? point : best;
    }, null);
    setHoveredPoint(nearest);
  };

  return (
    <main className="min-h-[calc(100vh-80px)] bg-[#0B0F14] text-[#E6EDF3]">
      <div className="mx-auto grid max-w-[1560px] grid-cols-[320px_minmax(0,1fr)] gap-10 px-5 py-12">
        <aside className="relative flex min-h-[calc(100vh-176px)] flex-col bg-[#0E141B] px-5 py-8 shadow-[18px_0_55px_rgba(0,0,0,0.16)]">
          <div className="px-2">
            <p className="text-[0.85rem] font-black uppercase tracking-[0.22em] text-[#6EE7B7]">Brew Command</p>
            <p className="mt-1 text-[0.95rem] font-medium text-[#9AA4B2]">Station Alpha</p>
          </div>

          <nav className="mt-14 space-y-5">
            {navItems.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) => `flex min-h-[64px] w-full items-center gap-5 px-5 text-left transition duration-300 ${
                  isActive
                    ? 'bg-[#121821] text-[#E6EDF3] shadow-[0_0_24px_rgba(59,130,246,0.14),inset_3px_0_0_rgba(59,130,246,0.7)]'
                    : 'text-[#9AA4B2] hover:bg-[#121821]/70 hover:text-[#E6EDF3]'
                }`}
              >
                {({ isActive }) => (
                  <>
                    <span className={`material-symbols-outlined text-[24px] ${isActive ? 'text-white' : 'text-[#7C8795]'}`}>
                      {item.icon}
                    </span>
                    <span className="text-[1.05rem] font-semibold">{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto">
            <button className="flex min-h-[56px] w-full items-center justify-center rounded-lg border border-blue-400/20 bg-[#121821] px-5 text-base font-bold text-[#E6EDF3] shadow-[0_0_22px_rgba(59,130,246,0.12)] transition duration-300 hover:-translate-y-0.5 hover:border-blue-400/45 hover:text-white hover:shadow-[0_0_28px_rgba(59,130,246,0.24)]">
              Export Report
            </button>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-12 flex items-end justify-between gap-8">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[0.78rem] font-black uppercase tracking-[0.16em] text-emerald-200 shadow-[0_0_18px_rgba(34,197,94,0.12)]">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(34,197,94,0.8)]" />
                Live Analytics
              </div>
              <h1 className="font-['Epilogue'] text-[2.9rem] font-black leading-none tracking-tight text-[#E6EDF3]">
                Performance Analytics
              </h1>
              <p className="mt-5 text-[1.18rem] font-medium text-[#9AA4B2]">
                Productivity, worker efficiency, and system health for the current session.
              </p>
            </div>

            <div className="rounded-2xl border border-[#1F2933] bg-[#121821]/80 px-5 py-4 text-right">
              <p className="text-[0.72rem] font-black uppercase tracking-[0.16em] text-[#7D8793]">Telemetry Status</p>
              <p className={`mt-2 font-['Epilogue'] text-[1.3rem] font-black ${health.online ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'}`}>
                {health.online ? 'Connected' : 'Offline'}
              </p>
              <p className="mt-1 text-sm font-medium text-[#9AA4B2]">
                {health.pipelineRunning ? 'Pipeline running live.' : 'Pipeline is not producing frames.'}
              </p>
            </div>
          </div>

          <div className="mb-10 grid grid-cols-4 gap-7">
            {metrics.map((metric) => {
              const positiveTrend = metric.direction === 'up';
              return (
                <article
                  key={metric.label}
                  className="group min-h-[150px] rounded-2xl bg-[#121821] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.025)] transition duration-300 hover:-translate-y-1 hover:bg-[#16202A] hover:shadow-[0_24px_70px_rgba(0,0,0,0.36),0_0_28px_rgba(59,130,246,0.1)]"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#0B0F14] shadow-[0_0_18px_rgba(59,130,246,0.08)]">
                      <span className="material-symbols-outlined text-[23px]" style={{ color: metric.accent, fontVariationSettings: "'FILL' 1" }}>
                        {metric.icon}
                      </span>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black max-w-[140px] xl:max-w-[160px] ${positiveTrend ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#EF4444]/10 text-[#EF4444]'}`}>
                      <span className="material-symbols-outlined text-[14px] shrink-0">
                        {metric.direction === 'up' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                      <span className="truncate">{metric.trend}</span>
                    </span>
                  </div>
                  <p className="text-[0.78rem] font-black uppercase tracking-[0.16em] text-[#9AA4B2]">{metric.label}</p>
                  <p className="mt-3 font-['Epilogue'] text-[2.35rem] font-black leading-none text-[#E6EDF3]">{metric.value}</p>
                </article>
              );
            })}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-10">
            <section className="rounded-2xl border border-[#1F2933]/70 bg-[linear-gradient(145deg,rgba(18,24,33,0.98),rgba(15,23,42,0.92))] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.03)] transition duration-300 hover:-translate-y-1 hover:bg-[#16202A]">
              <div className="mb-8 flex items-start justify-between gap-6">
                <div>
                  <h2 className="font-['Epilogue'] text-[1.35rem] font-black text-[#E6EDF3]">Productivity Over Time</h2>
                  <p className="mt-2 text-sm font-medium text-[#9AA4B2]">Live activity across the last {HISTORY_LIMIT} samples.</p>
                </div>
                <div className="text-right">
                  <p className="text-[0.72rem] font-black uppercase tracking-[0.16em] text-[#7D8793]">Current Productivity</p>
                  <p className={`mt-1 font-['Epilogue'] text-[1.45rem] font-black ${trendDropping ? 'text-[#F59E0B]' : 'text-[#86EFAC]'}`}>
                    {latestPoint ? `${Math.round(latestPoint.value)}%` : '--'}
                  </p>
                </div>
              </div>

              <div className="relative h-[380px] overflow-hidden rounded-xl bg-[#0B0F14]/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 560 260" preserveAspectRatio="none" role="img" aria-label="Productivity over time chart">
                  <defs>
                    <linearGradient id="productivityArea" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(34,197,94,0.28)" />
                      <stop offset="100%" stopColor="rgba(34,197,94,0)" />
                    </linearGradient>
                    <linearGradient id="productivityLine" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#16A34A" />
                      <stop offset="75%" stopColor="#22C55E" />
                      <stop offset="100%" stopColor={trendDropping ? '#F59E0B' : '#86EFAC'} />
                    </linearGradient>
                  </defs>
                  {[30, 80, 130, 180, 232].map((y) => (
                    <line key={y} x1="20" x2="540" y1={y} y2={y} stroke="rgba(154,164,178,0.09)" strokeWidth="1" />
                  ))}
                  {[20, 124, 228, 332, 436, 540].map((x) => (
                    <line key={x} x1={x} x2={x} y1="30" y2="232" stroke="rgba(154,164,178,0.055)" strokeWidth="1" />
                  ))}
                  <path d={productivityAreaPath} fill="url(#productivityArea)" />
                  <path d={productivityPath} fill="none" stroke="url(#productivityLine)" strokeWidth="4" strokeLinecap="round" />
                  {peakPoint && (
                    <>
                      <circle cx={peakPoint.x} cy={peakPoint.y} r="10" fill="rgba(134,239,172,0.14)" />
                      <circle cx={peakPoint.x} cy={peakPoint.y} r="5" fill="#D9F99D" stroke="#22C55E" strokeWidth="2" />
                    </>
                  )}
                  {hoveredPoint && (
                    <>
                      <line x1={hoveredPoint.x} x2={hoveredPoint.x} y1="30" y2="232" stroke="rgba(148,163,184,0.22)" strokeDasharray="4 4" />
                      <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="5" fill="#0B0F14" stroke={trendDropping ? '#F59E0B' : '#22C55E'} strokeWidth="3" />
                    </>
                  )}
                  <rect
                    x="20"
                    y="30"
                    width="520"
                    height="202"
                    fill="transparent"
                    onMouseMove={handleGraphHover}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                </svg>

                {hoveredPoint && (
                  <div
                    className="pointer-events-none absolute rounded-xl border border-white/10 bg-[#121821]/96 px-4 py-3 text-sm shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
                    style={{
                      left: `calc(${((hoveredPoint.x - 20) / 520) * 100}% - 52px)`,
                      top: `${Math.max(20, hoveredPoint.y - 10)}px`,
                    }}
                  >
                    <p className="font-black text-[#E6EDF3]">{hoveredPoint.label}</p>
                    <p className="mt-1 text-[#86EFAC]">Productivity {Math.round(hoveredPoint.value)}%</p>
                    <p className="text-[#9AA4B2]">Active {Math.round(hoveredPoint.active)} | Idle/Alert {Math.round(hoveredPoint.idle)}</p>
                  </div>
                )}

                <div className="absolute left-3 top-7 flex h-[202px] flex-col justify-between text-[11px] font-bold text-[#667085]">
                  {[100, 75, 50, 25, 0].map((value) => (
                    <span key={value}>{value}%</span>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-x-8 bottom-5 text-xs font-bold text-[#9AA4B2]">
                  {axisLabels.map(({ x, label }, index) => (
                    <span
                      key={`${label}-${index}`}
                      className="absolute -translate-x-1/2"
                      style={{ left: `calc(${((x - 20) / 520) * 100}% + 4px)` }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <aside className="space-y-8">
              <section className="rounded-2xl bg-[#121821] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.025)] transition duration-300 hover:-translate-y-1 hover:bg-[#16202A]">
                <div className="mb-7">
                  <h2 className="font-['Epilogue'] text-[1.28rem] font-black text-[#E6EDF3]">Worker Efficiency</h2>
                  <p className="mt-2 text-sm font-medium text-[#9AA4B2]">Derived from each worker&apos;s tracked time versus idle time.</p>
                </div>

                <div className="space-y-5">
                  {teamEfficiency.length === 0 && (
                    <div className="rounded-xl border border-[#1F2933] bg-[#0B0F14]/70 p-5 text-sm font-medium text-[#9AA4B2]">
                      Waiting for worker efficiency data.
                    </div>
                  )}

                  {teamEfficiency.map((member, index) => (
                    <div key={member.name}>
                      <div className="mb-2 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-sm font-black text-[#E6EDF3]">{member.name}</p>
                          <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.12em] text-[#7D8793]">{member.role}</p>
                        </div>
                        <span className="font-['Epilogue'] text-sm font-black text-[#E6EDF3]">{member.value}%</span>
                      </div>
                      <div className="h-[5px] overflow-hidden rounded-full bg-[#26303A]">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${getBarGradient(member.value)} shadow-[0_0_14px_rgba(34,197,94,0.18)] transition-all duration-700`}
                          style={{ width: `${member.value}%`, transitionDelay: `${index * 70}ms` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-blue-400/22 bg-[linear-gradient(145deg,rgba(18,24,33,0.98),rgba(11,15,20,0.92))] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.32),0_0_26px_rgba(59,130,246,0.12),inset_0_1px_0_rgba(255,255,255,0.035)] transition duration-300 hover:-translate-y-1 hover:border-blue-400/36 hover:shadow-[0_28px_78px_rgba(0,0,0,0.36),0_0_34px_rgba(59,130,246,0.16)]">
                <div className="mb-5 flex items-center gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#3B82F6]/12 text-[#93C5FD] shadow-[0_0_20px_rgba(59,130,246,0.18)]">
                    <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#9AA4B2]">Smart Insights</p>
                    <h3 className="mt-1 font-['Epilogue'] text-lg font-black text-[#E6EDF3]">Session intelligence</h3>
                  </div>
                </div>
                <div className="space-y-3 text-sm font-medium leading-7 text-[#C4CBD4]">
                  {insights.map((insight) => (
                    <p key={insight}>{insight}</p>
                  ))}
                  <p className="pt-2 text-[#9AA4B2]">
                    {health.online
                      ? 'All metrics on this page are updating live.'
                      : 'Waiting for the live monitoring service to reconnect.'}
                  </p>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Analytics;
