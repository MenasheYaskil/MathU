import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { useRaceStore } from '../../../stores/raceStore';
import { subscribeToRace, subscribeToMyEvents } from '../../../services/sseService';
import { races as racesApi } from '../../../services/apiService';
import type {
  LeaderboardSnapshotData,
  PositionUpdateData,
  QuestionDispatchedData,
  RaceFinishData,
} from '../../../types/api';

const TRACK_LENGTH = 1000;
const QUESTION_TIME_SEC = 30;

const COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#ec4899', '#06b6d4', '#f97316',
];

export default function RaceTrack() {
  const { raceId } = useParams<{ raceId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const username = useAuthStore((s) => s.username);

  const { leaderboard, currentQuestion, setLeaderboard, updatePosition, setQuestion, reset } =
    useRaceStore();

  const [answer, setAnswer] = useState('');
  const [sseError, setSseError] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [isDecisionLoading, setIsDecisionLoading] = useState(false);

  // Timer state
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SEC);
  const questionTokenRef = useRef<string | null>(null);

  // Stall state
  const [stallUntil, setStallUntil] = useState<number | null>(null);
  const [stallRemaining, setStallRemaining] = useState(0);

  // Feedback
  const [feedback, setFeedback] = useState<{ text: string; correct: boolean } | null>(null);

  // Power-up notification
  const [powerUpMsg, setPowerUpMsg] = useState<string | null>(null);

  // Race finish state
  const [winner, setWinner] = useState<string | null>(null);

  const id = Number(raceId);

  const isStalled = stallUntil !== null && Date.now() < stallUntil;

  // ── Countdown timer ─────────────────────────────────────────────────────────
  // Reset timer when a new question arrives
  useEffect(() => {
    if (!currentQuestion) return;
    if (questionTokenRef.current === currentQuestion.questionToken) return;
    questionTokenRef.current = currentQuestion.questionToken;
    setTimeLeft(QUESTION_TIME_SEC);
    setAnswer('');
    setFeedback(null);
  }, [currentQuestion]);

  // Tick the timer every second
  useEffect(() => {
    if (!currentQuestion || decisionPending || isStalled) return;
    if (timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, currentQuestion, decisionPending, isStalled]);

  // ── Stall ticker ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!stallUntil) return;
    const tick = setInterval(() => {
      const rem = Math.max(0, stallUntil - Date.now());
      setStallRemaining(Math.ceil(rem / 1000));
      if (rem === 0) {
        setStallUntil(null);
        clearInterval(tick);
      }
    }, 200);
    return () => clearInterval(tick);
  }, [stallUntil]);

  // ── SSE subscriptions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { navigate('/'); return; }

    let myEventsUnsub: (() => void) | null = null;

    const connectMyEvents = () => {
      if (myEventsUnsub) return;
      myEventsUnsub = subscribeToMyEvents(
        id, token,
        (q: QuestionDispatchedData) => { setQuestion(q); setFeedback(null); setDecisionPending(false); },
        () => setSseError(true),
      );
    };

    const unsubRace = subscribeToRace(id, token, {
      onLeaderboardSnapshot: (d: LeaderboardSnapshotData) => {
        setLeaderboard(d.raceId, d.status, d.participants);
        if (d.status === 'ACTIVE') connectMyEvents();
      },
      onPositionUpdate: (d: PositionUpdateData) => updatePosition(d.userId, d.position),
      onRaceStart: () => connectMyEvents(),
      onRaceFinish: (d: RaceFinishData) => setWinner(d.winnerUsername),
      onPowerUp: (data) => {
        if (data.type === 'TURBO') setPowerUpMsg('⚡ TURBO! You got a speed boost!');
        else setPowerUpMsg('🔧 Flat Tire! Engine stalled…');
        setTimeout(() => setPowerUpMsg(null), 3000);
      },
      onError: () => setSseError(true),
    });

    return () => {
      unsubRace();
      myEventsUnsub?.();
      reset();
    };
  }, [id, token, navigate, setLeaderboard, updatePosition, setQuestion, reset]);

  // ── Answer submission ────────────────────────────────────────────────────────
  const processAnswerResult = useCallback(async (result: Awaited<ReturnType<typeof racesApi.submitAnswer>>) => {
    if (result.stalledNow) {
      setStallUntil(Date.now() + result.stallDurationMs);
      setStallRemaining(Math.ceil(result.stallDurationMs / 1000));
      if (!result.correct) {
        setFeedback({ text: 'Wrong answer — engine stalled!', correct: false });
      }
      setAnswer('');
      return;
    }
    if (result.decisionEventPending) {
      setDecisionPending(true);
      setFeedback(null);
      return;
    }
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

  // Auto-submit when timer runs out (blank = wrong)
  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (timeLeft === 0 && currentQuestion && !decisionPending && !isStalled && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      racesApi.submitAnswer(id, {
        questionToken: currentQuestion.questionToken,
        answer: '',
      }).then(processAnswerResult).catch(() => {}).finally(() => {
        autoSubmitRef.current = false;
      });
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

  // Sorted leaderboard
  const sorted = [...leaderboard].sort((a, b) => b.currentPosition - a.currentPosition);
  const myPos = leaderboard.find((p) => p.username === username)?.currentPosition ?? 0;
  const myRank = sorted.findIndex((p) => p.username === username) + 1;

  // ── Render ───────────────────────────────────────────────────────────────────

  // Race finished screen
  if (winner) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-6 p-8">
        <div className="text-8xl">🏆</div>
        <h1 className="text-4xl font-bold text-yellow-400">{winner} wins!</h1>
        <p className="text-gray-400">Race is over. Final standings:</p>
        <ol className="bg-gray-800 rounded-xl p-6 w-full max-w-sm space-y-2">
          {sorted.map((p, i) => (
            <li
              key={p.userId}
              className={`flex items-center gap-3 ${p.username === username ? 'text-yellow-400 font-bold' : ''}`}
            >
              <span className="w-6 text-gray-500">{i + 1}.</span>
              <span className="flex-1">{p.username}</span>
              <span className="font-mono text-sm text-gray-400">{p.currentPosition}</span>
            </li>
          ))}
        </ol>
        <button
          onClick={() => navigate('/student/join')}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col gap-3 p-4">
      {/* Decision event overlay */}
      {decisionPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm mx-4 text-center flex flex-col gap-4">
            <p className="text-5xl">🚦</p>
            <h2 className="text-2xl font-bold">Crossroads!</h2>
            <p className="text-gray-400 text-sm">Choose your path to continue racing.</p>
            <button
              onClick={() => handleDecisionChoice('HIGHWAY')}
              disabled={isDecisionLoading}
              className="py-4 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-lg transition-colors disabled:opacity-50"
            >
              🛣 Highway
              <span className="block text-sm font-normal mt-1 opacity-80">
                1 hard question · huge reward (3×) · risky!
              </span>
            </button>
            <button
              onClick={() => handleDecisionChoice('DIRT_ROAD')}
              disabled={isDecisionLoading}
              className="py-4 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg transition-colors disabled:opacity-50"
            >
              🌿 Dirt Road
              <span className="block text-sm font-normal mt-1 opacity-80">
                3 easy questions · safe & steady
              </span>
            </button>
          </div>
        </div>
      )}

      {/* SSE error */}
      {sseError && (
        <div className="bg-red-900/60 border border-red-600 text-red-300 px-4 py-2 rounded text-sm text-center">
          Connection lost — please refresh the page.
        </div>
      )}

      {/* Power-up notification */}
      {powerUpMsg && (
        <div className="bg-yellow-500/20 border border-yellow-500 text-yellow-300 px-4 py-2 rounded text-sm text-center font-semibold">
          {powerUpMsg}
        </div>
      )}

      {/* Visual race track */}
      <section className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Race Track</span>
          <span className="text-xs text-gray-400">
            {myRank > 0 ? `You are #${myRank} · ` : ''}{myPos} / {TRACK_LENGTH}
          </span>
        </div>
        <div className="space-y-2">
          {sorted.map((p, i) => {
            const pct = Math.min(100, (p.currentPosition / TRACK_LENGTH) * 100);
            const color = COLORS[i % COLORS.length];
            const isMe = p.username === username;
            return (
              <div key={p.userId} className="flex items-center gap-2">
                <span className={`w-20 text-xs text-right truncate shrink-0 ${isMe ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>
                  {p.username}
                </span>
                <div className="flex-1 bg-gray-700 rounded-full h-5 relative overflow-visible">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(1, pct)}%`, backgroundColor: color + '88' }}
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 text-base transition-all duration-500"
                    style={{ left: `${Math.max(0, pct - 2)}%` }}
                  >
                    🚗
                  </span>
                  <div className="absolute right-0 top-0 bottom-0 w-px bg-yellow-400 opacity-50" />
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-2">Waiting for race to start…</p>
          )}
        </div>
      </section>

      <div className="flex gap-3 flex-1">
        {/* Question panel */}
        <section className="flex-1 bg-gray-800 rounded-xl p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {currentQuestion?.mode === 'HIGHWAY'
                ? '🛣 Highway Question'
                : currentQuestion?.mode === 'DIRT_ROAD'
                ? `🌿 Dirt Road (${currentQuestion.dirtRoadRemaining} left)`
                : 'Your Question'}
            </h2>
            {currentQuestion && !decisionPending && !isStalled && (
              <TimerBadge timeLeft={timeLeft} />
            )}
          </div>

          {/* Stall display */}
          {isStalled && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="text-6xl animate-bounce">💥</div>
              <p className="text-xl font-bold text-red-400">Engine Stalled!</p>
              <p className="text-gray-400 text-sm">Resuming in {stallRemaining}s…</p>
              <div className="w-48 bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-red-500 transition-all"
                  style={{ width: `${(stallRemaining / 4) * 100}%` }}
                />
              </div>
            </div>
          )}

          {!isStalled && !decisionPending && currentQuestion ? (
            <>
              <p className="text-2xl font-bold flex-1 leading-snug">{currentQuestion.questionText}</p>

              <form onSubmit={handleAnswer} className="mt-5 flex gap-2">
                <input
                  className="flex-1 px-4 py-2.5 rounded-lg bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-mono"
                  placeholder="Your answer…"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  required
                />
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
                >
                  Submit
                </button>
              </form>

              {feedback && (
                <p className={`mt-3 text-sm font-semibold ${feedback.correct ? 'text-green-400' : 'text-red-400'}`}>
                  {feedback.correct ? '✓' : '✗'} {feedback.text}
                </p>
              )}
            </>
          ) : !isStalled && !decisionPending ? (
            <p className="text-gray-500 flex-1 flex items-center justify-center">
              Waiting for the race to start…
            </p>
          ) : null}
        </section>

        {/* Leaderboard */}
        <section className="w-52 bg-gray-800 rounded-xl p-4 flex flex-col">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Leaderboard
          </h2>
          <ol className="space-y-2 flex-1">
            {sorted.map((p, i) => (
              <li
                key={p.userId}
                className={`flex items-center gap-2 text-sm ${p.username === username ? 'text-yellow-400 font-bold' : ''}`}
              >
                <span className="text-gray-500 w-5 shrink-0 text-right">{i + 1}.</span>
                <span className="flex-1 truncate">{p.username}</span>
                <span className="font-mono text-xs">{p.currentPosition}</span>
              </li>
            ))}
            {sorted.length === 0 && (
              <li className="text-gray-600 text-sm">No participants yet</li>
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}

function TimerBadge({ timeLeft }: { timeLeft: number }) {
  const urgent = timeLeft <= 10;
  return (
    <div className={`flex items-center gap-1.5 text-sm font-mono font-bold px-3 py-1 rounded-full ${
      urgent ? 'bg-red-900/60 text-red-400 animate-pulse' : 'bg-gray-700 text-gray-300'
    }`}>
      <span>⏱</span>
      <span>{timeLeft}s</span>
    </div>
  );
}
