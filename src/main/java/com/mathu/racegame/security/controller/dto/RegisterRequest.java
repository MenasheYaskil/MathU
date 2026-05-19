package com.mathu.racegame.security.controller.dto;

import com.mathu.racegame.user.entity.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Size(min = 3, max = 50)           String   username,
        @NotBlank @Email                              String   email,
        @NotBlank @Size(min = 4, max = 100)          String   password,
        @NotNull                                      UserRole role
) {}
