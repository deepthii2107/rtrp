import React, { useState, useEffect } from 'react';
import Card from '../components/Card';
import '../App.css';

const Dashboard = () => {
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    idle: 0,
  });

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
            // Unpack based on possible dictionary payload
            workersList = data.workers ? Object.values(data.workers) : Object.values(data);
          }
          
          let activeCount = 0;
          let idleCount = 0;
          
          workersList.forEach(w => {
            const status = typeof w === 'string' ? w : (w.status || '').toLowerCase();
            if (status === 'active' || status === 'working' || w.active === true) {
              activeCount++;
            } else if (status === 'idle' || status === 'alert' || w.active === false) {
              idleCount++;
            } else {
              activeCount++;
            }
          });
          
          setStats({
            total: workersList.length,
            active: activeCount,
            idle: idleCount
          });
        }
      } catch (error) {
        console.error('Failed to fetch worker data:', error);
      }
    };

    fetchWorkers();
    const interval = setInterval(fetchWorkers, 1000); // Fetch every second
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="main-content">
      <header className="dashboard-header">
        <h1>Worker Monitoring</h1>
        <p className="dashboard-subtitle">Real-time tracking & analytics</p>
      </header>

      <div className="stats-grid">
        <Card title="Total Workers" value={stats.total} />
        <Card title="Active Workers" value={stats.active} />
        <Card title="Idle Workers" value={stats.idle} />
      </div>

      <section className="video-section">
        <div className="video-section-header">
          <div className="status-dot"></div>
          <h2>Live Monitoring</h2>
        </div>
        <div className="video-container">
          <img src="http://127.0.0.1:8000/video" alt="Live stream" />
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
