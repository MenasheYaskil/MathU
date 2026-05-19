import type {
  DecisionEventData,
  EngineStallData,
  LeaderboardSnapshotData,
  ParticipantJoinedData,
  PositionUpdateData,
  PowerUpData,
  QuestionDispatchedData,
  RaceFinishData,
  RaceStartData,
  SseEventType,
} from '../types/api';

// Direct connection bypasses the Vite dev proxy, which buffers streaming responses.
// The backend CORS config explicitly allows http://localhost:5173, so this is safe.
// In production, VITE_API_BASE_URL is set to the deployed origin and both REST + SSE use it.
const SSE_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

type Handler<T> = (data: T) => void;

export interface RaceEventHandlers {
  onLeaderboardSnapshot?: Handler<LeaderboardSnapshotData>;
  onPositionUpdate?: Handler<PositionUpdateData>;
  onParticipantJoined?: Handler<ParticipantJoinedData>;
  onRaceStart?: Handler<RaceStartData>;
  onRaceFinish?: Handler<RaceFinishData>;
  onEngineStall?: Handler<EngineStallData>;
  onPowerUp?: Handler<PowerUpData>;
  onDecisionEvent?: Handler<DecisionEventData>;
  onError?: (err: Event) => void;
}

// Every backend SSE message has the envelope: { "type": "EVENT_NAME", "data": { ... } }
// We parse the envelope and pass only the inner `data` to the handler.
function listen<T>(es: EventSource, type: SseEventType, fn?: Handler<T>): void {
  if (!fn) return;
  es.addEventListener(type, (e) => {
    try {
      const envelope = JSON.parse((e as MessageEvent<string>).data) as { data: T };
      fn(envelope.data);
    } catch (err) {
      console.error('[SSE] Failed to parse event of type', type, '— raw data:', (e as MessageEvent).data, err);
    }
  });
}

/** Shared race channel — leaderboard, position updates, race lifecycle, and game events. */
export function subscribeToRace(
  raceId: number,
  token: string,
  handlers: RaceEventHandlers,
): () => void {
  const es = new EventSource(
    `${SSE_BASE}/api/races/${raceId}/events?token=${encodeURIComponent(token)}`,
  );

  listen<LeaderboardSnapshotData>(es, 'LEADERBOARD_SNAPSHOT', handlers.onLeaderboardSnapshot);
  listen<PositionUpdateData>(es, 'POSITION_UPDATE', handlers.onPositionUpdate);
  listen<ParticipantJoinedData>(es, 'PARTICIPANT_JOINED', handlers.onParticipantJoined);
  listen<RaceStartData>(es, 'RACE_START', handlers.onRaceStart);
  listen<RaceFinishData>(es, 'RACE_FINISH', handlers.onRaceFinish);
  listen<EngineStallData>(es, 'ENGINE_STALL', handlers.onEngineStall);
  listen<PowerUpData>(es, 'POWER_UP', handlers.onPowerUp);
  listen<DecisionEventData>(es, 'DECISION_EVENT_TRIGGERED', handlers.onDecisionEvent);
  if (handlers.onError) es.onerror = handlers.onError;

  return () => es.close();
}

/**
 * Student personal channel — receives QUESTION_DISPATCHED events.
 * Only call this once the race is ACTIVE; the backend returns 409 for LOBBY/FINISHED status.
 */
export function subscribeToMyEvents(
  raceId: number,
  token: string,
  onQuestion: Handler<QuestionDispatchedData>,
  onError?: (err: Event) => void,
): () => void {
  const es = new EventSource(
    `${SSE_BASE}/api/races/${raceId}/my-events?token=${encodeURIComponent(token)}`,
  );

  listen<QuestionDispatchedData>(es, 'QUESTION_DISPATCHED', onQuestion);
  if (onError) es.onerror = onError;

  return () => es.close();
}
