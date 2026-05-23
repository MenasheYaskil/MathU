import { create } from 'zustand';
import type { ParticipantSnapshot, QuestionDispatchedData, RaceStatus } from '../types/api';

interface RaceState {
  raceId: number | null;
  status: RaceStatus | null;
  leaderboard: ParticipantSnapshot[];
  currentQuestion: QuestionDispatchedData | null;
  setLeaderboard: (raceId: number, status: RaceStatus, participants: ParticipantSnapshot[]) => void;
  updatePosition: (userId: number, position: number) => void;
  addParticipant: (participant: ParticipantSnapshot) => void;
  removeParticipant: (userId: number) => void;
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

  addParticipant: (participant) =>
    set((s) => ({
      leaderboard: s.leaderboard.some((p) => p.userId === participant.userId)
        ? s.leaderboard
        : [...s.leaderboard, participant].sort(byPositionDesc),
    })),

  removeParticipant: (userId) =>
    set((s) => ({ leaderboard: s.leaderboard.filter((p) => p.userId !== userId) })),

  setQuestion: (currentQuestion) => set({ currentQuestion }),

  reset: () => set({ raceId: null, status: null, leaderboard: [], currentQuestion: null }),
}));
