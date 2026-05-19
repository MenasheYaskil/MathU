package com.mathu.racegame.race.controller.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateRaceRequest(
        @NotBlank @Size(max = 100) String title,
        @Min(1) @Max(5)            int    baseDifficulty
) {}
