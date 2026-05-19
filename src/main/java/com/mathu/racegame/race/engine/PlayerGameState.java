package com.mathu.racegame.race.engine;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Volatile, per-participant game state held entirely in memory.
 *
 * Never written to the database — lives for the duration of the race and is
 * discarded by {@code GameEngineService.cleanupRace()} when the race ends.
 *
 * All mutating methods are {@code synchronized} so concurrent SSE ticks and
 * answer submissions for the same participant are serialised safely.
 */
public class PlayerGameState {

    // Immutable identity — set once on construction
    private final Long participantId;
    private final Long raceId;
    private final Long userId;
    private final int  baseDifficulty;

    // --- Mode state ---
    private GameMode mode                    = GameMode.NORMAL;
    private int      dirtRoadQuestionsRemaining = 0;

    // --- Decision event ---
    private double decisionEventProbability  = 0.0;

    // --- Engine Stall ---
    private Instant stallUntil               = null;

    // --- Current question (server-side only — never sent to client) ---
    private String pendingQuestionToken      = null;  // opaque UUID echoed by client
    private String pendingCorrectAnswer      = null;  // normalised; null = non-computable question

    // --- Position tracking (in-memory cache; DB is source of truth on init) ---
    private int currentPosition;

    public PlayerGameState(Long participantId, Long raceId, Long userId,
                           int baseDifficulty, int initialPosition) {
        this.participantId   = participantId;
        this.raceId          = raceId;
        this.userId          = userId;
        this.baseDifficulty  = baseDifficulty;
        this.currentPosition = initialPosition;
    }

    // ---- Immutable accessors ----

    public Long getParticipantId() { return participantId; }
    public Long getRaceId()        { return raceId; }
    public Long getUserId()        { return userId; }
    public int  getBaseDifficulty(){ return baseDifficulty; }

    // ---- Stall ----

    public synchronized boolean isStalled() {
        return stallUntil != null && Instant.now().isBefore(stallUntil);
    }

    public synchronized Instant getStallUntil() { return stallUntil; }

    public synchronized void applyStall(long durationMs) {
        this.stallUntil = Instant.now().plusMillis(durationMs);
    }

    // ---- Mode transitions ----

    public synchronized GameMode getMode() { return mode; }

    public synchronized void enterHighway() {
        this.mode = GameMode.HIGHWAY;
        this.dirtRoadQuestionsRemaining = 0;
    }

    public synchronized void enterDirtRoad() {
        this.mode = GameMode.DIRT_ROAD;
        this.dirtRoadQuestionsRemaining = 3;
    }

    /**
     * Decrements the Dirt Road question counter.
     * Automatically transitions back to NORMAL when all 3 questions are served.
     */
    public synchronized void decrementDirtRoadQuestion() {
        if (dirtRoadQuestionsRemaining > 0) {
            dirtRoadQuestionsRemaining--;
        }
        if (dirtRoadQuestionsRemaining == 0) {
            this.mode = GameMode.NORMAL;
        }
    }

    public synchronized void returnToNormal() {
        this.mode = GameMode.NORMAL;
        this.dirtRoadQuestionsRemaining = 0;
    }

    public synchronized int getDirtRoadQuestionsRemaining() { return dirtRoadQuestionsRemaining; }

    // ---- Decision event probability ----

    public synchronized double getDecisionEventProbability() { return decisionEventProbability; }

    /** +5% per correct answer in NORMAL mode; capped at 100%. */
    public synchronized void incrementDecisionProbability() {
        this.decisionEventProbability = Math.min(1.0, this.decisionEventProbability + 0.05);
    }

    public synchronized void resetDecisionProbability() {
        this.decisionEventProbability = 0.0;
    }

    // ---- Question management ----

    public synchronized String getPendingQuestionToken()  { return pendingQuestionToken; }
    public synchronized String getPendingCorrectAnswer()  { return pendingCorrectAnswer; }

    public synchronized void setQuestion(String token, String normalizedAnswer) {
        this.pendingQuestionToken = token;
        this.pendingCorrectAnswer = normalizedAnswer;
    }

    /** Clears question state when a decision event is pending and no next question is dispatched yet. */
    public synchronized void clearQuestion() {
        this.pendingQuestionToken = null;
        this.pendingCorrectAnswer = null;
    }

    // ---- Position (in-memory cache) ----

    public synchronized int getCurrentPosition() { return currentPosition; }

    public synchronized void setCurrentPosition(int position) { this.currentPosition = position; }

    // ---- Reconnect snapshot ----

    /**
     * Immutable view of the state fields that are relevant when a student reconnects.
     * Used by GameEngineService.initPlayer() to log reconnect context and decide
     * whether to preserve or reset the player's in-memory state.
     *
     * @param decisionPending true when a decision event fired but the player has not
     *                        yet chosen Highway or Dirt Road (pendingQuestionToken == null)
     */
    public record Snapshot(
            long participantId,
            GameMode mode,
            int  currentPosition,
            boolean decisionPending,
            boolean stalled,
            long stallRemainingMs
    ) {}

    public synchronized Snapshot snapshot() {
        long stallRemainingMs = (stallUntil != null)
                ? Math.max(0L, ChronoUnit.MILLIS.between(Instant.now(), stallUntil))
                : 0L;
        return new Snapshot(
                participantId,
                mode,
                currentPosition,
                pendingQuestionToken == null,   // no token ↔ decision pending
                isStalled(),
                stallRemainingMs
        );
    }
}
