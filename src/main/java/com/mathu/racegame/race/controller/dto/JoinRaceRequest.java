package com.mathu.racegame.race.controller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record JoinRaceRequest(
        @NotBlank @Size(min = 6, max = 6) String entryCode
) {}
