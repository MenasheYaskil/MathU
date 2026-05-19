// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  role: 'TEACHER' | 'STUDENT';
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role: 'TEACHER' | 'STUDENT';
}

// ─── Race ────────────────────────────────────────────────────────────────────

export type RaceStatus = 'LOBBY' | 'ACTIVE' | 'FINISHED';

export interface Race {
  raceId: number;
  title: string;
  entryCode: string;
  status: RaceStatus;
  baseDifficulty: number;
}

export interface CreateRaceRequest {
  title: string;
  baseDifficulty: number;
}

export interface CreateRaceResponse {
  raceId: number;
  entryCode: string;
}

export interface JoinRaceResponse {
  raceId: number;
}

export interface AnswerRequest {
  questionToken: string;
  answer: string;
}

export interface AnswerResponse {
  correct: boolean;
  distanceGained: number;
  stalledNow: boolean;
  stallDurationMs: number;
  powerUpApplied: 'TURBO' | 'FLAT_TIRE' | null;
  powerUpDistanceBonus: number;
  decisionEventPending: boolean;
  currentMode: 'NORMAL' | 'HIGHWAY' | 'DIRT_ROAD';
  nextQuestionText: string | null;
  nextQuestionToken: string | null;
  dirtRoadRemaining: number;
}

export interface DecisionRequest {
  choice: 'HIGHWAY' | 'DIRT_ROAD';
}

// ─── SSE Event Types (must match SseEventType.java exactly) ──────────────────

export type SseEventType =
  | 'LEADERBOARD_SNAPSHOT'
  | 'POSITION_UPDATE'
  | 'PARTICIPANT_JOINED'
  | 'RACE_START'
  | 'RACE_FINISH'
  | 'HEARTBEAT'
  | 'ENGINE_STALL'
  | 'POWER_UP'
  | 'DECISION_EVENT_TRIGGERED'
  | 'QUESTION_DISPATCHED';

// ─── SSE Payloads ────────────────────────────────────────────────────────────

export interface ParticipantSnapshot {
  userId: number;
  username: string;
  currentPosition: number;
}

export interface LeaderboardSnapshotData {
  raceId: number;
  status: RaceStatus;
  participants: ParticipantSnapshot[];
}

export interface PositionUpdateData {
  raceId: number;
  userId: number;
  username: string;
  position: number;
}

export interface RaceStartData {
  raceId: number;
  raceTitle: string;
  startedAt: string;
}

export interface RaceFinishData {
  raceId: number;
  winnerId: number;
  winnerUsername: string;
}

export interface ParticipantJoinedData {
  raceId: number;
  userId: number;
  username: string;
}

export interface EngineStallData {
  userId: number;
  stallDurationMs: number;
}

export interface PowerUpData {
  userId: number;
  type: string;
  distanceBonus: number;
}

export interface DecisionEventData {
  userId: number;
}

export interface QuestionDispatchedData {
  questionText: string;
  questionToken: string;
  mode: string;
  dirtRoadRemaining: number;
}
