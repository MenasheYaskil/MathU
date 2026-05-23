import type {
  AnswerRequest,
  AnswerResponse,
  CreateRaceRequest,
  CreateRaceResponse,
  DecisionRequest,
  JoinRaceResponse,
  LoginRequest,
  LoginResponse,
  QuestionDispatchedData,
  Race,
  RaceLeaderboardEntry,
  RegisterRequest,
} from '../types/api';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('mathu_token');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const auth = {
  login: (body: LoginRequest): Promise<LoginResponse> =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  // Register returns a LoginResponse (token + role) so the user is logged in immediately.
  register: (body: RegisterRequest): Promise<LoginResponse> =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
};

export const races = {
  create: (body: CreateRaceRequest): Promise<CreateRaceResponse> =>
    request('/api/races', { method: 'POST', body: JSON.stringify(body) }),

  getMine: (): Promise<Race[]> =>
    request('/api/races/mine'),

  getById: (raceId: number): Promise<Race & { participantCount: number }> =>
    request(`/api/races/${raceId}`),

  join: (entryCode: string): Promise<JoinRaceResponse> =>
    request('/api/races/join', { method: 'POST', body: JSON.stringify({ entryCode }) }),

  start: (raceId: number): Promise<void> =>
    request(`/api/races/${raceId}/start`, { method: 'POST' }),

  submitAnswer: (raceId: number, body: AnswerRequest): Promise<AnswerResponse> =>
    request(`/api/races/${raceId}/answer`, { method: 'POST', body: JSON.stringify(body) }),

  chooseDecisionPath: (raceId: number, body: DecisionRequest): Promise<QuestionDispatchedData> =>
    request(`/api/races/${raceId}/decision`, { method: 'POST', body: JSON.stringify(body) }),

  kickPlayer: (raceId: number, userId: number): Promise<void> =>
    request(`/api/races/${raceId}/participants/${userId}`, { method: 'DELETE' }),

  deleteRace: (raceId: number): Promise<void> =>
    request(`/api/races/${raceId}`, { method: 'DELETE' }),

  getLeaderboard: (raceId: number): Promise<RaceLeaderboardEntry[]> =>
    request(`/api/races/${raceId}/leaderboard`),
};
