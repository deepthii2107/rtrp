import React from 'react';
import { NavLink } from 'react-router-dom';

const Sidebar = () => {
  return (
    <aside className="flex flex-col h-screen w-72 rounded-r-[2rem] border-none bg-[#faf9f6] sticky left-0 top-0 py-8 gap-2 shadow-[20px_0_40px_rgba(26,28,26,0.02)] z-50">
      {/* Brand Header */}
      <div className="px-8 mb-8">
        <h2 className="text-2xl font-black text-[#322118] tracking-tight antialiased">Monitor</h2>
      </div>

      {/* Profile Section */}
      <div className="px-8 mb-10 flex flex-col items-start font-['Epilogue'] tracking-tight antialiased">
        <img
          alt="Barista Profile"
          className="w-16 h-16 rounded-full mb-4 object-cover shadow-sm"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCp6Z2uAlM0pEPc6cmvaaSg-J2DOHO4YaD5-pZ2uppQBfe-ZunIQupzq_OjjF3mhpQEEyxzoBMfr9ICI4aFTIR1pB6BnqsXfsNWurJTe_uamxQZfnWDHbSr1r9iwU9zE3J6FnQ30S2aXBsmRc0N_0nABIa4TuNPeS-tW3W9I1g31ssKndkEKdIojPesCv7fv9WiV9RGgu4vLmL0BiIkl9aJCIfeGeG-zPPeFIAEsxrEN-LRWx-OeLRPzGLW6qaToCw28IlJKxyMLKY"
        />
        <h3 className="text-lg font-bold text-[#322118]">Marcus Vane</h3>
        <p className="text-sm text-on-surface-variant">Head Roaster</p>
        <p className="text-[10px] uppercase tracking-widest mt-1 text-primary/40 font-bold">Shift: 06:00 - 14:00</p>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 space-y-1">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => isActive
            ? "flex items-center gap-4 bg-gradient-to-r from-[#322118] to-[#49362c] text-white rounded-full px-6 py-3 font-semibold shadow-lg mx-4 transform transition-transform active:scale-95"
            : "flex items-center gap-4 text-[#4e453d] px-6 py-3 font-medium mx-4 hover:bg-[#f4f3f1] transition-all duration-300 rounded-full"
          }
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>dashboard</span>
          <span>Dashboard</span>
        </NavLink>
        <NavLink
          to="/live-orders"
          className={({ isActive }) => isActive
            ? "flex items-center gap-4 bg-gradient-to-r from-[#322118] to-[#49362c] text-white rounded-full px-6 py-3 font-semibold shadow-lg mx-4 transform transition-transform active:scale-95"
            : "flex items-center gap-4 text-[#4e453d] px-6 py-3 font-medium mx-4 hover:bg-[#f4f3f1] transition-all duration-300 rounded-full"
          }
        >
          {/* <span className="material-symbols-outlined">coffee_maker</span>
          <span>Live Orders</span>
        </NavLink>
        <NavLink 
          to="/inventory" 
          className={({isActive}) => isActive 
            ? "flex items-center gap-4 bg-gradient-to-r from-[#322118] to-[#49362c] text-white rounded-full px-6 py-3 font-semibold shadow-lg mx-4 transform transition-transform active:scale-95" 
            : "flex items-center gap-4 text-[#4e453d] px-6 py-3 font-medium mx-4 hover:bg-[#f4f3f1] transition-all duration-300 rounded-full"
          }
        >
          <span className="material-symbols-outlined">inventory</span>
          <span>Inventory</span>
        </NavLink>
        <NavLink 
          to="/staff-clock" 
          className={({isActive}) => isActive 
            ? "flex items-center gap-4 bg-gradient-to-r from-[#322118] to-[#49362c] text-white rounded-full px-6 py-3 font-semibold shadow-lg mx-4 transform transition-transform active:scale-95" 
            : "flex items-center gap-4 text-[#4e453d] px-6 py-3 font-medium mx-4 hover:bg-[#f4f3f1] transition-all duration-300 rounded-full"
          }
        >
          <span className="material-symbols-outlined">timer</span>
          <span>Staff Clock</span>
        </NavLink>
        <NavLink 
          to="/analytics" 
          className={({isActive}) => isActive 
            ? "flex items-center gap-4 bg-gradient-to-r from-[#322118] to-[#49362c] text-white rounded-full px-6 py-3 font-semibold shadow-lg mx-4 transform transition-transform active:scale-95" 
            : "flex items-center gap-4 text-[#4e453d] px-6 py-3 font-medium mx-4 hover:bg-[#f4f3f1] transition-all duration-300 rounded-full"
          }
        >
          <span className="material-symbols-outlined">analytics</span>
          <span>Analytics</span> */}
        </NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
