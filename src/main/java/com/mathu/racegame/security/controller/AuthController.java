package com.mathu.racegame.security.controller;

import com.mathu.racegame.security.controller.dto.RegisterRequest;
import com.mathu.racegame.security.dto.AuthRequest;
import com.mathu.racegame.security.dto.AuthResponse;
import com.mathu.racegame.security.service.JwtService;
import com.mathu.racegame.user.entity.User;
import com.mathu.racegame.user.service.UserService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService           userService;
    private final JwtService            jwtService;
    private final AuthenticationManager authManager;

    public AuthController(UserService userService,
                          JwtService jwtService,
                          AuthenticationManager authManager) {
        this.userService = userService;
        this.jwtService  = jwtService;
        this.authManager = authManager;
    }

    /** Registers a new user (teacher or student) and returns a signed JWT. */
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest req) {
        User user = userService.createUser(req.username(), req.email(), req.password(), req.role());
        String token = jwtService.generateToken(user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new AuthResponse(token, user.getUsername(), user.getRole().name()));
    }

    /** Authenticates an existing user and returns a signed JWT. */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody AuthRequest req) {
        authManager.authenticate(
                new UsernamePasswordAuthenticationToken(req.username(), req.password()));
        User user = (User) userService.loadUserByUsername(req.username());
        String token = jwtService.generateToken(user);
        return ResponseEntity.ok(new AuthResponse(token, user.getUsername(), user.getRole().name()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleIllegalArgumentException(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ex.getMessage());
    }
}
