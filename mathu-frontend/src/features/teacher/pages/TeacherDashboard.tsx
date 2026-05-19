import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { races as racesApi } from '../../../services/apiService';
import { useAuthStore } from '../../../stores/authStore';
import type { Race } from '../../../types/api';

const STATUS_BADGE: Record<string, string> = {
  LOBBY:    'bg-yellow-700 text-yellow-200',
  ACTIVE:   'bg-green-700 text-green-200',
  FINISHED: 'bg-gray-600 text-gray-300',
};

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { username, clearAuth } = useAuthStore();

  // Create form state
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState(2);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Race list state
  const [myRaces, setMyRaces] = useState<Race[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [startingId, setStartingId] = useState<number | null>(null);

  const loadRaces = async () => {
    try {
      const data = await racesApi.getMine();
      setMyRaces(data.sort((a, b) => b.raceId - a.raceId));
    } catch {
      // ignore — user sees empty list
    } finally {
      setListLoading(false);
    }
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
      // Navigate straight to the new race's lobby view
      navigate(`/teacher/race/${res.raceId}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create race');
    } finally {
      setCreateLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
          <p className="text-gray-400 text-sm">Welcome, {username}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-sm transition-colors"
          >
            + New Race
          </button>
          <button
            onClick={() => clearAuth()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="px-8 py-8 max-w-4xl">
        {/* Create Race Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
              <h2 className="text-xl font-bold mb-5">Create New Race</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <input
                  className="w-full px-4 py-2 rounded bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Race title (e.g. Math Sprint Round 1)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                />
                <label className="block">
                  <span className="text-sm text-gray-400 block mb-1">Base Difficulty — {difficulty}/5</span>
                  <input
                    type="range" min={1} max={5} step={1}
                    className="w-full accent-green-500"
                    value={difficulty}
                    onChange={(e) => setDifficulty(Number(e.target.value))}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Easy</span><span>Hard</span>
                  </div>
                </label>
                {createError && (
                  <p className="bg-red-900/50 border border-red-600 text-red-300 text-sm px-3 py-2 rounded">
                    {createError}
                  </p>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLoading || !title.trim()}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded font-semibold text-sm transition-colors"
                  >
                    {createLoading ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Race list */}
        <h2 className="text-lg font-semibold text-gray-300 mb-4">My Races</h2>
        {listLoading ? (
          <p className="text-gray-500 text-sm">Loading races…</p>
        ) : myRaces.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-10 text-center">
            <p className="text-gray-400 text-lg mb-2">No races yet</p>
            <p className="text-gray-500 text-sm mb-5">Create your first race and share the entry code with your students.</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors"
            >
              Create a Race
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {myRaces.map((race) => (
              <div
                key={race.raceId}
                className="bg-gray-800 rounded-xl px-6 py-5 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-white truncate">{race.title}</h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[race.status]}`}>
                      {race.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span>
                      Code: <span className="font-mono font-bold text-yellow-400 tracking-widest">{race.entryCode}</span>
                    </span>
                    <span>Difficulty: {race.baseDifficulty}/5</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {race.status === 'LOBBY' && (
                    <button
                      onClick={() => handleStart(race.raceId)}
                      disabled={startingId === race.raceId}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
                    >
                      {startingId === race.raceId ? 'Starting…' : 'Start Race'}
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/teacher/race/${race.raceId}`)}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-semibold transition-colors"
                  >
                    {race.status === 'LOBBY' ? 'Lobby' : 'View'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
