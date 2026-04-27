import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = ({ onLogin }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => form.username.trim() && form.password.trim(), [form.password, form.username]);

  const handleChange = (field) => (event) => {
    setForm((previous) => ({
      ...previous,
      [field]: event.target.value,
    }));
    if (error) setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canSubmit) {
      setError('Invalid credentials');
      return;
    }

    setIsSubmitting(true);
    setError('');

    await new Promise((resolve) => setTimeout(resolve, 350));

    const token = `monitor-token-${Date.now()}`;
    localStorage.setItem('token', token);
    localStorage.setItem('brewmonitor-auth', 'true');
    onLogin(token);
    navigate('/dashboard', { replace: true });
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B0F14] px-6 py-12 text-[#E6EDF3]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.12),transparent_30%)]" />

      <section className="relative z-10 w-full max-w-[460px] rounded-[28px] border border-[#1F2933] bg-[#121821] p-8 shadow-[0_28px_80px_rgba(0,0,0,0.42),0_0_40px_rgba(59,130,246,0.08),inset_0_1px_0_rgba(255,255,255,0.03)]">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-[#1F2933] bg-[#0F1720] shadow-[0_0_24px_rgba(59,130,246,0.12)]">
            <span className="material-symbols-outlined text-[30px] text-[#7DD3FC]" style={{ fontVariationSettings: "'FILL' 1" }}>
              factory
            </span>
          </div>
          <p className="text-[0.82rem] font-black uppercase tracking-[0.2em] text-[#60A5FA]">Real-Time Worker Monitoring</p>
          <h1 className="mt-4 font-['Inter'] text-[2.3rem] font-black tracking-tight text-[#E6EDF3]">Sign In</h1>
          <p className="mt-3 text-[1rem] font-medium text-[#94A3B8]">Access your monitoring dashboard</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-[0.82rem] font-bold uppercase tracking-[0.16em] text-[#7D8793]">Email or Username</span>
            <div className="group flex min-h-[56px] items-center gap-3 rounded-2xl border border-[#1F2933] bg-[#0B1118] px-4 transition duration-200 focus-within:border-blue-400/55 focus-within:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]">
              <span className="material-symbols-outlined text-[20px] text-[#7D8793]">person</span>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange('username')}
                placeholder="Enter your username"
                autoComplete="username"
                className="w-full border-0 bg-transparent text-base font-medium text-[#E6EDF3] outline-none placeholder:text-[#536173]"
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-[0.82rem] font-bold uppercase tracking-[0.16em] text-[#7D8793]">Password</span>
            <div className="group flex min-h-[56px] items-center gap-3 rounded-2xl border border-[#1F2933] bg-[#0B1118] px-4 transition duration-200 focus-within:border-blue-400/55 focus-within:shadow-[0_0_0_4px_rgba(59,130,246,0.12)]">
              <span className="material-symbols-outlined text-[20px] text-[#7D8793]">lock</span>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange('password')}
                placeholder="Enter your password"
                autoComplete="current-password"
                className="w-full border-0 bg-transparent text-base font-medium text-[#E6EDF3] outline-none placeholder:text-[#536173]"
                required
              />
            </div>
          </label>

          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm font-medium text-red-300 transition-opacity duration-300">
              {error}
            </p>
          )}

          <button
            className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2563EB_0%,#38BDF8_100%)] px-5 text-base font-bold text-white shadow-[0_16px_38px_rgba(37,99,235,0.28)] transition duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_20px_46px_rgba(56,189,248,0.34)] disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

      </section>
    </main>
  );
};

export default Login;
