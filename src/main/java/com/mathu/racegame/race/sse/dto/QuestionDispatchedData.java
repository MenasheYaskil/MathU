package com.mathu.racegame.race.sse.dto;

/**
 * Sent to a student's personal SSE channel (/my-events) when a new question is dispatched.
 * Used only for the INITIAL question on connect; subsequent questions arrive in the REST
 * response body (AnswerResult.nextQuestionText / nextQuestionToken).
 *
 * Security contract: the correct answer is NEVER included here.
 *
 * questionText       — display text for the student
 * questionToken      — opaque UUID the student echoes back on answer submission
 * mode               — current GameMode ("NORMAL", "HIGHWAY", "DIRT_ROAD")
 * dirtRoadRemaining  — 0 unless in DIRT_ROAD mode (1–3 while sequence is active)
 */
public record QuestionDispatchedData(
        String questionText,
        String questionToken,
        String mode,
        int dirtRoadRemaining
) {}
