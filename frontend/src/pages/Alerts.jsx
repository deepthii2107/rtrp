import React, { useState, useEffect } from 'react';
import Card from '../components/Card';
import '../App.css';
import { fetchAlerts as fetchAlertsFromApi } from '../lib/telemetry';

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        setAlerts(await fetchAlertsFromApi());
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      }
    };

    loadAlerts();
    const interval = setInterval(loadAlerts, 2000);
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
                   {alert.message || 'Alert details are currently unavailable.'}
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
