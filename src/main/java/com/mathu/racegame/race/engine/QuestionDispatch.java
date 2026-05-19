package com.mathu.racegame.race.engine;

/**
 * Carries a newly dispatched question to the REST controller.
 *
 * Security contract:
 *  - {@code questionText} is displayed to the student.
 *  - {@code questionToken} is an opaque UUID the student echoes back on answer submission.
 *  - The correct answer is NEVER included — it is stored server-side in PlayerGameState.
 *
 * {@code dirtRoadRemaining} is 0 unless the player is currently in DIRT_ROAD mode,
 * in which case it reflects how many questions remain in the sequence (1–3).
 */
public record QuestionDispatch(
        String questionText,
        String questionToken,
        GameMode mode,
        int dirtRoadRemaining
) {}
