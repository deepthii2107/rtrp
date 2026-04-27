import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

const Navbar = ({ isAuthenticated, onLogout }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    onLogout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-[#1F2933] bg-[#0B0F14]/95 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between gap-6 px-8">
        <div className="flex min-w-0 items-center gap-12">
          <NavLink
            to="/dashboard"
            className="font-['Epilogue'] text-[1.45rem] font-black leading-none tracking-tight text-[#E6EDF3]"
          >
            Espresso Logic
          </NavLink>

          <div className="hidden items-center gap-16 text-[1rem] font-semibold text-[#C4CBD4] lg:flex">
            <NavLink to="/live-feed" className="transition duration-200 hover:text-white">
              Dashboard
            </NavLink>
            <NavLink to="/workers" className="transition duration-200 hover:text-white">
              Workers
            </NavLink>
            <NavLink to="/analytics" className="transition duration-200 hover:text-white">
              Analytics
            </NavLink>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <label className="hidden h-10 min-w-[320px] items-center gap-3 rounded-2xl border border-[#1F2933] bg-[#121821] px-4 text-[#9AA4B2] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] lg:flex">
            <span className="material-symbols-outlined text-[20px] text-[#9AA4B2]">search</span>
            <input
              type="text"
              placeholder="Global search..."
              className="w-full border-0 bg-transparent text-base font-medium text-[#E6EDF3] outline-none placeholder:text-[#7D8793]"
            />
          </label>

          <button className="grid h-11 w-11 place-items-center rounded-full text-[#9AA4B2] transition duration-200 hover:-translate-y-0.5 hover:text-white">
            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              notifications
            </span>
          </button>
          <button className="grid h-11 w-11 place-items-center rounded-full text-[#9AA4B2] transition duration-200 hover:-translate-y-0.5 hover:text-white">
            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              settings
            </span>
          </button>

          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-[#1F2933] bg-[#121821] px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#9AA4B2] transition duration-200 hover:-translate-y-0.5 hover:border-blue-400/35 hover:text-white"
            >
              Logout
            </button>
          ) : (
            <NavLink
              to="/login"
              className="rounded-full border border-[#1F2933] bg-[#121821] px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#9AA4B2] transition duration-200 hover:-translate-y-0.5 hover:border-blue-400/35 hover:text-white"
            >
              Sign In
            </NavLink>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
