import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../services/apiService';
import { useAuthStore } from '../../stores/authStore';

type Tab = 'login' | 'register';

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'TEACHER' | 'STUDENT'>('STUDENT');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const resetForm = () => {
    setUsername(''); setEmail(''); setPassword(''); setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, username: u, role: r } = await auth.login({ username, password });
      setAuth(token, u, r);
      navigate(r === 'TEACHER' ? '/teacher/dashboard' : '/student/join');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await auth.register({ username, email, password, role });
      setAuth(resp.token, resp.username, resp.role);
      navigate(resp.role === 'TEACHER' ? '/teacher/dashboard' : '/student/join');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const ic = 'w-full px-4 py-3 rounded-xl input-race text-white placeholder-gray-500 text-sm';

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #08090f 0%, #0d1117 55%, #08090f 100%)' }}
    >
      {/* Background atmosphere */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {[8, 23, 40, 57, 74, 90].map((top, i) => (
          <div
            key={i}
            className="absolute h-px"
            style={{
              top: `${top}%`, left: '-5%', right: '-5%',
              background: 'linear-gradient(to right, transparent, rgba(255,215,0,0.06), transparent)',
            }}
          />
        ))}
        {['🏎️', '🚗', '🏁', '⚡', '🏆', '🚀'].map((emoji, i) => (
          <span
            key={i}
            className="absolute text-3xl opacity-[0.04] animate-float select-none"
            style={{
              left: `${5 + i * 18}%`,
              top: `${12 + (i % 3) * 28}%`,
              animationDelay: `${i * 0.6}s`,
            }}
          >
            {emoji}
          </span>
        ))}
      </div>

      <div className="relative w-full max-w-sm mx-4 animate-slide-up">
        {/* Top checkered accent */}
        <div
          className="h-3 rounded-t-2xl"
          style={{
            background: 'repeating-conic-gradient(rgba(255,255,255,0.12) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px',
          }}
        />

        <div className="card-glass rounded-b-2xl p-8 space-y-6 shadow-2xl">
          {/* Logo */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-3xl animate-float" style={{ animationDelay: '0.2s' }}>🏎️</span>
              <h1 className="text-4xl font-black text-gold tracking-tight">MathU</h1>
              <span className="text-3xl animate-float" style={{ animationDelay: '0.5s' }}>🏁</span>
            </div>
            <p className="text-gray-500 text-xs font-semibold tracking-[0.2em] uppercase mt-1">
              Race · Learn · Win
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
            {(['login', 'register'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); resetForm(); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 capitalize ${
                  tab === t
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-950/80 border border-red-500/40 text-red-400 text-sm px-4 py-3 rounded-xl animate-slide-down">
              ⚠️ {error}
            </div>
          )}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                className={ic}
                placeholder="Username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
              <input
                type="password"
                className={ic}
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 btn-primary rounded-xl text-white font-bold text-sm mt-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? '⚙️ Signing in…' : '🏁 Start Racing'}
              </button>
              <p className="text-xs text-gray-600 text-center pt-1">
                Demo: <span className="font-mono text-gray-500">teacher_demo / TeachMe2024!</span>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              <input className={ic} placeholder="Username" autoComplete="username"
                value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
              <input type="email" className={ic} placeholder="Email" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input type="password" className={ic} placeholder="Password" autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required />

              <div className="grid grid-cols-2 gap-2 pt-1">
                {(['STUDENT', 'TEACHER'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`py-3 rounded-xl text-sm font-bold transition-all duration-200 border ${
                      role === r
                        ? r === 'TEACHER'
                          ? 'bg-green-700/30 border-green-500/60 text-green-300'
                          : 'bg-blue-700/30 border-blue-500/60 text-blue-300'
                        : 'bg-transparent border-gray-700/60 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {r === 'TEACHER' ? '👩‍🏫 Teacher' : '🎓 Student'}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 btn-primary rounded-xl text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? '⚙️ Creating account…' : '🚀 Join the Race'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
