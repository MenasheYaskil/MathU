import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { races } from '../../../services/apiService';

export default function JoinLobby() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { raceId } = await races.join(code.trim().toUpperCase());
      navigate(`/student/race/${raceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code — check with your teacher.');
    } finally {
      setLoading(false);
    }
  };

  const filled = code.length;

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #08090f 0%, #0d1117 55%, #08090f 100%)' }}
    >
      {/* Background atmosphere */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {['🏎️', '⚡', '🏁', '🚗', '⭐', '🎯'].map((emoji, i) => (
          <span
            key={i}
            className="absolute text-4xl opacity-[0.04] animate-float"
            style={{
              left: `${5 + i * 17}%`,
              top: `${10 + (i % 3) * 30}%`,
              animationDelay: `${i * 0.5}s`,
            }}
          >
            {emoji}
          </span>
        ))}
        {[15, 35, 55, 75, 90].map((top, i) => (
          <div
            key={i}
            className="absolute h-px"
            style={{
              top: `${top}%`, left: '-5%', right: '-5%',
              background: 'linear-gradient(to right, transparent, rgba(59,130,246,0.07), transparent)',
            }}
          />
        ))}
      </div>

      <div className="relative w-full max-w-sm mx-4 animate-slide-up">
        {/* Top stripe */}
        <div
          className="h-3 rounded-t-2xl"
          style={{
            background: 'repeating-conic-gradient(rgba(59,130,246,0.15) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px',
          }}
        />

        <form onSubmit={handleJoin} className="card-glass rounded-b-2xl p-8 space-y-7 shadow-2xl">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="text-5xl mb-2 animate-float">🏁</div>
            <h1 className="text-3xl font-black text-white tracking-tight">Join a Race</h1>
            <p className="text-gray-500 text-sm">Enter the code your teacher shared with you</p>
          </div>

          {/* Code input */}
          <div className="space-y-3">
            <div className="relative">
              <input
                className="w-full px-5 py-5 rounded-2xl text-center text-4xl font-black font-mono tracking-[0.5em] uppercase
                  text-yellow-400 placeholder-gray-700
                  transition-all duration-200"
                style={{
                  background: 'rgba(17,24,39,0.8)',
                  border: filled > 0
                    ? '2px solid rgba(255,215,0,0.5)'
                    : '2px solid rgba(255,255,255,0.08)',
                  boxShadow: filled > 0 ? '0 0 20px rgba(255,215,0,0.1)' : 'none',
                }}
                placeholder="XXXXXX"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                required
              />
              {/* Character progress dots */}
              <div className="flex justify-center gap-1.5 mt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full transition-all duration-200"
                    style={{
                      background: i < filled
                        ? 'rgba(255,215,0,0.8)'
                        : 'rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-950/80 border border-red-500/40 text-red-400 text-sm px-4 py-3 rounded-xl animate-slide-down text-center">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full py-4 rounded-2xl font-black text-sm text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            style={{
              background: code.length === 6
                ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                : 'rgba(31,41,55,0.6)',
              boxShadow: code.length === 6 ? '0 4px 20px rgba(37,99,235,0.3)' : 'none',
            }}
          >
            {loading ? '⚙️ Joining race…' : code.length === 6 ? '🏎️ Enter Race!' : `Enter ${6 - filled} more characters`}
          </button>
        </form>
      </div>
    </div>
  );
}
