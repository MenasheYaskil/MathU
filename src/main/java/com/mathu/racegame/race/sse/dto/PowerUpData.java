package com.mathu.racegame.race.sse.dto;

/**
 * Payload broadcast to the teacher's race channel when a power-up fires for any participant.
 *
 * userId        — the affected participant
 * powerUpType   — "TURBO" or "FLAT_TIRE"
 * distanceBonus — extra steps added (> 0 for TURBO, 0 for FLAT_TIRE)
 */
public record PowerUpData(Long userId, String powerUpType, int distanceBonus) {}
