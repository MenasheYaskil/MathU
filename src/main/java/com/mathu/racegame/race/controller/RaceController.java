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

    /**
     * Teacher permanently deletes a LOBBY or FINISHED race.
     * Active races are rejected — they must finish before deletion.
     */
    @DeleteMapping("/{raceId}")
    public ResponseEntity<Void> deleteRace(
            @PathVariable Long raceId,
            @AuthenticationPrincipal User currentUser) {

        raceService.deleteRace(raceId, currentUser);
        return ResponseEntity.noContent().build();
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
     * Returns race details including winner and finishedAt for FINISHED races.
     * Accessible to the creator and all enrolled participants.
     */
    @GetMapping("/{raceId}")
    public ResponseEntity<Map<String, Object>> getRace(
            @PathVariable Long raceId,
            @AuthenticationPrincipal User currentUser) {

        // JOIN FETCH both createdBy and winner to avoid LazyInitializationException
        Race race = raceRepository.findByIdWithCreatorAndWinner(raceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Race not found"));

        boolean isCreator = race.getCreatedBy().getId().equals(currentUser.getId());
        if (!isCreator && !participantRepository.existsByRaceIdAndUserId(raceId, currentUser.getId())) {
            throw new AccessDeniedException("You are not a member of this race");
        }

        // LinkedHashMap to support null values (Map.of() rejects null)
        var details = new java.util.LinkedHashMap<String, Object>();
        details.put("raceId",           race.getId());
        details.put("title",            race.getTitle());
        details.put("status",           race.getStatus().name());
        details.put("entryCode",        race.getEntryCode());
        details.put("baseDifficulty",   race.getBaseDifficulty());
        details.put("participantCount", participantRepository.countByRaceId(raceId));
        if (race.getWinner()     != null) details.put("winnerUsername", race.getWinner().getUsername());
        if (race.getFinishedAt() != null) details.put("finishedAt",     race.getFinishedAt().toString());
        return ResponseEntity.ok(details);
    }

    /** Returns all races created by the authenticated teacher. TEACHER only. */
    @GetMapping("/mine")
    public ResponseEntity<List<Map<String, Object>>> getMyRaces(
            @AuthenticationPrincipal User currentUser) {

        if (currentUser.getRole() != UserRole.TEACHER) {
            throw new AccessDeniedException("Only teachers can list races");
        }

        // finishedAt is a plain column — safe to access without a transaction.
        // winner is LAZY so we skip it here; the modal fetches /races/{id} for full details.
        List<Map<String, Object>> result = raceRepository.findByCreatedBy(currentUser).stream()
                .map(r -> {
                    var m = new java.util.LinkedHashMap<String, Object>();
                    m.put("raceId",         r.getId());
                    m.put("title",          r.getTitle());
                    m.put("status",         r.getStatus().name());
                    m.put("entryCode",      r.getEntryCode());
                    m.put("baseDifficulty", r.getBaseDifficulty());
                    if (r.getFinishedAt() != null) m.put("finishedAt", r.getFinishedAt().toString());
                    return (Map<String, Object>) m;
                })
                .toList();

        return ResponseEntity.ok(result);
    }

    /**
     * Teacher removes a student from an active or lobby race.
     * Broadcasts PLAYER_KICKED to all SSE clients and closes the student's personal channel.
     */
    @DeleteMapping("/{raceId}/participants/{userId}")
    public ResponseEntity<Void> kickPlayer(
            @PathVariable Long raceId,
            @PathVariable Long userId,
            @AuthenticationPrincipal User currentUser) {

        raceService.kickPlayer(raceId, userId, currentUser);
        return ResponseEntity.noContent().build();
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
