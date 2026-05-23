import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { races as racesApi } from '../../../services/apiService';
import { useAuthStore } from '../../../stores/authStore';
import type { Race, RaceLeaderboardEntry } from '../../../types/api';

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  LOBBY:    { label: 'LOBBY',    dot: 'bg-yellow-400', badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  ACTIVE:   { label: 'LIVE',     dot: 'bg-green-400 animate-pulse', badge: 'bg-green-500/15 text-green-400 border-green-500/30' },
  FINISHED: { label: 'FINISHED', dot: 'bg-gray-500', badge: 'bg-gray-700/50 text-gray-400 border-gray-600/30' },
};

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { username, clearAuth } = useAuthStore();

  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState(2);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [myRaces, setMyRaces] = useState<Race[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [startingId, setStartingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // History modal state
  const [historyRace, setHistoryRace] = useState<Race | null>(null);
  const [historyBoard, setHistoryBoard] = useState<RaceLeaderboardEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadRaces = async () => {
    try {
      const data = await racesApi.getMine();
      setMyRaces(data.sort((a, b) => b.raceId - a.raceId));
    } catch { /* ignore */ }
    finally { setListLoading(false); }
  };

  useEffect(() => { loadRaces(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      const res = await racesApi.create({ title, baseDifficulty: difficulty });
      setTitle('');
      setShowCreateForm(false);
      await loadRaces();
      navigate(`/teacher/race/${res.raceId}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create race');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDelete = useCallback(async (race: Race) => {
    if (!window.confirm(`Delete "${race.title}"? This cannot be undone.`)) return;
    setDeletingId(race.raceId);
    try {
      await racesApi.deleteRace(race.raceId);
      setMyRaces((prev) => prev.filter((r) => r.raceId !== race.raceId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete race');
    } finally {
      setDeletingId(null);
    }
  }, []);

  const openHistory = useCallback(async (race: Race) => {
    setHistoryRace(race);
    setHistoryLoading(true);
    try {
      const board = await racesApi.getLeaderboard(race.raceId);
      setHistoryBoard(board.sort((a, b) => b.position - a.position));
    } catch {
      setHistoryBoard([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleStart = async (raceId: number) => {
    setStartingId(raceId);
    try {
      await racesApi.start(raceId);
      navigate(`/teacher/race/${raceId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start race');
      setStartingId(null);
    }
  };

  const activeCount = myRaces.filter((r) => r.status === 'ACTIVE').length;
  const lobbyCount = myRaces.filter((r) => r.status === 'LOBBY').length;

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const copyCode = useCallback((raceId: number, code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(raceId);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  const DIFF_LABELS = ['', 'Beginner', 'Easy', 'Medium', 'Hard', 'Expert'];
  const DIFF_COLORS = ['', 'text-green-400', 'text-lime-400', 'text-yellow-400', 'text-orange-400', 'text-red-400'];

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(160deg, #08090f 0%, #0d1117 100%)' }}
    >
      {/* Header */}
      <header
        className="border-b border-white/5 px-8 py-4 flex items-center justify-between sticky top-0 z-10"
        style={{ background: 'rgba(8,9,15,0.9)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏎️</span>
          <div>
            <h1 className="text-xl font-black text-gold tracking-tight">MathU Race</h1>
            <p className="text-gray-500 text-xs">Teacher Dashboard · {username}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-5 py-2 btn-green rounded-xl text-white font-bold text-sm flex items-center gap-2"
          >
            <span>+</span> New Race
          </button>
          <button
            onClick={() => clearAuth()}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-gray-400 hover:text-white transition-all"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="px-8 py-7 max-w-5xl">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Races', value: myRaces.length, icon: '🏁', color: 'text-blue-400' },
            { label: 'Live Now', value: activeCount, icon: '🔴', color: 'text-green-400' },
            { label: 'Waiting', value: lobbyCount, icon: '⏳', color: 'text-yellow-400' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="card-glass rounded-2xl px-5 py-4 flex items-center gap-4">
              <span className="text-2xl">{icon}</span>
              <div>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-gray-500 text-xs font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Race History Modal */}
        {historyRace && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="card-glass rounded-2xl p-8 w-full max-w-md shadow-2xl animate-bounce-in">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏆</span>
                  <div>
                    <h2 className="text-lg font-black text-white truncate max-w-xs">{historyRace.title}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {historyRace.finishedAt
                        ? `Finished ${new Date(historyRace.finishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : 'Race completed'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setHistoryRace(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all text-lg"
                >
                  ✕
                </button>
              </div>

              {historyRace.winnerUsername && (
                <div
                  className="flex items-center gap-3 px-4 py-3 rounded-xl mb-5"
                  style={{ background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.2)' }}
                >
                  <span className="text-2xl">🥇</span>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Winner</p>
                    <p className="font-black text-yellow-400">{historyRace.winnerUsername}</p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
                  Final Standings
                </p>
                {historyLoading ? (
                  <p className="text-gray-500 text-sm text-center py-4">Loading…</p>
                ) : historyBoard.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-4">No standings available</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {historyBoard.map((entry, i) => (
                      <div
                        key={entry.userId}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${i === 0 ? 'bg-yellow-500/10 border border-yellow-500/15' : 'bg-white/3'}`}
                      >
                        <span className="w-6 text-center shrink-0">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-gray-600 text-xs">{i + 1}</span>}
                        </span>
                        <span className={`flex-1 font-semibold truncate ${i === 0 ? 'text-yellow-400' : 'text-gray-300'}`}>
                          {entry.username}
                        </span>
                        <span className="font-mono text-xs text-gray-500 shrink-0">{entry.position} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => handleDelete(historyRace).then(() => setHistoryRace(null))}
                  disabled={deletingId === historyRace.raceId}
                  className="flex-1 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-sm font-semibold text-red-400 transition-all disabled:opacity-40"
                >
                  {deletingId === historyRace.raceId ? '⌛ Deleting…' : '🗑️ Delete Race'}
                </button>
                <button
                  onClick={() => setHistoryRace(null)}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-semibold text-gray-300 transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Race Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div
              className="card-glass rounded-2xl p-8 w-full max-w-sm shadow-2xl border-gold-glow animate-bounce-in"
            >
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">🏁</span>
                <h2 className="text-xl font-black">Create New Race</h2>
              </div>
              <form onSubmit={handleCreate} className="space-y-5">
                <input
                  className="w-full px-4 py-3 rounded-xl input-race text-white placeholder-gray-500 text-sm"
                  placeholder="Race title (e.g. Math Sprint Round 1)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Base Difficulty</span>
                    <span className={`text-sm font-bold ${DIFF_COLORS[difficulty]}`}>
                      {DIFF_LABELS[difficulty]}
                    </span>
                  </div>
                  <input
                    type="range" min={1} max={5} step={1}
                    className="w-full h-2 accent-yellow-400 cursor-pointer"
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>Easy</span><span>Expert</span>
                  </div>
                </div>
                {createError && (
                  <p className="bg-red-950/80 border border-red-500/40 text-red-400 text-sm px-3 py-2 rounded-lg">
                    ⚠️ {createError}
                  </p>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold text-sm text-gray-300 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLoading || !title.trim()}
                    className="flex-1 py-3 btn-green rounded-xl font-bold text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {createLoading ? '⚙️ Creating…' : '🏁 Create Race'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Race list */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">My Races</h2>
          <button
            onClick={loadRaces}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {listLoading ? (
          <div className="card-glass rounded-2xl p-10 text-center text-gray-500 text-sm">
            Loading races…
          </div>
        ) : myRaces.length === 0 ? (
          <div className="card-glass rounded-2xl p-12 text-center border border-dashed border-gray-700">
            <p className="text-4xl mb-4">🏁</p>
            <p className="text-gray-300 text-lg font-bold mb-2">No races yet</p>
            <p className="text-gray-500 text-sm mb-6">Create your first race and share the entry code with your class.</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-3 btn-green rounded-xl font-bold text-sm text-white"
            >
              + Create a Race
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {myRaces.map((race) => {
              const cfg = STATUS_CONFIG[race.status] ?? STATUS_CONFIG.FINISHED;
              return (
                <div
                  key={race.raceId}
                  className="card-glass rounded-2xl px-6 py-5 flex items-center justify-between gap-4 hover:border-white/10 transition-all duration-200"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        <h3 className="font-bold text-white truncate">{race.title}</h3>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <button
                          onClick={() => copyCode(race.raceId, race.entryCode)}
                          className="flex items-center gap-1.5 group/copy"
                          title="Copy entry code"
                        >
                          <span className="text-gray-500 text-sm">Code</span>
                          <span className={`font-mono font-black tracking-[0.2em] text-base transition-colors duration-150 ${copiedId === race.raceId ? 'text-green-400' : 'text-yellow-400'}`}>
                            {race.entryCode}
                          </span>
                          <span className={`text-xs transition-all duration-150 ${copiedId === race.raceId ? 'text-green-400' : 'text-gray-600 group-hover/copy:text-gray-400'}`}>
                            {copiedId === race.raceId ? '✓' : '⎘'}
                          </span>
                        </button>
                        <span className={`font-medium text-xs ${DIFF_COLORS[race.baseDifficulty] ?? 'text-gray-400'}`}>
                          ★ {DIFF_LABELS[race.baseDifficulty] ?? race.baseDifficulty}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {race.status === 'LOBBY' && (
                      <button
                        onClick={() => handleStart(race.raceId)}
                        disabled={startingId === race.raceId}
                        className="px-4 py-2 btn-green rounded-xl text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      >
                        {startingId === race.raceId ? '⚙️ Starting…' : '▶ Start'}
                      </button>
                    )}
                    {race.status === 'FINISHED' ? (
                      <button
                        onClick={() => openHistory(race)}
                        className="px-4 py-2 btn-primary rounded-xl text-sm font-bold text-white"
                      >
                        📊 Results
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/teacher/race/${race.raceId}`)}
                        className="px-4 py-2 btn-primary rounded-xl text-sm font-bold text-white"
                      >
                        {race.status === 'LOBBY' ? '👁 Lobby' : '📊 View'}
                      </button>
                    )}
                    {race.status !== 'ACTIVE' && (
                      <button
                        onClick={() => handleDelete(race)}
                        disabled={deletingId === race.raceId}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-red-500/8 hover:bg-red-500/20 border border-red-500/15 hover:border-red-500/35 text-red-500/60 hover:text-red-400 transition-all disabled:opacity-30"
                        title="Delete race"
                      >
                        <span className="text-sm">{deletingId === race.raceId ? '⌛' : '🗑️'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
