package com.mathu.racegame.race.controller;

import com.mathu.racegame.race.controller.dto.CreateRaceRequest;
import com.mathu.racegame.race.controller.dto.JoinRaceRequest;
import com.mathu.racegame.race.entity.Race;
import com.mathu.racegame.race.entity.RaceParticipant;
import com.mathu.racegame.race.repository.RaceParticipantRepository;
import com.mathu.racegame.race.repository.RaceRepository;
import com.mathu.racegame.race.service.RaceService;
import com.mathu.racegame.user.entity.User;
import com.mathu.racegame.user.entity.UserRole;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/races")
public class RaceController {

    private final RaceService                raceService;
    private final RaceRepository             raceRepository;
    private final RaceParticipantRepository  participantRepository;

    public RaceController(RaceService raceService,
                          RaceRepository raceRepository,
                          RaceParticipantRepository participantRepository) {
        this.raceService           = raceService;
        this.raceRepository        = raceRepository;
        this.participantRepository = participantRepository;
    }

    /** Teacher creates a new race. Returns the race ID and auto-generated 6-char entry code. */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createRace(
            @Valid @RequestBody CreateRaceRequest req,
            @AuthenticationPrincipal User currentUser) {

        if (currentUser.getRole() != UserRole.TEACHER) {
            throw new AccessDeniedException("Only teachers can create races");
        }

        Race race = raceService.createRace(req.title(), currentUser, req.baseDifficulty());

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "raceId",         race.getId(),
                "entryCode",      race.getEntryCode(),
                "title",          race.getTitle(),
                "baseDifficulty", race.getBaseDifficulty(),
                "status",         race.getStatus().name()
        ));
    }

    /**
     * Student joins a race by entry code.
     * Returns the raceId and the participant's own ID (needed to connect to /my-events).
     */
    @PostMapping("/join")
    public ResponseEntity<Map<String, Object>> joinRace(
            @Valid @RequestBody JoinRaceRequest req,
            @AuthenticationPrincipal User currentUser) {

        RaceParticipant participant = raceService.joinRace(req.entryCode(), currentUser);

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "raceId",        participant.getRace().getId(),
                "participantId", participant.getId(),
                "title",         participant.getRace().getTitle(),
                "entryCode",     req.entryCode(),
                "status",        participant.getRace().getStatus().name()
        ));
    }

    /**
     * Teacher starts the race. Transitions status from LOBBY → ACTIVE.
     * Students should connect to /my-events after this call completes.
     */
    @PostMapping("/{raceId}/start")
    public ResponseEntity<Map<String, Object>> startRace(
            @PathVariable Long raceId,
            @AuthenticationPrincipal User currentUser) {

        Race race = raceService.startRace(raceId, currentUser);

        return ResponseEntity.ok(Map.of(
                "raceId",    race.getId(),
                "status",    race.getStatus().name(),
                "startedAt", race.getStartedAt().toString()
        ));
    }

    /**
     * Returns race details. Accessible to the creator and all enrolled participants.
     * Intended for lobby polling before SSE is connected.
     */
    @GetMapping("/{raceId}")
    public ResponseEntity<Map<String, Object>> getRace(
            @PathVariable Long raceId,
            @AuthenticationPrincipal User currentUser) {

        Race race = raceRepository.findByIdWithCreator(raceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Race not found"));

        boolean isCreator = race.getCreatedBy().getId().equals(currentUser.getId());
        if (!isCreator && !participantRepository.existsByRaceIdAndUserId(raceId, currentUser.getId())) {
            throw new AccessDeniedException("You are not a member of this race");
        }

        return ResponseEntity.ok(Map.of(
                "raceId",           race.getId(),
                "title",            race.getTitle(),
                "status",           race.getStatus().name(),
                "entryCode",        race.getEntryCode(),
                "baseDifficulty",   race.getBaseDifficulty(),
                "participantCount", participantRepository.countByRaceId(raceId)
        ));
    }

    /** Returns all races created by the authenticated teacher. TEACHER only. */
    @GetMapping("/mine")
    public ResponseEntity<List<Map<String, Object>>> getMyRaces(
            @AuthenticationPrincipal User currentUser) {

        if (currentUser.getRole() != UserRole.TEACHER) {
            throw new AccessDeniedException("Only teachers can list races");
        }

        List<Map<String, Object>> result = raceRepository.findByCreatedBy(currentUser).stream()
                .map(r -> Map.<String, Object>of(
                        "raceId",         r.getId(),
                        "title",          r.getTitle(),
                        "status",         r.getStatus().name(),
                        "entryCode",      r.getEntryCode(),
                        "baseDifficulty", r.getBaseDifficulty()
                ))
                .toList();

        return ResponseEntity.ok(result);
    }

    /**
     * Returns the current leaderboard for a race, ordered by position descending.
     * Accessible to the creator and all participants.
     */
    @GetMapping("/{raceId}/leaderboard")
    public ResponseEntity<List<Map<String, Object>>> getLeaderboard(
            @PathVariable Long raceId,
            @AuthenticationPrincipal User currentUser) {

        Race race = raceRepository.findByIdWithCreator(raceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Race not found"));

        boolean isCreator = race.getCreatedBy().getId().equals(currentUser.getId());
        if (!isCreator && !participantRepository.existsByRaceIdAndUserId(raceId, currentUser.getId())) {
            throw new AccessDeniedException("You are not a member of this race");
        }

        // JOIN FETCH — safe to access .getUser() outside a transaction (open-in-view is disabled)
        List<Map<String, Object>> result =
                participantRepository.findByRaceIdWithUsersOrderByPositionDesc(raceId).stream()
                        .map(p -> Map.<String, Object>of(
                                "userId",   p.getUser().getId(),
                                "username", p.getUser().getUsername(),
                                "position", p.getCurrentPosition()
                        ))
                        .toList();

        return ResponseEntity.ok(result);
    }
}
