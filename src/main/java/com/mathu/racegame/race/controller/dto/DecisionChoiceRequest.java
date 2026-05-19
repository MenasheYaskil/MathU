package com.mathu.racegame.race.controller.dto;

import com.mathu.racegame.race.engine.GameMode;
import jakarta.validation.constraints.NotNull;

public record DecisionChoiceRequest(
        @NotNull GameMode choice   // must be HIGHWAY or DIRT_ROAD
) {}
