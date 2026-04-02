package com.mathu.racegame.race.sse.dto;

public record PositionUpdateData(Long raceId, Long userId, String username, int position) {}
