import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { fetchWorkers as fetchWorkersFromApi } from '../lib/telemetry';

const navItems = [
  { label: 'Live Feed', icon: 'videocam', to: '/live-feed' },
  { label: 'Workers', icon: 'badge', to: '/workers' },
  { label: 'Analytics', icon: 'insert_chart', to: '/analytics' },
];

const LIVE_TICK_MS = 1000;
const HISTORY_LIMIT = 30;
const CHART_WIDTH = 320;
const CHART_HEIGHT = 108;
const CHART_LEFT = 12;
const CHART_RIGHT = 308;
const CHART_TOP = 14;
const CHART_BOTTOM = 94;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
};

const formatClockLabel = (timestampMs) => new Date(timestampMs).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const formatInsightTime = (timestampMs) => new Date(timestampMs).toLocaleTimeString([], {
  hour: 'numeric',
  minute: '2-digit',
});

const normalizeStatus = (status) => {
  const normalized = String(status || 'outside').toLowerCase();
  if (normalized === 'working') return 'active';
  return normalized;
};

const getWorkerId = (worker, index) => worker.worker_id || worker.workerId || worker.id || index + 1;

const getIntensityColor = (value) => {
  if (value >= 70) return '#22C55E';
  if (value >= 40) return '#F59E0B';
  return '#F97316';
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
  return `${linePath} L ${lastPoint.x} ${CHART_BOTTOM} L ${firstPoint.x} ${CHART_BOTTOM} Z`;
};

const buildAxisLabels = (points) => {
  if (points.length === 0) return [];

  const desiredLabels = Math.min(4, points.length);
  const step = desiredLabels === 1 ? 0 : (points.length - 1) / (desiredLabels - 1);
  const indexes = new Set(Array.from({ length: desiredLabels }, (_, index) => Math.round(index * step)));

  return [...indexes].sort((a, b) => a - b).map((index) => ({
    x: points[index].x,
    label: points[index].label,
  }));
};

const buildChartPoints = (history) => {
  if (!history.length) return [];
  const step = history.length > 1 ? (CHART_RIGHT - CHART_LEFT) / (history.length - 1) : 0;

  return history.map((point, index) => ({
    ...point,
    x: CHART_LEFT + index * step,
    y: CHART_BOTTOM - (point.intensity / 100) * (CHART_BOTTOM - CHART_TOP),
  }));
};

const computeLiveDurations = (worker, nowMs) => {
  const status = normalizeStatus(worker.status);
  const capturedAtMs = Number(worker.capturedAtMs || nowMs);
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - capturedAtMs) / 1000));
  const baseIdleSeconds = Math.max(0, Number(worker.idle_duration_seconds || worker.idleDurationSeconds || 0));
  const baseTotalSeconds = Math.max(0, Number(worker.total_time_in_shop || worker.totalTimeInShop || 0));
  const baseActiveSeconds = Math.max(0, baseTotalSeconds - baseIdleSeconds);

  if (status === 'active') {
    return {
      activeSeconds: baseActiveSeconds + elapsedSeconds,
      idleSeconds: 0,
    };
  }

  if (status === 'idle' || status === 'alert') {
    return {
      activeSeconds: baseActiveSeconds,
      idleSeconds: baseIdleSeconds + elapsedSeconds,
    };
  }

  return {
    activeSeconds: baseActiveSeconds,
    idleSeconds: status === 'outside' ? 0 : baseIdleSeconds,
  };
};

const computeActivityIntensity = (worker) => {
  const status = normalizeStatus(worker.status);
  const movementScore = Math.max(0, Number(worker.movement_score || worker.movementScore || 0));
  const idleSeconds = Math.max(0, Number(worker.idleSeconds || 0));

  if (status === 'active') {
    return clamp(64 + movementScore * 8, 64, 100);
  }

  if (status === 'idle') {
    return clamp(42 - idleSeconds * 0.18, 14, 46);
  }

  if (status === 'alert') {
    return clamp(22 - Math.max(0, idleSeconds - 120) * 0.04, 4, 22);
  }

  return 0;
};

const toWorkerCard = (worker, index, nowMs) => {
  const id = getWorkerId(worker, index);
  const status = normalizeStatus(worker.status);
  const { activeSeconds, idleSeconds } = computeLiveDurations(worker, nowMs);
  const totalSeconds = activeSeconds + idleSeconds;
  const efficiency = totalSeconds > 0 ? Math.round((activeSeconds / totalSeconds) * 100) : 0;
  const station = worker.station || worker.zone || worker.station_name || worker.zone_name || (worker.in_zone === false ? 'Out of Zone' : 'Authorized Zone');
  const idleMinutes = Math.floor(idleSeconds / 60);

  return {
    id,
    name: worker.name || `Worker ${id}`,
    role: worker.role || (worker.in_zone === false ? 'Outside Zone' : 'Tracked Worker'),
    station,
    status,
    performance: `${efficiency}%`,
    performanceValue: efficiency,
    efficiency,
    active: formatDuration(activeSeconds),
    idle: formatDuration(idleSeconds),
    activeSeconds,
    idleSeconds,
    idleMinutes,
    movementScore: Math.max(0, Number(worker.movement_score || worker.movementScore || 0)),
  };
};

const updateActivityHistory = (previousHistory, workers, nowMs) => {
  const nextHistory = {};

  workers.forEach((worker) => {
    const timestamp = Math.floor(nowMs / 1000) * 1000;
    const priorSeries = previousHistory[worker.id] || [];
    const previousPoint = priorSeries[priorSeries.length - 1];
    const rawIntensity = computeActivityIntensity(worker);
    const intensity = previousPoint
      ? clamp(previousPoint.intensity * 0.65 + rawIntensity * 0.35, 0, 100)
      : rawIntensity;
    const nextPoint = {
      timestamp,
      label: formatClockLabel(timestamp),
      intensity,
      rawIntensity,
      status: worker.status,
    };

    if (previousPoint && previousPoint.timestamp === timestamp) {
      nextHistory[worker.id] = [...priorSeries.slice(0, -1), nextPoint];
    } else {
      nextHistory[worker.id] = [...priorSeries, nextPoint].slice(-HISTORY_LIMIT);
    }
  });

  return nextHistory;
};

const WorkerActivityChart = ({ history, workerName, chartId }) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const points = useMemo(() => buildChartPoints(history), [history]);
  const linePath = useMemo(() => buildCurvePath(points), [points]);
  const areaPath = useMemo(() => buildAreaPath(points), [points]);
  const axisLabels = useMemo(() => buildAxisLabels(points), [points]);
  const peakPoint = useMemo(() => {
    if (!points.length) return null;
    return points.reduce((best, point) => (point.intensity > best.intensity ? point : best), points[0]);
  }, [points]);
  const lineStops = useMemo(() => {
    if (!points.length) return [];
    return points.map((point, index) => ({
      offset: points.length === 1 ? 0 : (index / (points.length - 1)) * 100,
      color: getIntensityColor(point.intensity),
    }));
  }, [points]);

  const handleGraphHover = (event) => {
    if (!points.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * (CHART_RIGHT - CHART_LEFT) + CHART_LEFT;
    const nearest = points.reduce((best, point) => {
      if (!best) return point;
      return Math.abs(point.x - relativeX) < Math.abs(best.x - relativeX) ? point : best;
    }, null);
    setHoveredPoint(nearest);
  };

  return (
    <div className="relative mt-3 overflow-hidden rounded-xl bg-[#0B0F14]/72 px-3 pb-7 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <svg className="h-[126px] w-full overflow-visible" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`${workerName} activity over time`}>
        <defs>
          <linearGradient id={`activity-area-${chartId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(34,197,94,0.22)" />
            <stop offset="65%" stopColor="rgba(245,158,11,0.08)" />
            <stop offset="100%" stopColor="rgba(11,15,20,0)" />
          </linearGradient>
          <linearGradient id={`activity-line-${chartId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            {lineStops.map((stop) => (
              <stop key={`${stop.offset}-${stop.color}`} offset={`${stop.offset}%`} stopColor={stop.color} />
            ))}
          </linearGradient>
          <filter id={`glow-${chartId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[22, 48, 74].map((y) => (
          <line key={y} x1={CHART_LEFT} x2={CHART_RIGHT} y1={y} y2={y} stroke="rgba(154,164,178,0.08)" strokeWidth="1" />
        ))}
        {points.length > 0 && (
          <>
            <path d={areaPath} fill={`url(#activity-area-${chartId})`} />
            <path
              d={linePath}
              fill="none"
              stroke={`url(#activity-line-${chartId})`}
              strokeWidth="3.5"
              strokeLinecap="round"
              filter={`url(#glow-${chartId})`}
              style={{ transition: 'all 600ms ease' }}
            />
          </>
        )}
        {peakPoint && (
          <>
            <circle cx={peakPoint.x} cy={peakPoint.y} r="9" fill="rgba(34,197,94,0.12)" />
            <circle cx={peakPoint.x} cy={peakPoint.y} r="4.5" fill="#DCFCE7" stroke="#22C55E" strokeWidth="2" />
          </>
        )}
        {hoveredPoint && (
          <>
            <line x1={hoveredPoint.x} x2={hoveredPoint.x} y1={CHART_TOP} y2={CHART_BOTTOM} stroke="rgba(148,163,184,0.22)" strokeDasharray="4 4" />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="4.5" fill="#0B0F14" stroke={getIntensityColor(hoveredPoint.intensity)} strokeWidth="2.5" />
          </>
        )}
        <rect
          x={CHART_LEFT}
          y={CHART_TOP}
          width={CHART_RIGHT - CHART_LEFT}
          height={CHART_BOTTOM - CHART_TOP}
          fill="transparent"
          onMouseMove={handleGraphHover}
          onMouseLeave={() => setHoveredPoint(null)}
        />
      </svg>

      {hoveredPoint && (
        <div
          className="pointer-events-none absolute rounded-xl border border-white/10 bg-[#121821]/96 px-3 py-2 text-xs shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
          style={{
            left: `calc(${((hoveredPoint.x - CHART_LEFT) / (CHART_RIGHT - CHART_LEFT)) * 100}% - 44px)`,
            top: `${Math.max(8, hoveredPoint.y - 8)}px`,
          }}
        >
          <p className="font-black text-[#E6EDF3]">{hoveredPoint.label}</p>
          <p style={{ color: getIntensityColor(hoveredPoint.intensity) }}>
            Activity {Math.round(hoveredPoint.intensity)}%
          </p>
          <p className="text-[#9AA4B2]">{hoveredPoint.status.toUpperCase()}</p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-3 bottom-2 text-[10px] font-bold text-[#7D8793]">
        {axisLabels.map(({ x, label }, index) => (
          <span
            key={`${label}-${index}`}
            className="absolute -translate-x-1/2"
            style={{ left: `calc(${(x / CHART_WIDTH) * 100}%)` }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

const WorkerCard = ({ worker, history, onNameChange }) => {
  const isIdle = worker.status === 'idle' || worker.status === 'alert';
  const isCriticalIdle = worker.idleSeconds >= 300;
  const statusLabel = worker.status === 'active'
    ? 'Active'
    : worker.status.charAt(0).toUpperCase() + worker.status.slice(1);
  const idleLabel = worker.idleSeconds > 0
    ? `Idle for ${worker.idleMinutes > 0 ? `${worker.idleMinutes} min` : `${worker.idleSeconds}s`}`
    : 'No idle time logged';

  const peakPoint = useMemo(() => {
    if (!history.length) return null;
    return history.reduce((best, point) => (point.intensity > best.intensity ? point : best), history[0]);
  }, [history]);

  const lowPoint = useMemo(() => {
    const idlePoints = history.filter((point) => point.status === 'idle' || point.status === 'alert');
    if (!idlePoints.length) return null;
    return idlePoints.reduce((worst, point) => (point.intensity < worst.intensity ? point : worst), idlePoints[0]);
  }, [history]);

  return (
    <article
      className={`group relative min-h-[320px] w-full rounded-2xl border bg-[#121821] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.025)] transition duration-300 hover:-translate-y-1 hover:bg-[#16202A] ${
        isCriticalIdle
          ? 'border-red-500/45 shadow-[0_20px_60px_rgba(0,0,0,0.28),0_0_30px_rgba(239,68,68,0.18),inset_0_1px_0_rgba(255,255,255,0.025)] hover:border-red-400/55'
          : isIdle
            ? 'border-amber-500/35 shadow-[0_20px_60px_rgba(0,0,0,0.28),0_0_24px_rgba(245,158,11,0.12),inset_0_1px_0_rgba(255,255,255,0.025)] hover:border-amber-400/45'
            : 'border-emerald-500/20 shadow-[0_20px_60px_rgba(0,0,0,0.28),0_0_22px_rgba(34,197,94,0.1),inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-emerald-400/35'
      }`}
    >
      <button className="absolute right-7 top-8 text-[#9AA4B2] transition duration-200 hover:text-[#E6EDF3]" aria-label={`More actions for ${worker.name}`}>
        <span className="material-symbols-outlined text-[26px]">more_vert</span>
      </button>

      <div className="mt-2 pr-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className={`mt-2 h-3 w-3 shrink-0 rounded-full ${isIdle ? 'bg-[#F59E0B] shadow-[0_0_10px_rgba(245,158,11,0.85)]' : 'bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.85)]'}`} />
              <input
                type="text"
                value={worker.name}
                onChange={(e) => onNameChange(worker.id, e.target.value)}
                className="w-full border-b border-transparent bg-transparent font-['Epilogue'] text-[1.45rem] font-bold leading-tight text-[#E6EDF3] outline-none transition-colors focus:border-blue-500/50"
                placeholder={`Worker ${worker.id}`}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.82rem] font-bold uppercase tracking-[0.14em] text-[#9AA4B2]">
              <span>ID #{worker.id}</span>
              <span className="text-[#445061]">|</span>
              <span>{worker.role}</span>
            </div>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] ${
            isCriticalIdle
              ? 'bg-red-500/12 text-red-300 shadow-[0_0_16px_rgba(239,68,68,0.15)]'
              : isIdle
                ? 'bg-amber-500/12 text-amber-200'
                : 'bg-emerald-500/12 text-emerald-200 shadow-[0_0_16px_rgba(34,197,94,0.12)]'
          }`}>
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="mt-7 rounded-2xl bg-[#0B0F14]/85 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.72rem] font-black uppercase tracking-[0.14em] text-[#7D8793]">Station</p>
            <p className="mt-1 text-sm font-semibold text-[#E6EDF3]">{worker.station}</p>
          </div>
          <div className="text-right">
            <p className="text-[0.72rem] font-black uppercase tracking-[0.14em] text-[#7D8793]">Efficiency</p>
            <p className={`mt-1 font-['Epilogue'] text-[1.35rem] font-black ${isIdle ? 'text-[#F59E0B]' : 'text-[#8BDCB0]'}`}>
              {worker.performance}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-4">
            <span className="text-[0.9rem] font-medium text-[#E6EDF3]">Worker Activity</span>
            <span className="text-[0.8rem] font-semibold text-[#7D8793]">
              {worker.status === 'active' ? 'Live movement detected' : worker.status === 'alert' ? 'Extended idle period' : 'Activity cooling'}
            </span>
          </div>
          <WorkerActivityChart history={history} workerName={worker.name} chartId={worker.id} />
          <div className="mt-4 space-y-2 text-xs font-medium text-[#AEB8C5]">
            <p>{peakPoint ? `Most active at ${formatInsightTime(peakPoint.timestamp)}.` : 'Collecting enough live activity to spot a peak.'}</p>
            <p>{lowPoint ? `Idle spike detected at ${formatInsightTime(lowPoint.timestamp)}.` : 'No idle spike detected in the current activity window.'}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-[#0B0F14]/70 p-4">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-[#9AA4B2]">Active Time</p>
          <p className="mt-2 text-[1.08rem] font-bold text-[#E6EDF3]">{worker.active}</p>
        </div>
        <div className="rounded-xl bg-[#0B0F14]/70 p-4">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-[#9AA4B2]">Idle Time</p>
          <p className={`mt-2 text-[1.08rem] font-bold ${isIdle ? 'text-[#F59E0B]' : 'text-[#E6EDF3]'}`}>
            {worker.idle}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <span className={`inline-flex rounded-full px-3 py-1 font-semibold ${
          isCriticalIdle
            ? 'bg-red-500/12 text-red-200 shadow-[0_0_18px_rgba(239,68,68,0.14)]'
            : isIdle
              ? 'bg-amber-500/12 text-amber-200'
              : 'bg-emerald-500/12 text-emerald-200'
        }`}>
          {idleLabel}
        </span>
        <span className="text-[#7D8793]">{worker.station}</span>
      </div>
    </article>
  );
};

const Dashboard = () => {
  const [apiWorkers, setApiWorkers] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [workerNames, setWorkerNames] = useState(() => {
    const saved = localStorage.getItem('workerNames');
    return saved ? JSON.parse(saved) : {};
  });
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [activityHistory, setActivityHistory] = useState({});
  const liveWorkersRef = useRef([]);

  useEffect(() => {
    localStorage.setItem('workerNames', JSON.stringify(workerNames));
  }, [workerNames]);

  const handleNameChange = (id, newName) => {
    setWorkerNames((prev) => ({
      ...prev,
      [id]: newName,
    }));
  };

  useEffect(() => {
    let isMounted = true;

    const loadWorkers = async () => {
      try {
        const fetchedAt = Date.now();
        const fetchedWorkers = await fetchWorkersFromApi();
        if (!isMounted) return;

        setApiWorkers(fetchedWorkers.map((worker) => ({
          ...worker,
          capturedAtMs: fetchedAt,
        })));
        setLoadState('ready');
      } catch (error) {
        console.error('Failed to fetch workers:', error);
        if (isMounted) setLoadState('error');
      }
    };

    loadWorkers();
    const interval = setInterval(loadWorkers, LIVE_TICK_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLiveNowMs(now);
      setActivityHistory((previous) => updateActivityHistory(previous, liveWorkersRef.current, now));
    }, LIVE_TICK_MS);

    return () => clearInterval(interval);
  }, []);

  const workers = useMemo(() => apiWorkers.map((worker, index) => {
    const card = toWorkerCard(worker, index, liveNowMs);
    card.name = workerNames[card.id] !== undefined ? workerNames[card.id] : card.name;
    return card;
  }), [apiWorkers, liveNowMs, workerNames]);

  useEffect(() => {
    liveWorkersRef.current = workers;
    setActivityHistory((previous) => updateActivityHistory(previous, workers, liveNowMs));
  }, [liveNowMs, workers]);

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
                  isActive && item.label === 'Workers'
                    ? 'bg-[#121821] text-[#E6EDF3] shadow-[0_0_24px_rgba(59,130,246,0.14),inset_3px_0_0_rgba(59,130,246,0.7)]'
                    : 'text-[#9AA4B2] hover:bg-[#121821]/70 hover:text-[#E6EDF3]'
                }`}
              >
                <span className="material-symbols-outlined text-[24px] text-[#7C8795]">
                  {item.icon}
                </span>
                <span className="text-[1.05rem] font-semibold">{item.label}</span>
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
          <div className="mb-14">
            <h1 className="font-['Epilogue'] text-[2.9rem] font-black leading-none tracking-tight text-[#E6EDF3]">
              Worker Directory
            </h1>
            <p className="mt-4 max-w-3xl text-[1.02rem] font-medium text-[#9AA4B2]">
              Live status, efficiency, and idle exposure across active stations.
            </p>
          </div>

          <div className="grid gap-10 [grid-template-columns:repeat(auto-fit,minmax(380px,1fr))]">
            {workers.map((worker) => (
              <WorkerCard
                key={worker.id}
                worker={worker}
                history={activityHistory[worker.id] || []}
                onNameChange={handleNameChange}
              />
            ))}

            {workers.length === 0 && (
              <div className="flex min-h-[280px] items-center rounded-2xl border border-[#1F2933] bg-[#121821] p-8 text-[#9AA4B2] shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
                {loadState === 'error'
                  ? 'Unable to load worker tracking data right now.'
                  : 'Waiting for worker tracking data.'}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export default Dashboard;
