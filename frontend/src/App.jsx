import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Analytics from './pages/Analytics';
import Dashboard from './pages/Dashboard';
import LiveFeed from './pages/LiveFeed';
import Login from './pages/Login';
import './App.css';

const getStoredToken = () => localStorage.getItem('token');

const AppShell = () => {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getStoredToken() || localStorage.getItem('brewmonitor-auth') === 'true'));
  const showNavbar = location.pathname !== '/login';

  const syncAuthState = useCallback(() => {
    const hasToken = Boolean(getStoredToken());
    if (hasToken) {
      localStorage.setItem('brewmonitor-auth', 'true');
    }
    setIsAuthenticated(hasToken);
  }, []);

  useEffect(() => {
    syncAuthState();
    window.addEventListener('storage', syncAuthState);
    return () => window.removeEventListener('storage', syncAuthState);
  }, [syncAuthState]);

  const handleLogin = useCallback((token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('brewmonitor-auth', 'true');
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('brewmonitor-auth');
    setIsAuthenticated(false);
  }, []);

  const ProtectedRoute = ({ children }) => {
    return isAuthenticated ? children : <Navigate to="/login" replace />;
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#0B0F14] text-[#E6EDF3]">
      {showNavbar && <Navbar isAuthenticated={isAuthenticated} onLogout={handleLogout} />}
      <Routes>
        <Route
          path="/"
          element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
        />
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login onLogin={handleLogin} />}
        />
        <Route
          path="/workers"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/live-feed"
          element={
            <ProtectedRoute>
              <LiveFeed />
            </ProtectedRoute>
          }
        />
        <Route
          path="/live-orders"
          element={
            <ProtectedRoute>
              <LiveFeed />
            </ProtectedRoute>
          }
        />
        <Route
          path="/live"
          element={
            <ProtectedRoute>
              <LiveFeed />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;
