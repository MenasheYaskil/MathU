package com.mathu.racegame.race.engine;

/**
 * Engine response returned to the REST controller after processing a submitted answer.
 *
 * Field semantics:
 *  correct               — whether the submitted answer was right
 *  distanceGained        — steps added to position this turn (0 on wrong / stall)
 *  stalledNow            — true if an Engine Stall was just applied (wrong answer or Flat Tire)
 *  stallDurationMs       — duration of the stall; 0 when stalledNow == false
 *  powerUpApplied        — null if no power-up triggered this answer
 *  powerUpDistanceBonus  — extra steps from Turbo; 0 for Flat Tire or no power-up
 *  decisionEventPending  — true when the client must present the Highway / Dirt Road fork choice
 *  currentMode           — the player's mode AFTER this answer is processed
 *  nextQuestionText      — null when stalledNow or decisionEventPending
 *  nextQuestionToken     — opaque UUID the client echoes on the next submission; null when no question
 *  dirtRoadRemaining     — questions left in Dirt Road sequence (0 when not in DIRT_ROAD mode)
 */
public record AnswerResult(
        boolean correct,
        int distanceGained,
        boolean stalledNow,
        long stallDurationMs,
        PowerUpType powerUpApplied,
        int powerUpDistanceBonus,
        boolean decisionEventPending,
        GameMode currentMode,
        String nextQuestionText,
        String nextQuestionToken,
        int dirtRoadRemaining
) {
    /** Builds a stall-only result (wrong answer or Flat Tire with no next question yet). */
    static AnswerResult ofStalled(long stallMs, GameMode mode) {
        return new AnswerResult(false, 0, true, stallMs, null, 0, false, mode, null, null, 0);
    }

    /**
     * General-purpose factory used for all non-stall outcomes.
     * Extracts power-up fields and next-question fields from their respective objects.
     */
    static AnswerResult of(boolean correct, int distance, boolean stalledNow, long stallMs,
                           PowerUpResult powerUp, boolean decisionPending,
                           GameMode mode, QuestionDispatch next) {
        PowerUpType pType  = powerUp != null ? powerUp.type()          : null;
        int         pBonus = powerUp != null ? powerUp.distanceBonus() : 0;
        String qText       = next != null ? next.questionText()        : null;
        String qToken      = next != null ? next.questionToken()       : null;
        int    dirtLeft    = next != null ? next.dirtRoadRemaining()   : 0;
        return new AnswerResult(correct, distance, stalledNow, stallMs,
                pType, pBonus, decisionPending, mode, qText, qToken, dirtLeft);
    }
}
