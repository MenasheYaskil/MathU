import { create } from 'zustand';
import type { ParticipantSnapshot, QuestionDispatchedData, RaceStatus } from '../types/api';

interface RaceState {
  raceId: number | null;
  status: RaceStatus | null;
  leaderboard: ParticipantSnapshot[];
  currentQuestion: QuestionDispatchedData | null;
  setLeaderboard: (raceId: number, status: RaceStatus, participants: ParticipantSnapshot[]) => void;
  updatePosition: (userId: number, position: number) => void;
  setQuestion: (q: QuestionDispatchedData) => void;
  reset: () => void;
}

const byPositionDesc = (a: ParticipantSnapshot, b: ParticipantSnapshot) =>
  b.currentPosition - a.currentPosition;

export const useRaceStore = create<RaceState>((set) => ({
  raceId: null,
  status: null,
  leaderboard: [],
  currentQuestion: null,

  setLeaderboard: (raceId, status, participants) =>
    set({ raceId, status, leaderboard: [...participants].sort(byPositionDesc) }),

  updatePosition: (userId, position) =>
    set((s) => ({
      leaderboard: s.leaderboard
        .map((p) => (p.userId === userId ? { ...p, currentPosition: position } : p))
        .sort(byPositionDesc),
    })),

  setQuestion: (currentQuestion) => set({ currentQuestion }),

  reset: () => set({ raceId: null, status: null, leaderboard: [], currentQuestion: null }),
}));
