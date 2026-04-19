import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../App.css';

const Sidebar = () => {
  const location = useLocation();

  const links = [
    { name: 'Dashboard', path: '/' },
    { name: 'Workers', path: '/workers' },
    { name: 'Alerts', path: '/alerts' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Monitor</div>
      <nav className="sidebar-nav">
        {links.map((link) => (
          <Link
            key={link.name}
            to={link.path}
            className={`sidebar-link ${location.pathname === link.path ? 'active' : ''}`}
          >
            {link.name}
          </Link>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
