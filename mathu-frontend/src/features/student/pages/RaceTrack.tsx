import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { useRaceStore } from '../../../stores/raceStore';
import { useGameSSE } from '../../../hooks/useGameSSE';
import { races as racesApi } from '../../../services/apiService';

const TRACK_LENGTH = 1000;
const QUESTION_TIME_SEC = 30;
const COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#ec4899', '#06b6d4', '#f97316',
];
const MEDALS = ['🥇', '🥈', '🥉'];

export default function RaceTrack() {
  const { raceId } = useParams<{ raceId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const username = useAuthStore((s) => s.username);

  const { leaderboard, currentQuestion, setLeaderboard, updatePosition, setQuestion, reset } =
    useRaceStore();

  const [answer, setAnswer] = useState('');
  const [decisionPending, setDecisionPending] = useState(false);
  const [isDecisionLoading, setIsDecisionLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SEC);
  const questionTokenRef = useRef<string | null>(null);
  const [stallUntil, setStallUntil] = useState<number | null>(null);
  const [stallRemaining, setStallRemaining] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; correct: boolean } | null>(null);
  const [powerUpMsg, setPowerUpMsg] = useState<{ text: string; type: 'good' | 'bad' } | null>(null);
  const [winner, setWinner] = useState<string | null>(null);

  const id = Number(raceId);
  const isStalled = stallUntil !== null && Date.now() < stallUntil;

  // Reset timer on new question
  useEffect(() => {
    if (!currentQuestion) return;
    if (questionTokenRef.current === currentQuestion.questionToken) return;
    questionTokenRef.current = currentQuestion.questionToken;
    setTimeLeft(QUESTION_TIME_SEC);
    setAnswer('');
    setFeedback(null);
  }, [currentQuestion]);

  // Countdown tick
  useEffect(() => {
    if (!currentQuestion || decisionPending || isStalled) return;
    if (timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, currentQuestion, decisionPending, isStalled]);

  // Stall ticker
  useEffect(() => {
    if (!stallUntil) return;
    const tick = setInterval(() => {
      const rem = Math.max(0, stallUntil - Date.now());
      setStallRemaining(Math.ceil(rem / 1000));
      if (rem === 0) { setStallUntil(null); clearInterval(tick); }
    }, 200);
    return () => clearInterval(tick);
  }, [stallUntil]);

  // Redirect if token is gone (logout, session expiry)
  useEffect(() => {
    if (!token) navigate('/');
  }, [token, navigate]);

  // Clean up race store state on unmount
  useEffect(() => () => { reset(); }, [reset]);

  // Break the circular dependency: handlers reference openPersonalChannel, which is
  // returned by useGameSSE, which receives the handlers. The ref is assigned
  // synchronously below the hook call, so it holds the real function before any
  // async SSE event can fire.
  const openPersonalChannelRef = useRef<() => void>(() => undefined);

  const { sseError, openPersonalChannel } = useGameSSE(
    id,
    {
      onLeaderboardSnapshot: (d) => {
        setLeaderboard(d.raceId, d.status, d.participants);
        if (d.status === 'ACTIVE') openPersonalChannelRef.current();
      },
      onPositionUpdate: (d) => updatePosition(d.userId, d.position),
      onRaceStart: () => openPersonalChannelRef.current(),
      onRaceFinish: (d) => setWinner(d.winnerUsername),
      onPowerUp: (data) => {
        if (data.type === 'TURBO') {
          setPowerUpMsg({ text: '⚡ TURBO! Speed boost activated!', type: 'good' });
        } else {
          setPowerUpMsg({ text: '🔧 Flat Tire! Engine slowed…', type: 'bad' });
        }
        setTimeout(() => setPowerUpMsg(null), 3500);
      },
    },
    (q) => { setQuestion(q); setFeedback(null); setDecisionPending(false); },
  );

  openPersonalChannelRef.current = openPersonalChannel;

  const processAnswerResult = useCallback(async (result: Awaited<ReturnType<typeof racesApi.submitAnswer>>) => {
    if (result.stalledNow) {
      setStallUntil(Date.now() + result.stallDurationMs);
      setStallRemaining(Math.ceil(result.stallDurationMs / 1000));
      if (!result.correct) setFeedback({ text: 'Wrong answer — engine stalled!', correct: false });
      setAnswer('');
      return;
    }
    if (result.decisionEventPending) { setDecisionPending(true); setFeedback(null); return; }
    if (result.nextQuestionText && result.nextQuestionToken) {
      setQuestion({
        questionText: result.nextQuestionText,
        questionToken: result.nextQuestionToken,
        mode: result.currentMode,
        dirtRoadRemaining: result.dirtRoadRemaining,
      });
      setFeedback(result.correct ? { text: 'Correct!', correct: true } : null);
    } else {
      setFeedback({ text: result.correct ? 'Correct!' : 'Wrong answer', correct: result.correct });
    }
    setAnswer('');
  }, [setQuestion]);

  const handleAnswer = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentQuestion || isStalled) return;
    try {
      const result = await racesApi.submitAnswer(id, {
        questionToken: currentQuestion.questionToken,
        answer: answer.trim(),
      });
      await processAnswerResult(result);
    } catch {
      setFeedback({ text: 'Error submitting — try again', correct: false });
    }
  }, [id, answer, currentQuestion, isStalled, processAnswerResult]);

  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (timeLeft === 0 && currentQuestion && !decisionPending && !isStalled && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      racesApi.submitAnswer(id, { questionToken: currentQuestion.questionToken, answer: '' })
        .then(processAnswerResult).catch(() => {}).finally(() => { autoSubmitRef.current = false; });
    }
    if (timeLeft > 0) autoSubmitRef.current = false;
  }, [timeLeft, currentQuestion, decisionPending, isStalled, id, processAnswerResult]);

  const handleDecisionChoice = useCallback(async (choice: 'HIGHWAY' | 'DIRT_ROAD') => {
    setIsDecisionLoading(true);
    try {
      const q = await racesApi.chooseDecisionPath(id, { choice });
      setQuestion(q);
      setDecisionPending(false);
      setFeedback(null);
    } catch {
      setFeedback({ text: 'Failed to select path — try again', correct: false });
    } finally {
      setIsDecisionLoading(false);
    }
  }, [id, setQuestion]);

  const sorted = [...leaderboard].sort((a, b) => b.currentPosition - a.currentPosition);
  const myPos = leaderboard.find((p) => p.username === username)?.currentPosition ?? 0;
  const myRank = sorted.findIndex((p) => p.username === username) + 1;
  const timerPct = (timeLeft / QUESTION_TIME_SEC) * 100;
  const timerUrgent = timeLeft <= 10;

  // ── Race finish screen ────────────────────────────────────────────────────────
  if (winner) {
    const iWon = winner === username;
    return (
      <div
        className="min-h-screen text-white flex flex-col items-center justify-center gap-6 p-8 relative overflow-hidden"
        style={{ background: iWon ? 'radial-gradient(ellipse at center, #1a1000 0%, #08090f 70%)' : 'linear-gradient(160deg, #08090f, #0d1117)' }}
      >
        {iWon && (
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className="absolute text-xl animate-float select-none opacity-20"
                style={{ left: `${Math.random() * 95}%`, top: `${Math.random() * 90}%`, animationDelay: `${i * 0.2}s` }}>
                {['⭐', '🌟', '✨', '🎉'][i % 4]}
              </span>
            ))}
          </div>
        )}
        <div className="relative text-center animate-bounce-in space-y-3">
          <div className="text-7xl animate-float">{iWon ? '🏆' : '🏁'}</div>
          <h1 className={`text-4xl font-black ${iWon ? 'text-gold' : 'text-white'}`}>
            {iWon ? 'You Win!' : `${winner} wins!`}
          </h1>
          <p className="text-gray-400 text-sm">Race complete · Final standings</p>
        </div>

        <div className="card-glass rounded-2xl p-6 w-full max-w-xs space-y-2.5">
          {sorted.map((p, i) => (
            <div key={p.userId} className={`flex items-center gap-3 text-sm py-1 ${p.username === username ? 'font-black text-yellow-400' : 'text-gray-300'}`}>
              <span className="w-7 text-center">{i < 3 ? MEDALS[i] : <span className="text-gray-600">{i+1}</span>}</span>
              <span className="flex-1 truncate">{p.username}</span>
              <span className="font-mono text-xs text-gray-500">{p.currentPosition}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/student/join')}
          className="px-8 py-3 btn-primary rounded-xl font-bold text-white text-sm"
        >
          ← Back to Lobby
        </button>
      </div>
    );
  }

  // ── Main game HUD ─────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen text-white flex flex-col"
      style={{ background: 'linear-gradient(160deg, #08090f 0%, #0d1117 100%)' }}
    >
      {/* Decision crossroads overlay */}
      {decisionPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="card-glass rounded-3xl p-8 w-full max-w-sm mx-4 text-center space-y-5 animate-bounce-in border-gold-glow">
            <div className="text-5xl animate-float">🚦</div>
            <h2 className="text-2xl font-black">Crossroads!</h2>
            <p className="text-gray-500 text-sm">Your progress earns you a choice. Choose wisely.</p>

            <button
              onClick={() => handleDecisionChoice('HIGHWAY')}
              disabled={isDecisionLoading}
              className="w-full py-5 rounded-2xl text-black font-black text-lg transition-all duration-200 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                boxShadow: '0 4px 24px rgba(255,215,0,0.3)',
              }}
            >
              🛣️ Highway
              <span className="block text-sm font-semibold mt-1 opacity-75">
                1 hard question · 3× reward · Risk of setback!
              </span>
            </button>

            <button
              onClick={() => handleDecisionChoice('DIRT_ROAD')}
              disabled={isDecisionLoading}
              className="w-full py-5 rounded-2xl text-white font-black text-lg transition-all duration-200 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #166534, #15803d)',
                boxShadow: '0 4px 24px rgba(22,101,52,0.3)',
              }}
            >
              🌿 Dirt Road
              <span className="block text-sm font-semibold mt-1 opacity-75">
                3 easy questions · Steady & safe
              </span>
            </button>
          </div>
        </div>
      )}

      {/* SSE error */}
      {sseError && (
        <div className="bg-red-950/80 border-b border-red-600/40 text-red-400 px-4 py-2 text-sm text-center">
          ⚠️ Connection lost — please refresh.
        </div>
      )}

      {/* Power-up toast */}
      {powerUpMsg && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-40 px-6 py-3 rounded-2xl font-bold text-sm text-center animate-slide-down shadow-2xl"
          style={{
            background: powerUpMsg.type === 'good'
              ? 'linear-gradient(135deg, #1a3a1a, #14532d)'
              : 'linear-gradient(135deg, #3a1a1a, #7f1d1d)',
            border: powerUpMsg.type === 'good'
              ? '1px solid rgba(34,197,94,0.4)'
              : '1px solid rgba(239,68,68,0.4)',
            boxShadow: powerUpMsg.type === 'good'
              ? '0 4px 24px rgba(34,197,94,0.2)'
              : '0 4px 24px rgba(239,68,68,0.2)',
          }}
        >
          {powerUpMsg.text}
        </div>
      )}

      {/* HUD top bar */}
      <header
        className="px-5 py-3 border-b border-white/5 flex items-center gap-4"
        style={{ background: 'rgba(8,9,15,0.92)', backdropFilter: 'blur(12px)' }}
      >
        <span className="text-lg">🏎️</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-black text-white truncate">{username}</span>
            {myRank > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30">
                {myRank <= 3 ? MEDALS[myRank - 1] : `#${myRank}`} Place
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono">{myPos} / {TRACK_LENGTH} pts</p>
        </div>
        {currentQuestion && !decisionPending && !isStalled && (
          <TimerRing timeLeft={timeLeft} pct={timerPct} urgent={timerUrgent} />
        )}
      </header>

      {/* Mini race track */}
      <div className="px-5 py-4 border-b border-white/5"
        style={{ background: 'rgba(13,17,23,0.5)' }}>
        <div className="space-y-1.5">
          {sorted.map((p, i) => {
            const pct = Math.min(100, (p.currentPosition / TRACK_LENGTH) * 100);
            const color = COLORS[i % COLORS.length];
            const isMe = p.username === username;
            return (
              <div key={p.userId} className="flex items-center gap-2">
                <span className={`w-16 text-right text-xs truncate shrink-0 ${isMe ? 'text-yellow-400 font-black' : 'text-gray-600'}`}>
                  {p.username}
                </span>
                <div
                  className="flex-1 relative h-4 rounded-full overflow-hidden"
                  style={{ background: 'rgba(17,24,39,0.8)', border: `1px solid ${isMe ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.04)'}` }}
                >
                  <div
                    className="absolute top-0 left-0 bottom-0 transition-all duration-500 ease-out rounded-full"
                    style={{ width: `${Math.max(1, pct)}%`, background: `linear-gradient(to right, ${color}50, ${color}90)` }}
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 text-xs transition-all duration-500"
                    style={{ left: `calc(${Math.max(0, pct)}% - 10px)` }}
                  >
                    {isMe ? '🏎️' : '🚗'}
                  </span>
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-gray-700 text-xs text-center py-1">Waiting for race to start…</p>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Question panel */}
        <section className="flex-1 p-5 flex flex-col min-h-0">
          {/* Mode indicator */}
          {currentQuestion && (
            <div className="flex items-center gap-2 mb-4">
              {currentQuestion.mode === 'HIGHWAY' ? (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                  🛣️ Highway · High Stakes
                </span>
              ) : currentQuestion.mode === 'DIRT_ROAD' ? (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                  🌿 Dirt Road · {currentQuestion.dirtRoadRemaining} left
                </span>
              ) : (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  🏁 Question
                </span>
              )}
            </div>
          )}

          {/* Stall display */}
          {isStalled ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 card-glass rounded-2xl">
              <div className="text-6xl animate-bounce">💥</div>
              <p className="text-2xl font-black text-red-400">Engine Stalled!</p>
              <p className="text-gray-500 text-sm">Resuming in {stallRemaining}s…</p>
              <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all duration-300"
                  style={{ width: `${(stallRemaining / 4) * 100}%` }}
                />
              </div>
            </div>
          ) : !decisionPending && currentQuestion ? (
            <div className="flex-1 flex flex-col card-glass rounded-2xl p-6">
              {/* Question text */}
              <div className="flex-1 flex items-center justify-center">
                <p className="text-3xl font-black text-center leading-snug">{currentQuestion.questionText}</p>
              </div>

              {/* Timer bar */}
              <div className="mt-4 mb-5">
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-linear"
                    style={{
                      width: `${timerPct}%`,
                      background: timerUrgent
                        ? 'linear-gradient(to right, #ef4444, #ff6b6b)'
                        : 'linear-gradient(to right, #3b82f6, #60a5fa)',
                    }}
                  />
                </div>
                <div className={`text-right text-xs font-mono font-bold mt-1 ${timerUrgent ? 'text-red-400 animate-urgency' : 'text-gray-500'}`}>
                  {timeLeft}s remaining
                </div>
              </div>

              {/* Answer form */}
              <form onSubmit={handleAnswer} className="flex gap-2">
                <input
                  className="flex-1 px-4 py-3 rounded-xl input-race text-white text-xl font-black font-mono placeholder-gray-700"
                  placeholder="?"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  required
                />
                <button
                  type="submit"
                  className="px-6 py-3 btn-primary rounded-xl font-black text-white text-sm"
                >
                  Submit
                </button>
              </form>

              {feedback && (
                <div className={`mt-3 px-4 py-2 rounded-lg text-sm font-bold text-center animate-slide-up ${
                  feedback.correct
                    ? 'bg-green-500/15 border border-green-500/30 text-green-400'
                    : 'bg-red-500/15 border border-red-500/30 text-red-400'
                }`}>
                  {feedback.correct ? '✓' : '✗'} {feedback.text}
                </div>
              )}
            </div>
          ) : !isStalled && !decisionPending ? (
            <div className="flex-1 flex flex-col items-center justify-center card-glass rounded-2xl gap-3">
              <span className="text-5xl animate-float">⏳</span>
              <p className="text-gray-500 font-semibold">Waiting for the race to start…</p>
            </div>
          ) : null}
        </section>

        {/* Leaderboard sidebar */}
        <aside className="w-48 p-4 flex flex-col border-l border-white/5"
          style={{ background: 'rgba(13,17,23,0.5)' }}>
          <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-4">
            Standings
          </h2>
          <ol className="space-y-2.5 flex-1">
            {sorted.map((p, i) => (
              <li key={p.userId} className={`flex items-center gap-2 text-xs ${p.username === username ? 'text-yellow-400 font-black' : 'text-gray-400'}`}>
                <span className="w-5 text-center shrink-0">
                  {i < 3 ? MEDALS[i] : <span className="text-gray-600">{i+1}</span>}
                </span>
                <span className="flex-1 truncate">{p.username}</span>
                <span className="font-mono text-gray-600 shrink-0">{p.currentPosition}</span>
              </li>
            ))}
            {sorted.length === 0 && (
              <li className="text-gray-700 text-xs">Waiting…</li>
            )}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function TimerRing({
  timeLeft,
  pct,
  urgent,
}: {
  timeLeft: number;
  pct: number;
  urgent: boolean;
}) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className={`relative w-14 h-14 shrink-0 ${urgent ? 'animate-urgency' : ''}`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" />
        <circle
          cx="22" cy="22" r={r}
          fill="none"
          stroke={urgent ? '#ef4444' : '#3b82f6'}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-sm font-black font-mono ${urgent ? 'text-red-400' : 'text-white'}`}>
          {timeLeft}
        </span>
      </div>
    </div>
  );
}
