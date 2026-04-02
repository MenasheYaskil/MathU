package com.mathu.racegame.question.service;

import java.util.Optional;

/**
 * Immutable value object representing a single procedurally generated question.
 *
 * correctAnswer is present only when the generator can compute it (e.g. arithmetic).
 * For word-problem templates the answer is left empty; the game engine phase will
 * introduce an answer-validation strategy appropriate to each subject area.
 */
public record GeneratedQuestion(String questionText, Optional<String> correctAnswer) {

    public static GeneratedQuestion of(String questionText) {
        return new GeneratedQuestion(questionText, Optional.empty());
    }

    public static GeneratedQuestion of(String questionText, String correctAnswer) {
        return new GeneratedQuestion(questionText, Optional.of(correctAnswer));
    }
}
