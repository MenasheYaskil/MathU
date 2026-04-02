package com.mathu.racegame.race.sse.dto;

import java.util.List;

/**
 * Sent immediately when a client connects. Gives the React frontend the
 * complete current state so it can render without waiting for the next event.
 */
public record LeaderboardSnapshotData(
        Long raceId,
        String raceStatus,
        List<ParticipantSnapshot> participants
) {}
