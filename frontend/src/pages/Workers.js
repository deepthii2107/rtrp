import React, { useState, useEffect } from 'react';
import Card from '../components/Card';
import '../App.css';

const Workers = () => {
  const [workers, setWorkers] = useState([]);

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/workers');
        if (response.ok) {
          const data = await response.json();
          let workersList = [];
          
          if (Array.isArray(data)) {
            workersList = data;
          } else if (data && typeof data === 'object') {
            workersList = data.workers 
              ? Object.entries(data.workers).map(([id, w]) => ({ workerId: id, ...w })) 
              : Object.entries(data).map(([id, w]) => ({ workerId: id, ...w }));
          }
          
          setWorkers(workersList);
        }
      } catch (error) {
        console.error('Failed to fetch worker data:', error);
      }
    };

    fetchWorkers();
    const interval = setInterval(fetchWorkers, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="main-content">
      <header className="dashboard-header">
        <h1>Workers Directory</h1>
        <p className="dashboard-subtitle">Manage and view worker details</p>
      </header>

      <div className="stats-grid">
        {workers.map((worker, index) => {
          const id = worker.workerId || worker.id || worker.worker_id || index;
          const status = worker.status || 'Unknown';
          return (
            <Card key={id} title={`Worker ID: ${id}`}>
              <div style={{ marginTop: '12px', fontSize: '1.25rem', fontWeight: 600, color: status.toLowerCase() === 'idle' ? '#f59e0b' : '#10b981' }}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </div>
            </Card>
          );
        })}
        {workers.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No active workers are currently tracked.</p>}
      </div>
    </div>
  );
};

export default Workers;
