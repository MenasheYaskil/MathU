package com.mathu.racegame.race.sse.dto;

import java.time.LocalDateTime;

public record RaceStartData(Long raceId, String raceTitle, LocalDateTime startedAt) {}
