package com.mathu.racegame.race.engine;

/**
 * Internal value object representing a power-up event that fired this answer.
 * Package-private — callers outside the engine see PowerUpType via AnswerResult.
 */
record PowerUpResult(PowerUpType type, int distanceBonus) {}
