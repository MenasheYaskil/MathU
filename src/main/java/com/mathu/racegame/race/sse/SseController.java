package com.mathu.racegame.race.sse;

import com.mathu.racegame.race.entity.Race;
import com.mathu.racegame.race.entity.RaceParticipant;
import com.mathu.racegame.race.repository.RaceParticipantRepository;
import com.mathu.racegame.race.repository.RaceRepository;
import com.mathu.racegame.race.sse.dto.*;
import com.mathu.racegame.user.entity.User;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/races")
public class SseController {

    private final SseService sseService;
    private final RaceRepository raceRepository;
    private final RaceParticipantRepository participantRepository;

    public SseController(SseService sseService,
                         RaceRepository raceRepository,
                         RaceParticipantRepository participantRepository) {
        this.sseService = sseService;
        this.raceRepository = raceRepository;
        this.participantRepository = participantRepository;
    }

    /**
     * SSE subscription endpoint.
     *
     * Browser usage:
     *   const es = new EventSource(`/api/races/${raceId}/events?token=${jwt}`);
     *   es.addEventListener('POSITION_UPDATE', e => handle(JSON.parse(e.data)));
     *
     * The JWT filter intercepts the ?token= query parameter and populates
     * the SecurityContext before this method is reached. Spring Security's
     * 'authenticated()' rule then gates access — no anonymous connections possible.
     *
     * On connect, the full current leaderboard state is pushed as the first event
     * (LEADERBOARD_SNAPSHOT) so the React frontend can render immediately.
     */
    @GetMapping(value = "/{raceId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe(@PathVariable Long raceId,
                                @AuthenticationPrincipal User currentUser) {

        // findByIdWithCreator uses JOIN FETCH — safe to access .getCreatedBy() outside a tx
        Race race = raceRepository.findByIdWithCreator(raceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Race not found"));

        boolean isTeacher = race.getCreatedBy().getId().equals(currentUser.getId());
        boolean isParticipant = participantRepository.existsByRaceIdAndUserId(raceId, currentUser.getId());

        if (!isTeacher && !isParticipant) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You are not a member of this race");
        }

        // JOIN FETCH loads users in one query — no N+1 when building snapshots
        List<RaceParticipant> participants =
                participantRepository.findByRaceIdWithUsersOrderByPositionDesc(raceId);

        List<ParticipantSnapshot> snapshots = participants.stream()
                .map(p -> new ParticipantSnapshot(
                        p.getUser().getId(),
                        p.getUser().getUsername(),
                        p.getCurrentPosition()))
                .toList();

        SseEventPayload snapshot = SseEventPayload.of(
                SseEventType.LEADERBOARD_SNAPSHOT,
                new LeaderboardSnapshotData(raceId, race.getStatus().name(), snapshots));

        return sseService.subscribe(raceId, snapshot);
    }
}
