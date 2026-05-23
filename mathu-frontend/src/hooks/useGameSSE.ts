import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import type { RaceEventHandlers } from '../services/sseService';
import type { QuestionDispatchedData } from '../types/api';

const SSE_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

export interface UseGameSSEResult {
  sseError: boolean;
  openPersonalChannel: () => void;
}

/**
 * Manages both SSE channels for the game:
 *   - Race channel  (/events)    — leaderboard, position updates, game events
 *   - Personal channel (/my-events) — student's own QUESTION_DISPATCHED events
 *
 * Call openPersonalChannel() only once the race is ACTIVE (the backend returns
 * 409 for any other status). The hook remembers that the personal channel is
 * open and won't re-open it on subsequent calls.
 */
export function useGameSSE(
  raceId: number,
  handlers: RaceEventHandlers,
  onQuestion?: (data: QuestionDispatchedData) => void,
): UseGameSSEResult {
  const token = useAuthStore((s) => s.token);
  const [sseError, setSseError] = useState(false);

  // Refs for mutable state that must not re-trigger the effect
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const onQuestionRef = useRef(onQuestion);
  onQuestionRef.current = onQuestion;

  const mountedRef = useRef(true);
  const raceEsRef = useRef<EventSource | null>(null);
  const personalEsRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffMsRef = useRef(INITIAL_BACKOFF_MS);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function listenTyped<T>(es: EventSource, type: string, fn?: (d: T) => void): void {
    if (!fn) return;
    es.addEventListener(type, (e: Event) => {
      if (!mountedRef.current) return;
      try {
        const envelope = JSON.parse((e as MessageEvent<string>).data) as { data: T };
        fn(envelope.data);
      } catch {
        // Malformed SSE payload — silently drop, never crash the UI
      }
    });
  }

  // ── Race channel ─────────────────────────────────────────────────────────

  // connectRef lets the reconnect timer always call the latest version of connect
  // without needing to list it as a useCallback dependency.
  const connectRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!token) return;
    mountedRef.current = true;

    function connect() {
      raceEsRef.current?.close();
      clearTimeout(reconnectTimerRef.current ?? undefined);

      const url = `${SSE_BASE}/api/races/${raceId}/events?token=${encodeURIComponent(token!)}`;
      const es = new EventSource(url);
      raceEsRef.current = es;

      const h = handlersRef.current;
      listenTyped(es, 'LEADERBOARD_SNAPSHOT', h.onLeaderboardSnapshot);
      listenTyped(es, 'POSITION_UPDATE',       h.onPositionUpdate);
      listenTyped(es, 'PARTICIPANT_JOINED',     h.onParticipantJoined);
      listenTyped(es, 'RACE_START',             h.onRaceStart);
      listenTyped(es, 'RACE_FINISH',            h.onRaceFinish);
      listenTyped(es, 'ENGINE_STALL',           h.onEngineStall);
      listenTyped(es, 'POWER_UP',               h.onPowerUp);
      listenTyped(es, 'DECISION_EVENT_TRIGGERED', h.onDecisionEvent);

      es.onopen = () => {
        if (!mountedRef.current) return;
        backoffMsRef.current = INITIAL_BACKOFF_MS;
        setSseError(false);
      };

      es.onerror = (err) => {
        if (!mountedRef.current) return;
        handlersRef.current.onError?.(err);

        // readyState CLOSED means the browser gave up — schedule a manual reconnect.
        // readyState CONNECTING means the browser is already retrying — don't stack timers.
        if (es.readyState === EventSource.CLOSED) {
          setSseError(true);
          const delay = backoffMsRef.current;
          backoffMsRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) connectRef.current();
          }, delay);
        }
      };
    }

    connectRef.current = connect;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current ?? undefined);
      raceEsRef.current?.close();
      raceEsRef.current = null;
      personalEsRef.current?.close();
      personalEsRef.current = null;
    };
  }, [raceId, token]); // handlers read via ref — intentionally excluded from deps

  // ── Personal channel ─────────────────────────────────────────────────────

  const openPersonalChannel = useCallback(() => {
    // Guard: already open, unmounted, or no token
    if (!token || !mountedRef.current || personalEsRef.current) return;

    const url = `${SSE_BASE}/api/races/${raceId}/my-events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    personalEsRef.current = es;

    listenTyped<QuestionDispatchedData>(es, 'QUESTION_DISPATCHED', (d) => {
      onQuestionRef.current?.(d);
    });

    es.onerror = () => {
      if (!mountedRef.current) return;
      // On close, clear the ref so a future openPersonalChannel() call can reconnect.
      // The race channel reconnect is handled separately above.
      if (es.readyState === EventSource.CLOSED) {
        personalEsRef.current = null;
        es.close();
      }
    };
  }, [token, raceId]);

  return { sseError, openPersonalChannel };
}
