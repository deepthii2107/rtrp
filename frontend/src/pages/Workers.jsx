import React, { useState, useEffect } from 'react';
import '../App.css';
import { fetchWorkers as fetchWorkersFromApi } from '../lib/telemetry';

const Workers = () => {
  const [workers, setWorkers] = useState([]);
  const [workerNames, setWorkerNames] = useState(() => {
    const saved = localStorage.getItem('workerNames');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('workerNames', JSON.stringify(workerNames));
  }, [workerNames]);

  useEffect(() => {
    const loadWorkers = async () => {
      try {
        setWorkers(await fetchWorkersFromApi());
      } catch (error) {
        console.error('Failed to fetch worker data:', error);
      }
    };

    loadWorkers();
    const interval = setInterval(loadWorkers, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleNameChange = (id, newName) => {
    setWorkerNames(prev => ({
      ...prev,
      [id]: newName
    }));
  };

  return (
    <main className="min-h-[calc(100vh-88px)] bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_68%)] px-4 pb-6 pt-4 text-[#E2E8F0] lg:px-6">
      <div className="mx-auto max-w-[1560px]">
        <header className="mb-8">
          <h1 className="font-['Epilogue'] text-[2rem] font-semibold leading-none tracking-tight text-[#E2E8F0]">
            Workers Directory
          </h1>
          <p className="mt-2 text-lg font-medium text-[#94A3B8]">Manage and track active worker status</p>
        </header>

        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))] 2xl:[grid-template-columns:repeat(auto-fit,minmax(360px,1fr))]">
          {workers.map((worker, index) => {
            const id = worker.workerId || worker.id || worker.worker_id || index;
            const status = worker.status || 'Unknown';
            const name = workerNames[id] !== undefined ? workerNames[id] : `Worker ${id}`;
            const isIdle = status.toLowerCase() === 'idle';
            const isAlert = status.toLowerCase() === 'alert';

            return (
              <div key={id} className="relative min-h-[190px] overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.05)] bg-[#0f172a] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.03)] transition duration-200 hover:-translate-y-1">
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Worker Name</p>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => handleNameChange(id, e.target.value)}
                      className="w-full bg-transparent font-['Epilogue'] text-xl font-bold text-slate-100 outline-none border-b-2 border-transparent focus:border-sky-500/50 transition-colors placeholder:text-slate-600"
                      placeholder={`Enter name for Worker ${id}`}
                    />
                  </div>
                  
                  <div className="flex items-end justify-between mt-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">ID Tracking</p>
                      <p className="mt-1 font-mono text-sm text-slate-300">#{id}</p>
                    </div>
                    
                    <div className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                      isAlert ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.2)]' :
                      isIdle ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 
                      'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {status}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {workers.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-[#0f172a]/50 py-16 text-center shadow-[inset_0_2px_20px_rgba(0,0,0,0.2)]">
             <span className="material-symbols-outlined mb-4 text-[48px] text-slate-600" style={{ fontVariationSettings: "'FILL' 1" }}>group_off</span>
             <h3 className="font-['Epilogue'] text-xl font-semibold text-slate-300">No Active Workers</h3>
             <p className="mt-2 text-slate-500">Currently not tracking any workers in the zone.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Workers;
