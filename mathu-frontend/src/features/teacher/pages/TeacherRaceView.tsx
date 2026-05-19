import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { subscribeToRace } from '../../../services/sseService';
import { races as racesApi } from '../../../services/apiService';
import type {
  LeaderboardSnapshotData,
  ParticipantSnapshot,
  PositionUpdateData,
  RaceFinishData,
  EngineStallData,
  PowerUpData,
  DecisionEventData,
  ParticipantJoinedData,
  RaceStatus,
} from '../../../types/api';

const TRACK_LENGTH = 1000;
const COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#ec4899', '#06b6d4', '#f97316',
];

interface LiveEvent {
  id: number;
  text: string;
  emoji: string;
  ts: number;
}

let eventCounter = 0;

function statusBadge(s: RaceStatus) {
  if (s === 'LOBBY')    return 'bg-yellow-700 text-yellow-200';
  if (s === 'ACTIVE')   return 'bg-green-700 text-green-200';
  if (s === 'FINISHED') return 'bg-gray-600 text-gray-300';
  return 'bg-gray-600 text-gray-300';
}

export default function TeacherRaceView() {
  const { raceId } = useParams<{ raceId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);

  const id = Number(raceId);

  const [raceStatus, setRaceStatus] = useState<RaceStatus>('LOBBY');
  const [raceTitle, setRaceTitle] = useState('Race');
  const [entryCode, setEntryCode] = useState('');
  const [leaderboard, setLeaderboard] = useState<ParticipantSnapshot[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [sseError, setSseError] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const pushEvent = useCallback((emoji: string, text: string) => {
    const ev: LiveEvent = { id: eventCounter++, emoji, text, ts: Date.now() };
    setLiveEvents((prev) => [ev, ...prev].slice(0, 12));
  }, []);

  // Sort helpers
  const sorted = [...leaderboard].sort((a, b) => b.currentPosition - a.currentPosition);

  useEffect(() => {
    if (!token) { navigate('/'); return; }

    // Load race meta for title + entry code
    racesApi.getById(id).then((r) => {
      setRaceTitle(r.title);
      setEntryCode(r.entryCode);
      setRaceStatus(r.status);
    }).catch(() => {});

    const unsub = subscribeToRace(id, token, {
      onLeaderboardSnapshot: (d: LeaderboardSnapshotData) => {
        setLeaderboard(d.participants);
        setRaceStatus(d.status as RaceStatus);
      },
      onPositionUpdate: (d: PositionUpdateData) => {
        setLeaderboard((prev) =>
          prev.map((p) => p.userId === d.userId ? { ...p, currentPosition: d.position } : p)
        );
      },
      onParticipantJoined: (d: ParticipantJoinedData) => {
        pushEvent('👋', `${d.username} joined the race`);
        setLeaderboard((prev) =>
          prev.some((p) => p.userId === d.userId)
            ? prev
            : [...prev, { userId: d.userId, username: d.username, currentPosition: 0 }]
        );
      },
      onRaceStart: () => {
        setRaceStatus('ACTIVE');
        pushEvent('🏁', 'Race started!');
      },
      onRaceFinish: (d: RaceFinishData) => {
        setRaceStatus('FINISHED');
        setWinner(d.winnerUsername);
        pushEvent('🏆', `${d.winnerUsername} wins the race!`);
      },
      onEngineStall: (d: EngineStallData) => {
        const p = leaderboard.find((x) => x.userId === d.userId);
        const name = p?.username ?? `User ${d.userId}`;
        pushEvent('💥', `${name} engine stalled for ${(d.stallDurationMs / 1000).toFixed(1)}s`);
      },
      onPowerUp: (d: PowerUpData) => {
        const p = leaderboard.find((x) => x.userId === d.userId);
        const name = p?.username ?? `User ${d.userId}`;
        if (d.type === 'TURBO') pushEvent('⚡', `${name} got TURBO! +${d.distanceBonus} pts`);
        else pushEvent('🔧', `${name} got a Flat Tire!`);
      },
      onDecisionEvent: (d: DecisionEventData) => {
        const p = leaderboard.find((x) => x.userId === d.userId);
        const name = p?.username ?? `User ${d.userId}`;
        pushEvent('🚦', `${name} is at a Crossroads!`);
      },
      onError: () => setSseError(true),
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await racesApi.start(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start race');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/teacher/dashboard')}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← Dashboard
          </button>
          <div>
            <h1 className="font-bold text-lg">{raceTitle}</h1>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge(raceStatus)}`}>
                {raceStatus}
              </span>
              {entryCode && (
                <span className="text-xs text-gray-400">
                  Code: <span className="font-mono font-bold text-yellow-400 tracking-widest">{entryCode}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        {raceStatus === 'LOBBY' && (
          <button
            onClick={handleStart}
            disabled={isStarting || leaderboard.length === 0}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-bold transition-colors"
          >
            {isStarting ? 'Starting…' : `Start Race (${leaderboard.length} players)`}
          </button>
        )}
      </header>

      {sseError && (
        <div className="bg-red-900/60 border-b border-red-600 text-red-300 px-6 py-2 text-sm text-center">
          Connection lost — please refresh the page.
        </div>
      )}

      {/* Winner banner */}
      {winner && (
        <div className="bg-yellow-500/20 border-b border-yellow-500 text-yellow-300 px-6 py-3 text-center font-bold text-lg">
          🏆 {winner} wins the race!
        </div>
      )}

      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Main: Race Track */}
        <main className="flex-1 p-6 overflow-y-auto">
          {raceStatus === 'LOBBY' && leaderboard.length === 0 && (
            <div className="text-center text-gray-500 py-20">
              <p className="text-5xl mb-4">⏳</p>
              <p className="text-xl font-semibold text-gray-400">Waiting for students to join…</p>
              <p className="text-sm mt-2">Share code <span className="font-mono font-bold text-yellow-400">{entryCode}</span> with your class</p>
            </div>
          )}

          {sorted.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Track (0 → 1000)</span>
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-xs text-yellow-400 font-bold">FINISH</span>
              </div>
              {sorted.map((p, i) => (
                <RaceBar key={p.userId} participant={p} index={i} />
              ))}
            </div>
          )}
        </main>

        {/* Sidebar: Leaderboard + Events */}
        <aside className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col overflow-hidden">
          {/* Leaderboard */}
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Leaderboard</h2>
            <ol className="space-y-2">
              {sorted.map((p, i) => (
                <li key={p.userId} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-5 shrink-0 text-right">{i + 1}.</span>
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[sorted.indexOf(sorted.find(x => x.userId === p.userId)!) % COLORS.length] }}
                  />
                  <span className="flex-1 truncate font-medium">{p.username}</span>
                  <span className="font-mono text-xs text-gray-400">{p.currentPosition}</span>
                </li>
              ))}
              {sorted.length === 0 && (
                <li className="text-gray-600 text-sm">No participants yet</li>
              )}
            </ol>
          </div>

          {/* Live Events */}
          <div className="flex-1 p-4 overflow-y-auto">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Live Events</h2>
            <div className="space-y-2">
              {liveEvents.map((ev) => (
                <div key={ev.id} className="flex gap-2 text-xs text-gray-300 animate-pulse-once">
                  <span className="shrink-0">{ev.emoji}</span>
                  <span>{ev.text}</span>
                </div>
              ))}
              {liveEvents.length === 0 && (
                <p className="text-gray-600 text-xs">Events will appear here…</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RaceBar({ participant, index }: { participant: ParticipantSnapshot; index: number }) {
  const pct = Math.min(100, (participant.currentPosition / TRACK_LENGTH) * 100);
  const color = COLORS[index % COLORS.length];

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-sm text-right truncate text-gray-300 shrink-0">
        {participant.username}
      </span>
      <div className="flex-1 bg-gray-800 rounded-full h-8 relative overflow-visible">
        {/* Filled bar */}
        <div
          className="h-full rounded-full transition-all duration-700 ease-out relative"
          style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color + '99' }}
        />
        {/* Car indicator */}
        <div
          className="absolute top-1/2 -translate-y-1/2 text-lg transition-all duration-700 ease-out"
          style={{ left: `${Math.max(0, pct - 2)}%` }}
        >
          🚗
        </div>
        {/* Finish line */}
        <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-yellow-400 opacity-60" />
      </div>
      <span className="w-12 text-right font-mono text-xs text-gray-400 shrink-0">
        {participant.currentPosition}
      </span>
    </div>
  );
}
