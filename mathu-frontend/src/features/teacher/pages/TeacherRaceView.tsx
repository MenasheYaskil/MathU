import { useEffect, useState, useCallback, useRef } from 'react';
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
  PlayerKickedData,
  RaceStatus,
} from '../../../types/api';

const TRACK_LENGTH = 1000;
const COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#ec4899', '#06b6d4', '#f97316',
];
const CAR_EMOJIS = ['🏎️', '🚗', '🚙', '🚕', '🚓', '🚑', '🚐', '🚌'];
const MEDALS = ['🥇', '🥈', '🥉'];

interface LiveEvent {
  id: number;
  text: string;
  emoji: string;
  ts: number;
}
let eventCounter = 0;

function statusCfg(s: RaceStatus) {
  if (s === 'LOBBY')    return { badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' };
  if (s === 'ACTIVE')   return { badge: 'bg-green-500/15 text-green-400 border-green-500/30', dot: 'bg-green-400 animate-pulse' };
  return { badge: 'bg-gray-700/50 text-gray-400 border-gray-600/30', dot: 'bg-gray-500' };
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
  const [copied, setCopied] = useState(false);
  const [kickingId, setKickingId] = useState<number | null>(null);

  // Rank-change flash: track previous rank per userId and mark who just moved up
  const prevRanksRef = useRef<Map<number, number>>(new Map());
  const [risingIds, setRisingIds] = useState<Set<number>>(new Set());

  const pushEvent = useCallback((emoji: string, text: string) => {
    setLiveEvents((prev) => [{ id: eventCounter++, emoji, text, ts: Date.now() }, ...prev].slice(0, 20));
  }, []);

  const sorted = [...leaderboard].sort((a, b) => b.currentPosition - a.currentPosition);

  // Detect which players moved up in rank after each sort and flash them gold
  useEffect(() => {
    const rising = new Set<number>();
    sorted.forEach((p, newRank) => {
      const prev = prevRanksRef.current.get(p.userId);
      if (prev !== undefined && newRank < prev) rising.add(p.userId);
      prevRanksRef.current.set(p.userId, newRank);
    });
    if (rising.size === 0) return;
    setRisingIds(rising);
    const t = setTimeout(() => setRisingIds(new Set()), 1200);
    return () => clearTimeout(t);
  }, [sorted]);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(entryCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [entryCode]);

  useEffect(() => {
    if (!token) { navigate('/'); return; }

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
        pushEvent('👋', `${d.username} joined`);
        setLeaderboard((prev) =>
          prev.some((p) => p.userId === d.userId)
            ? prev
            : [...prev, { userId: d.userId, username: d.username, currentPosition: 0 }]
        );
      },
      onPlayerKicked: (d: PlayerKickedData) => {
        setLeaderboard((prev) => prev.filter((p) => p.userId !== d.userId));
        pushEvent('🚪', `${d.username} was removed`);
      },
      onRaceStart: () => { setRaceStatus('ACTIVE'); pushEvent('🏁', 'Race started!'); },
      onRaceFinish: (d: RaceFinishData) => {
        setRaceStatus('FINISHED');
        setWinner(d.winnerUsername);
        pushEvent('🏆', `${d.winnerUsername} wins!`);
      },
      onEngineStall: (d: EngineStallData) => {
        const name = leaderboard.find((x) => x.userId === d.userId)?.username ?? `User ${d.userId}`;
        pushEvent('💥', `${name} engine stalled!`);
      },
      onPowerUp: (d: PowerUpData) => {
        const name = leaderboard.find((x) => x.userId === d.userId)?.username ?? `User ${d.userId}`;
        if (d.type === 'TURBO') pushEvent('⚡', `${name} TURBO boost +${d.distanceBonus}pts`);
        else pushEvent('🔧', `${name} got a flat tire!`);
      },
      onDecisionEvent: (d: DecisionEventData) => {
        const name = leaderboard.find((x) => x.userId === d.userId)?.username ?? `User ${d.userId}`;
        pushEvent('🚦', `${name} is at a crossroads!`);
      },
      onError: () => setSseError(true),
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  const handleKick = useCallback(async (userId: number, name: string) => {
    if (!window.confirm(`Remove ${name} from the race?`)) return;
    setKickingId(userId);
    try {
      await racesApi.kickPlayer(id, userId);
      setLeaderboard((prev) => prev.filter((p) => p.userId !== userId));
      pushEvent('🚪', `${name} was removed`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove player');
    } finally {
      setKickingId(null);
    }
  }, [id, pushEvent]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await racesApi.start(id);
      setRaceStatus('ACTIVE');
      pushEvent('🏁', 'Race started!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start race');
    } finally {
      setIsStarting(false);
    }
  };

  const cfg = statusCfg(raceStatus);

  // Winner screen
  if (winner) {
    return (
      <div
        className="min-h-screen text-white flex flex-col items-center justify-center relative overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at center, #1a1000 0%, #08090f 70%)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className="absolute text-2xl animate-float select-none"
              style={{
                left: `${Math.random() * 95}%`,
                top: `${Math.random() * 90}%`,
                animationDelay: `${i * 0.15}s`,
                opacity: 0.15,
              }}
            >
              {['⭐', '🌟', '✨', '🏆', '🎉'][i % 5]}
            </span>
          ))}
        </div>
        <div className="relative text-center animate-bounce-in space-y-4">
          <div className="text-8xl mb-2 animate-float">🏆</div>
          <h1 className="text-6xl font-black text-gold">{winner}</h1>
          <p className="text-2xl text-gray-300 font-semibold">Wins the Race!</p>
          <div className="card-glass rounded-2xl p-6 w-72 mx-auto mt-6 space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Final Standings</p>
            {sorted.map((p, i) => (
              <div key={p.userId} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-center">{i < 3 ? MEDALS[i] : `${i + 1}.`}</span>
                <span className={`flex-1 font-semibold ${p.username === winner ? 'text-yellow-400' : 'text-gray-300'}`}>
                  {p.username}
                </span>
                <span className="font-mono text-xs text-gray-500">{p.currentPosition}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/teacher/dashboard')}
            className="mt-4 px-8 py-3 btn-primary rounded-xl font-bold text-white"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-white flex flex-col"
      style={{ background: 'linear-gradient(160deg, #08090f 0%, #0d1117 100%)' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b border-white/5 sticky top-0 z-10"
        style={{ background: 'rgba(8,9,15,0.92)', backdropFilter: 'blur(12px)' }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/teacher/dashboard')}
            className="text-gray-500 hover:text-white text-sm transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
          >
            ← Dashboard
          </button>
          <div className="w-px h-6 bg-white/10" />
          <div>
            <h1 className="font-black text-lg">{raceTitle}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                {raceStatus}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {entryCode && (
            <button
              onClick={copyCode}
              className="text-center group transition-all duration-150 hover:opacity-80 active:scale-95"
              title="Click to copy"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">
                {copied ? '✓ Copied!' : 'Entry Code · click to copy'}
              </p>
              <span className={`font-mono font-black tracking-[0.25em] text-2xl transition-colors duration-150 ${copied ? 'text-green-400' : 'text-yellow-400'}`}>
                {entryCode}
              </span>
            </button>
          )}
          {raceStatus === 'LOBBY' && (
            <button
              onClick={handleStart}
              disabled={isStarting || leaderboard.length === 0}
              className="px-6 py-2.5 btn-green rounded-xl font-black text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isStarting ? '⚙️ Starting…' : `▶ Start (${leaderboard.length})`}
            </button>
          )}
        </div>
      </header>

      {sseError && (
        <div className="bg-red-950/80 border-b border-red-600/40 text-red-400 px-6 py-2 text-sm text-center">
          ⚠️ Connection lost — please refresh.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main race track */}
        <main className="flex-1 p-6 overflow-y-auto">
          {raceStatus === 'LOBBY' && leaderboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-64 gap-5">
              <span className="text-6xl animate-float">⏳</span>
              <p className="text-xl font-bold text-gray-400">Waiting for students to join…</p>
              {entryCode && (
                <div className="card-glass rounded-2xl px-8 py-5 text-center border-gold-glow animate-glow-pulse">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Share this code with your class</p>
                  <p className="font-mono font-black text-yellow-400 tracking-[0.4em] text-5xl">{entryCode}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  {sorted.length} racers · 0 ——————————— 1000 🏁
                </span>
              </div>
              {sorted.map((p, i) => (
                <TrackLane
                  key={p.userId}
                  participant={p}
                  index={i}
                  rank={i + 1}
                  rankUp={risingIds.has(p.userId)}
                  canKick={raceStatus !== 'FINISHED'}
                  isKicking={kickingId === p.userId}
                  onKick={handleKick}
                />
              ))}
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside className="w-72 flex flex-col border-l border-white/5"
          style={{ background: 'rgba(13,17,23,0.7)' }}>
          {/* Leaderboard */}
          <div className="p-5 border-b border-white/5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
              🏆 Standings
            </h2>
            <ol className="space-y-2">
              {sorted.map((p, i) => (
                <li
                  key={p.userId}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-300 ${risingIds.has(p.userId) ? 'animate-rank-up' : ''}`}
                >
                  <span className="w-6 text-center text-sm shrink-0">
                    {i < 3 ? MEDALS[i] : <span className="text-gray-600 text-xs">{i + 1}</span>}
                  </span>
                  <div
                    className="w-2 h-2 rounded-full shrink-0 transition-all duration-300"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className={`flex-1 text-sm font-semibold truncate transition-colors duration-300 ${risingIds.has(p.userId) ? 'text-yellow-300' : 'text-gray-200'}`}>
                    {p.username}
                  </span>
                  {risingIds.has(p.userId) && (
                    <span className="text-yellow-400 text-xs font-black shrink-0">▲</span>
                  )}
                  <span className="font-mono text-xs text-gray-500 shrink-0">
                    {p.currentPosition}
                  </span>
                </li>
              ))}
              {sorted.length === 0 && (
                <li className="text-gray-600 text-sm">No participants yet</li>
              )}
            </ol>
          </div>

          {/* Live events ticker */}
          <div className="flex-1 p-5 overflow-y-auto">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
              📡 Live Events
            </h2>
            <div className="space-y-2.5">
              {liveEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex gap-2 text-xs text-gray-400 animate-ticker bg-white/3 rounded-lg px-3 py-2 border border-white/4"
                >
                  <span className="shrink-0 text-sm">{ev.emoji}</span>
                  <span className="leading-relaxed">{ev.text}</span>
                </div>
              ))}
              {liveEvents.length === 0 && (
                <p className="text-gray-700 text-xs italic">Events will appear here once the race starts…</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TrackLane({
  participant,
  index,
  rank,
  rankUp,
  canKick,
  isKicking,
  onKick,
}: {
  participant: ParticipantSnapshot;
  index: number;
  rank: number;
  rankUp: boolean;
  canKick?: boolean;
  isKicking?: boolean;
  onKick?: (userId: number, username: string) => void;
}) {
  const pct = Math.min(100, (participant.currentPosition / TRACK_LENGTH) * 100);
  const color = COLORS[index % COLORS.length];
  const car = CAR_EMOJIS[index % CAR_EMOJIS.length];

  return (
    <div className={`flex items-center gap-3 group rounded-xl px-2 py-1 transition-all duration-300 ${rankUp ? 'animate-rank-up' : ''}`}>
      {/* Rank badge */}
      <div className="w-8 text-center shrink-0">
        <span className={`text-xs transition-all duration-300 ${rankUp ? 'scale-125 inline-block' : ''}`}>
          {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : <span className="text-gray-600">{rank}</span>}
        </span>
      </div>
      <span className={`w-28 text-sm font-semibold text-right truncate shrink-0 transition-colors duration-300 ${rankUp ? 'text-yellow-300' : 'text-gray-300 group-hover:text-white'}`}>
        {participant.username}
      </span>

      {/* Track */}
      <div
        className="flex-1 relative h-12 rounded-xl overflow-hidden transition-all duration-300"
        style={{
          background: 'linear-gradient(to bottom, #1a1a28, #12121c, #1a1a28)',
          border: rankUp
            ? '1px solid rgba(255,215,0,0.35)'
            : '1px solid rgba(255,255,255,0.06)',
          boxShadow: rankUp ? '0 0 12px rgba(255,215,0,0.15)' : 'none',
        }}
      >
        {/* Center dashed line */}
        <div className="absolute top-1/2 left-0 right-0 border-t border-dashed opacity-10"
          style={{ borderColor: 'rgba(255,255,255,0.3)' }} />
        {/* Lane edge accents */}
        <div className="absolute top-0 left-0 right-0 h-px opacity-20"
          style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }} />
        <div className="absolute bottom-0 left-0 right-0 h-px opacity-20"
          style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }} />

        {/* Progress fill */}
        <div
          className="absolute top-0 left-0 bottom-0 transition-all duration-700 ease-out"
          style={{
            width: `${Math.max(1, pct)}%`,
            background: `linear-gradient(to right, ${color}18, ${color}45)`,
          }}
        />

        {/* Car — cubic-bezier gives a realistic deceleration feel */}
        <div
          className="absolute top-1/2 -translate-y-1/2 text-2xl drop-shadow"
          style={{
            left: `calc(${Math.max(0, pct)}% - 20px)`,
            transition: 'left 0.65s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
        >
          {car}
        </div>

        {/* Checkered finish flag */}
        <div className="absolute right-0 top-0 bottom-0 w-4 flex flex-col overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-1"
              style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }} />
          ))}
        </div>
      </div>

      {/* Position counter — turns gold on rank-up */}
      <span
        className="w-14 text-right font-mono text-sm font-black shrink-0 transition-colors duration-300"
        style={{ color: rankUp ? '#FFD700' : color }}
      >
        {participant.currentPosition}
      </span>

      {/* Kick button — visible on lane hover, teacher-only */}
      {canKick && onKick && (
        <button
          onClick={() => onKick(participant.userId, participant.username)}
          disabled={isKicking}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/20 hover:border-red-500/40 disabled:opacity-30 disabled:cursor-not-allowed"
          title={`Remove ${participant.username}`}
        >
          <span className="text-xs font-black">{isKicking ? '⌛' : '✕'}</span>
        </button>
      )}
    </div>
  );
}
