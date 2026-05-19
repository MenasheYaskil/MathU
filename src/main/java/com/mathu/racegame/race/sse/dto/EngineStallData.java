package com.mathu.racegame.race.sse.dto;

/**
 * Payload broadcast to the teacher's race channel when any participant enters an Engine Stall.
 * The teacher dashboard uses this to highlight the stalled car and show a cooldown badge.
 *
 * userId        — the stalled participant's user ID (used to identify which car to animate)
 * stallDurationMs — exact stall duration in milliseconds (3 000–4 000)
 */
public record EngineStallData(Long userId, long stallDurationMs) {}
