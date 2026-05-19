package com.mathu.racegame.race.sse.dto;

/**
 * Payload broadcast to the teacher's race channel when a student hits a Decision Event
 * (cumulative probability triggered). The teacher dashboard can render a fork indicator
 * above that student's car while the student chooses Highway or Dirt Road.
 *
 * userId — the participant who must now choose their path
 */
public record DecisionEventData(Long userId) {}
