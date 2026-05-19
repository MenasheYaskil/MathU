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
    setUsername('');
    setEmail('');
    setPassword('');
    setError(null);
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
      // register returns AuthResponse (token + role) — log in immediately
      setAuth(resp.token, resp.username, resp.role);
      navigate(resp.role === 'TEACHER' ? '/teacher/dashboard' : '/student/join');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-xl w-full max-w-sm shadow-xl space-y-5">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white tracking-tight">MathU</h1>
          <p className="text-gray-400 text-sm mt-1">Race to the finish line</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-gray-700 rounded-lg p-1">
          {(['login', 'register'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); resetForm(); }}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && (
          <p className="bg-red-900/50 border border-red-600 text-red-300 text-sm px-3 py-2 rounded">
            {error}
          </p>
        )}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              className="w-full px-4 py-2 rounded bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="password"
              className="w-full px-4 py-2 rounded bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-xs text-gray-500 text-center">
              Demo — teacher: <span className="font-mono">teacher_demo / TeachMe2024!</span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <input
              className="w-full px-4 py-2 rounded bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="email"
              className="w-full px-4 py-2 rounded bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="w-full px-4 py-2 rounded bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex gap-2">
              {(['STUDENT', 'TEACHER'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded font-medium text-sm transition-colors ${
                    role === r
                      ? r === 'TEACHER' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {r === 'TEACHER' ? 'Teacher' : 'Student'}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded transition-colors"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
