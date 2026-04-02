package com.mathu.racegame.security.dto;

public record AuthResponse(String token, String username, String role) {}
