package com.mathu.racegame.race.service;

import com.mathu.racegame.race.entity.Race;
import com.mathu.racegame.race.entity.RaceParticipant;
import com.mathu.racegame.race.entity.RaceStatus;
import com.mathu.racegame.race.repository.RaceParticipantRepository;
import com.mathu.racegame.race.repository.RaceRepository;
import com.mathu.racegame.race.sse.SseService;
import com.mathu.racegame.race.sse.dto.*;
import com.mathu.racegame.race.sse.event.PlayerKickedEvent;
import com.mathu.racegame.race.sse.event.RaceFinishedEvent;
import com.mathu.racegame.user.entity.User;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.List;

@Service
@Transactional
public class RaceService {

    private static final int FINISH_LINE = 1000;

    private final RaceRepository raceRepository;
    private final RaceParticipantRepository participantRepository;
    private final EntryCodeGenerator entryCodeGenerator;
    private final SseService sseService;
    private final ApplicationEventPublisher eventPublisher;

    public RaceService(RaceRepository raceRepository,
                       RaceParticipantRepository participantRepository,
                       EntryCodeGenerator entryCodeGenerator,
                       SseService sseService,
                       ApplicationEventPublisher eventPublisher) {
        this.raceRepository = raceRepository;
        this.participantRepository = participantRepository;
        this.entryCodeGenerator = entryCodeGenerator;
        this.sseService = sseService;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Hard-deletes a LOBBY or FINISHED race and all its participants (cascade).
     * Active races are blocked — they must reach FINISHED status before deletion.
     */
    public void deleteRace(Long raceId, User requestingTeacher) {
        Race race = findRaceById(raceId);

        if (!race.getCreatedBy().getId().equals(requestingTeacher.getId())) {
            throw new SecurityException("Only the race creator can delete the race");
        }
        if (race.getStatus() == RaceStatus.ACTIVE) {
            throw new IllegalStateException("Cannot delete an active race — let it finish first");
        }

        // Race.participants is CascadeType.ALL + orphanRemoval=true:
        // deleting the Race cascades to all RaceParticipant rows automatically.
        raceRepository.delete(race);
    }

    public Race createRace(String title, User teacher, int baseDifficulty) {
        if (baseDifficulty < 1 || baseDifficulty > 5) {
            throw new IllegalArgumentException("baseDifficulty must be between 1 and 5");
        }
        Race race = new Race();
        race.setTitle(title);
        race.setCreatedBy(teacher);
        race.setEntryCode(entryCodeGenerator.generateUnique());
        race.setBaseDifficulty(baseDifficulty);
        return raceRepository.save(race);
    }

    public RaceParticipant joinRace(String entryCode, User student) {
        Race race = raceRepository.findByEntryCode(entryCode)
                .orElseThrow(() -> new IllegalArgumentException("Race not found for code: " + entryCode));

        if (race.getStatus() != RaceStatus.LOBBY) {
            throw new IllegalStateException("Race is no longer accepting participants");
        }
        if (participantRepository.existsByRaceIdAndUserId(race.getId(), student.getId())) {
            throw new IllegalStateException("Student is already in this race");
        }

        RaceParticipant participant = new RaceParticipant();
        participant.setRace(race);
        participant.setUser(student);
        RaceParticipant saved = participantRepository.save(participant);

        // Broadcast after commit — avoids pushing an event for a transaction that may roll back
        final Long raceId = race.getId();
        final SseEventPayload event = SseEventPayload.of(
                SseEventType.PARTICIPANT_JOINED,
                new ParticipantJoinedData(raceId, student.getId(), student.getUsername()));
        afterCommit(() -> sseService.broadcastToRace(raceId, event));

        return saved;
    }

    public Race startRace(Long raceId, User requestingTeacher) {
        Race race = findRaceById(raceId);

        if (!race.getCreatedBy().getId().equals(requestingTeacher.getId())) {
            throw new SecurityException("Only the race creator can start the race");
        }
        if (race.getStatus() != RaceStatus.LOBBY) {
            throw new IllegalStateException("Race cannot be started from status: " + race.getStatus());
        }

        race.setStatus(RaceStatus.ACTIVE);
        race.setStartedAt(LocalDateTime.now());
        Race saved = raceRepository.save(race);

        final SseEventPayload event = SseEventPayload.of(
                SseEventType.RACE_START,
                new RaceStartData(raceId, race.getTitle(), race.getStartedAt()));
        afterCommit(() -> sseService.broadcastToRace(raceId, event));

        return saved;
    }

    /**
     * Advances a participant's position. Clamps to FINISH_LINE and declares a
     * winner if this is the first participant to reach it.
     * Called by the game engine on every correct answer event.
     *
     * {@code REQUIRES_NEW} ensures this method always owns its own transaction so that
     * {@code @Retryable} can open a fresh transaction on each attempt after an
     * {@link ObjectOptimisticLockingFailureException} (caused by the {@code @Version}
     * column on {@link com.mathu.racegame.race.entity.RaceParticipant}).
     *
     * Accesses participant.getUser() lazily within the transaction boundary —
     * safe since open-in-view is disabled but this method is @Transactional.
     */
    @Retryable(
            retryFor = ObjectOptimisticLockingFailureException.class,
            maxAttempts = 3,
            backoff = @Backoff(delay = 50, multiplier = 2.0)
    )
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public RaceParticipant advanceParticipant(Long raceId, Long userId, int newPosition) {
        RaceParticipant participant = participantRepository
                .findByRaceIdAndUserId(raceId, userId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Participant not found: raceId=%d userId=%d".formatted(raceId, userId)));

        int clamped = Math.min(newPosition, FINISH_LINE);
        participant.setCurrentPosition(clamped);
        RaceParticipant saved = participantRepository.save(participant);

        // Capture username while the User proxy is still within the transaction
        final String username = participant.getUser().getUsername();
        final SseEventPayload positionEvent = SseEventPayload.of(
                SseEventType.POSITION_UPDATE,
                new PositionUpdateData(raceId, userId, username, clamped));
        afterCommit(() -> sseService.broadcastToRace(raceId, positionEvent));

        if (clamped >= FINISH_LINE) {
            declareWinnerIfNotYetDeclared(raceId, participant.getUser());
        }

        return saved;
    }

    @Transactional(readOnly = true)
    public List<RaceParticipant> getLeaderboard(Long raceId) {
        return participantRepository.findByRaceIdOrderByCurrentPositionDesc(raceId);
    }

    /**
     * Removes a student from the race and broadcasts a PLAYER_KICKED SSE event to all clients.
     * The student's personal SSE channel is closed and their in-memory engine state is removed
     * via a {@link PlayerKickedEvent} (avoids a circular dependency with GameEngineService).
     */
    public void kickPlayer(Long raceId, Long targetUserId, User requestingTeacher) {
        Race race = findRaceById(raceId);

        if (!race.getCreatedBy().getId().equals(requestingTeacher.getId())) {
            throw new SecurityException("Only the race creator can kick players");
        }
        if (race.getStatus() == RaceStatus.FINISHED) {
            throw new IllegalStateException("Cannot kick players from a finished race");
        }

        RaceParticipant participant = participantRepository
                .findByRaceIdAndUserId(raceId, targetUserId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Participant not found in race " + raceId));

        final String username      = participant.getUser().getUsername();
        final Long   participantId = participant.getId();
        participantRepository.delete(participant);

        final SseEventPayload kickEvent = SseEventPayload.of(
                SseEventType.PLAYER_KICKED,
                new PlayerKickedData(targetUserId, username));
        afterCommit(() -> {
            sseService.broadcastToRace(raceId, kickEvent);
            sseService.completeParticipantChannel(participantId);
            eventPublisher.publishEvent(new PlayerKickedEvent(this, raceId, participantId));
        });
    }

    private void declareWinnerIfNotYetDeclared(Long raceId, User winner) {
        Race race = findRaceById(raceId);
        if (race.getStatus() == RaceStatus.ACTIVE) {
            race.setWinner(winner);
            race.setStatus(RaceStatus.FINISHED);
            race.setFinishedAt(LocalDateTime.now());
            raceRepository.save(race);

            final SseEventPayload finishEvent = SseEventPayload.of(
                    SseEventType.RACE_FINISH,
                    new RaceFinishData(raceId, winner.getId(), winner.getUsername()));
            afterCommit(() -> {
                sseService.broadcastToRace(raceId, finishEvent);
                eventPublisher.publishEvent(new RaceFinishedEvent(this, raceId));
            });
        }
    }

    private Race findRaceById(Long raceId) {
        if (raceId == null) {
            throw new IllegalArgumentException("Race ID must not be null");
        }
        return raceRepository.findById(raceId)
                .orElseThrow(() -> new IllegalArgumentException("Race not found: " + raceId));
    }

    /**
     * Registers a callback to run strictly after the current transaction commits.
     * Guarantees that SSE clients never receive an event for a change that was
     * rolled back. Uses Spring's TransactionSynchronizationManager directly to
     * avoid creating a separate event class for each broadcast type.
     */
    private void afterCommit(Runnable action) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
