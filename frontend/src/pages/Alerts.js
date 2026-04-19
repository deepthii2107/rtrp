import React, { useState, useEffect } from 'react';
import Card from '../components/Card';
import '../App.css';

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/alerts');
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            setAlerts(data);
          } else if (data && data.alerts) {
            setAlerts(data.alerts);
          }
        }
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="main-content">
      <header className="dashboard-header">
        <h1>Alerts & Notifications</h1>
        <p className="dashboard-subtitle">Recent activity and idle alerts</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '800px' }}>
        {alerts.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No alerts</p>
        ) : (
          alerts.map((alert, index) => {
            const title = alert.type ? `Alert: ${alert.type.toUpperCase()}` : `Alert #${index + 1}`;
            return (
              <Card key={alert.id || index} title={title}>
                 <div style={{ marginTop: '8px', color: 'var(--text-primary)' }}>
                   {alert.message || JSON.stringify(alert)}
                 </div>
                 {alert.timestamp && (
                   <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                     Time: {new Date(alert.timestamp * 1000).toLocaleTimeString()}
                   </div>
                 )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Alerts;
