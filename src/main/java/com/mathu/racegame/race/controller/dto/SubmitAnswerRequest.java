package com.mathu.racegame.race.controller.dto;

import jakarta.validation.constraints.NotBlank;

public record SubmitAnswerRequest(
        @NotBlank String questionToken,   // opaque UUID from the last QuestionDispatch
        @NotBlank String answer           // student's raw answer text
) {}
