package com.mathu.racegame.race.service;

import com.mathu.racegame.race.entity.Race;
import com.mathu.racegame.race.entity.RaceParticipant;
import com.mathu.racegame.race.entity.RaceStatus;
import com.mathu.racegame.race.repository.RaceParticipantRepository;
import com.mathu.racegame.race.repository.RaceRepository;
import com.mathu.racegame.race.sse.SseService;
import com.mathu.racegame.race.sse.dto.*;
import com.mathu.racegame.user.entity.User;
import org.springframework.stereotype.Service;
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

    public RaceService(RaceRepository raceRepository,
                       RaceParticipantRepository participantRepository,
                       EntryCodeGenerator entryCodeGenerator,
                       SseService sseService) {
        this.raceRepository = raceRepository;
        this.participantRepository = participantRepository;
        this.entryCodeGenerator = entryCodeGenerator;
        this.sseService = sseService;
    }

    public Race createRace(String title, User teacher) {
        Race race = new Race();
        race.setTitle(title);
        race.setCreatedBy(teacher);
        race.setEntryCode(entryCodeGenerator.generateUnique());
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
     * Accesses participant.getUser() lazily within the transaction boundary —
     * safe since open-in-view is disabled but this method is @Transactional.
     */
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
            afterCommit(() -> sseService.broadcastToRace(raceId, finishEvent));
        }
    }

    private Race findRaceById(Long raceId) {
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
