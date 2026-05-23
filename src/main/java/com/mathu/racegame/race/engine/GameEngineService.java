package com.mathu.racegame.race.engine;

import com.mathu.racegame.question.service.GeneratedQuestion;
import com.mathu.racegame.question.service.QuestionGeneratorService;
import com.mathu.racegame.race.entity.RaceParticipant;
import com.mathu.racegame.race.repository.RaceParticipantRepository;
import com.mathu.racegame.race.service.RaceService;
import com.mathu.racegame.race.sse.dto.*;
import com.mathu.racegame.race.sse.event.PlayerKickedEvent;
import com.mathu.racegame.race.sse.event.RaceFinishedEvent;
import com.mathu.racegame.race.sse.event.RaceUpdateEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

/**
 * GameEngineService — the game brain.
 *
 * Responsibilities:
 *  - Holds all volatile per-player state in-memory (ConcurrentHashMap of PlayerGameState).
 *  - Validates answers server-side; the client NEVER receives a correct answer or question ID.
 *  - Enforces Engine Stall, Decision Events, Difficulty Scaling, Power-Ups, and Rubber-Banding.
 *  - Writes to the DB only when a player's position changes (delegated to RaceService).
 *
 * Thread safety: ConcurrentHashMap for map-level ops; PlayerGameState.synchronized for
 * per-player state mutations. Each player's state is fully independent.
 */
@Service
public class GameEngineService {

    private static final Logger log = LoggerFactory.getLogger(GameEngineService.class);

    // ---- Distance constants (steps on a 0–1000 track) ----
    static final int NORMAL_DISTANCE    = 50;
    static final int HIGHWAY_DISTANCE   = 150;  // 3× normal: high-risk/high-reward
    static final int DIRT_ROAD_DISTANCE = 17;   // ×3 = 51 total: safe/slow mirror of Normal
    static final int TURBO_BONUS        = 50;   // additive on top of normal distance gain

    // ---- Engine Stall ----
    static final long STALL_MIN_MS = 3_000L;
    static final long STALL_MAX_MS = 4_000L;

    // ---- Decision event ----
    static final double DECISION_PROB_INCREMENT = 0.05;  // +5% per correct Normal answer

    // ---- Power-up probability ----
    static final double POWERUP_BASE_CHANCE   = 0.05;   // 5%  — standard player
    static final double POWERUP_RUBBER_CHANCE = 0.15;   // 15% — trailing player (rubber-band)
    static final double TURBO_WEIGHT_NORMAL   = 0.50;   // 50/50 Turbo vs Flat Tire
    static final double TURBO_WEIGHT_TRAILING = 0.80;   // trailing players get more Turbos

    // ---- Rubber-banding ----
    // "Trailing" = leader is this many steps ahead or more.
    // Effect: power-up chance triples and Normal difficulty drops by 1 (floored at 1).
    static final int RUBBER_BAND_GAP = 200;

    private static final String SUBJECT_AREA = "ARITHMETIC";

    // participantId → in-memory game state
    private final ConcurrentHashMap<Long, PlayerGameState> stateMap = new ConcurrentHashMap<>();

    private final RaceService               raceService;
    private final QuestionGeneratorService  questionGeneratorService;
    private final RaceParticipantRepository participantRepository;
    private final ApplicationEventPublisher publisher;

    public GameEngineService(RaceService raceService,
                             QuestionGeneratorService questionGeneratorService,
                             RaceParticipantRepository participantRepository,
                             ApplicationEventPublisher publisher) {
        this.raceService              = raceService;
        this.questionGeneratorService = questionGeneratorService;
        this.participantRepository    = participantRepository;
        this.publisher                = publisher;
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Initialises in-memory state for a participant and dispatches their first question.
     *
     * Reconnect handling: if state already exists in the map the player is reconnecting
     * (browser refresh, network drop, etc.). The existing state — position, mode, stall
     * timer, decision probability — is preserved. A fresh question is dispatched so the
     * client receives a valid token regardless of what the prior connection held.
     * If a decision event was pending before the disconnect, it is released and a normal
     * question is issued; the player loses the fork choice but keeps all other progress.
     */
    public QuestionDispatch initPlayer(Long raceId, Long userId, Long participantId, int baseDifficulty) {
        PlayerGameState existing = stateMap.get(participantId);
        if (existing != null) {
            PlayerGameState.Snapshot snap = existing.snapshot();
            log.debug("Participant {} reconnected — preserving state: {}", participantId, snap);
            return dispatchNextQuestion(existing);
        }
        int initialPos = participantRepository.findByRaceIdAndUserId(raceId, userId)
                .map(RaceParticipant::getCurrentPosition)
                .orElse(0);
        PlayerGameState state = new PlayerGameState(participantId, raceId, userId, baseDifficulty, initialPos);
        stateMap.put(participantId, state);
        return dispatchNextQuestion(state);
    }

    /**
     * Removes all in-memory state for every participant in the given race.
     * Triggered automatically via {@link RaceFinishedEvent} after the transaction commits.
     */
    public void cleanupRace(Long raceId) {
        stateMap.values().removeIf(s -> s.getRaceId().equals(raceId));
        log.debug("Cleaned up in-memory state for race {}", raceId);
    }

    @EventListener
    public void onRaceFinished(RaceFinishedEvent event) {
        cleanupRace(event.getRaceId());
    }

    @EventListener
    public void onPlayerKicked(PlayerKickedEvent event) {
        stateMap.remove(event.getParticipantId());
        log.debug("Removed game state for kicked participant {} in race {}",
                event.getParticipantId(), event.getRaceId());
    }

    // =========================================================================
    // Main game loop — answer submission
    // =========================================================================

    /**
     * Processes a student's submitted answer.
     *
     * Security guarantees enforced here:
     *  1. Stall guard — answers are rejected during an active Engine Stall.
     *  2. Token validation — the question token must match the current pending token,
     *     preventing replayed or out-of-order submissions.
     *  3. Server-side comparison — the correct answer never leaves the server.
     *
     * @param participantId the submitting participant
     * @param token         opaque UUID echoed from the last QuestionDispatch
     * @param rawAnswer     the student's raw answer text
     * @return AnswerResult describing the outcome and optionally the next question
     */
    public AnswerResult submitAnswer(Long participantId, String token, String rawAnswer) {
        PlayerGameState state = requireState(participantId);

        // Guard 1 — Engine Stall
        if (state.isStalled()) {
            long remainingMs = ChronoUnit.MILLIS.between(Instant.now(), state.getStallUntil());
            return AnswerResult.ofStalled(Math.max(0L, remainingMs), state.getMode());
        }

        // Guard 2 — no active question (decision event pending)
        if (state.getPendingQuestionToken() == null) {
            throw new IllegalStateException(
                    "No active question for participant " + participantId + "; decision event may be pending");
        }

        // Guard 3 — token integrity
        if (!token.equals(state.getPendingQuestionToken())) {
            throw new SecurityException("Invalid question token for participant " + participantId);
        }

        boolean correct = isAnswerCorrect(rawAnswer, state.getPendingCorrectAnswer());

        return switch (state.getMode()) {
            case NORMAL    -> handleNormalAnswer(state, correct);
            case HIGHWAY   -> handleHighwayAnswer(state, correct);
            case DIRT_ROAD -> handleDirtRoadAnswer(state, correct);
        };
    }

    // =========================================================================
    // Decision event — player chooses the fork
    // =========================================================================

    /**
     * Called after the client presents the Highway / Dirt Road choice to the student.
     * Sets the new mode and dispatches the first question for that path.
     *
     * @param choice HIGHWAY or DIRT_ROAD (NORMAL is illegal here)
     * @return the first question on the chosen path
     */
    public QuestionDispatch chooseDecisionPath(Long participantId, GameMode choice) {
        if (choice != GameMode.HIGHWAY && choice != GameMode.DIRT_ROAD) {
            throw new IllegalArgumentException("Decision path choice must be HIGHWAY or DIRT_ROAD");
        }
        PlayerGameState state = requireState(participantId);
        if (choice == GameMode.HIGHWAY) state.enterHighway();
        else                            state.enterDirtRoad();
        return dispatchNextQuestion(state);
    }

    // =========================================================================
    // Mode-specific answer handlers
    // =========================================================================

    /**
     * NORMAL mode:
     *  Wrong  → Engine Stall (3–4 s). No backward movement.
     *  Correct → +50 steps, evaluate power-up, increment decision event probability.
     *            If decision event triggers → pause and ask player to choose path.
     */
    private AnswerResult handleNormalAnswer(PlayerGameState state, boolean correct) {
        if (!correct) {
            long stallMs = randomStallDuration();
            state.applyStall(stallMs);
            publishRaceEvent(state, SseEventType.ENGINE_STALL,
                    new EngineStallData(state.getUserId(), stallMs));
            return AnswerResult.ofStalled(stallMs, GameMode.NORMAL);
        }

        boolean trailing   = isTrailing(state);
        PowerUpResult powerUp = evaluatePowerUp(trailing);

        boolean flatTire   = powerUp != null && powerUp.type() == PowerUpType.FLAT_TIRE;
        long    stallMs    = 0L;
        if (flatTire) {
            stallMs = randomStallDuration();
            state.applyStall(stallMs);
            publishRaceEvent(state, SseEventType.ENGINE_STALL,
                    new EngineStallData(state.getUserId(), stallMs));
        }

        if (powerUp != null) {
            publishRaceEvent(state, SseEventType.POWER_UP,
                    new PowerUpData(state.getUserId(), powerUp.type().name(), powerUp.distanceBonus()));
        }

        int distance = NORMAL_DISTANCE
                + (powerUp != null && powerUp.type() == PowerUpType.TURBO ? TURBO_BONUS : 0);
        advancePosition(state, distance);

        // Decision event probability (Normal mode only — not during Highway/Dirt Road runs)
        state.incrementDecisionProbability();
        boolean decisionTriggered = evaluateDecisionEvent(state);

        if (decisionTriggered) {
            state.clearQuestion(); // prevent token reuse while player is choosing
            publishRaceEvent(state, SseEventType.DECISION_EVENT_TRIGGERED,
                    new DecisionEventData(state.getUserId()));
            return AnswerResult.of(true, distance, flatTire, stallMs, powerUp, true,
                    state.getMode(), null);
        }

        // Flat Tire: correct answer earned the distance, but player is now stalled — no next question yet
        if (flatTire) {
            return AnswerResult.of(true, distance, true, stallMs, powerUp, false,
                    state.getMode(), null);
        }

        QuestionDispatch next = dispatchNextQuestion(state);
        return AnswerResult.of(true, distance, false, 0L, powerUp, false, state.getMode(), next);
    }

    /**
     * HIGHWAY mode (exactly ONE question):
     *  Wrong  → Engine Stall, return to NORMAL.
     *  Correct → +150 steps (3× normal), return to NORMAL, dispatch next question.
     */
    private AnswerResult handleHighwayAnswer(PlayerGameState state, boolean correct) {
        state.returnToNormal(); // Highway is always a single question; exit regardless of result

        if (!correct) {
            long stallMs = randomStallDuration();
            state.applyStall(stallMs);
            publishRaceEvent(state, SseEventType.ENGINE_STALL,
                    new EngineStallData(state.getUserId(), stallMs));
            return AnswerResult.ofStalled(stallMs, GameMode.NORMAL);
        }

        advancePosition(state, HIGHWAY_DISTANCE);
        QuestionDispatch next = dispatchNextQuestion(state);
        return AnswerResult.of(true, HIGHWAY_DISTANCE, false, 0L, null, false, GameMode.NORMAL, next);
    }

    /**
     * DIRT ROAD mode (exactly THREE questions):
     *  Wrong  → 0 points, NO Engine Stall — sequence continues immediately.
     *  Correct → +17 steps.
     *  After 3 questions (right or wrong): return to NORMAL automatically.
     */
    private AnswerResult handleDirtRoadAnswer(PlayerGameState state, boolean correct) {
        int distance = correct ? DIRT_ROAD_DISTANCE : 0;
        if (correct) advancePosition(state, distance);

        state.decrementDirtRoadQuestion(); // auto-transitions to NORMAL when remaining hits 0

        QuestionDispatch next = dispatchNextQuestion(state);
        return AnswerResult.of(correct, distance, false, 0L, null, false, state.getMode(), next);
    }

    // =========================================================================
    // Question dispatch
    // =========================================================================

    /**
     * Generates the next question at the appropriate difficulty, stores the correct
     * answer server-side, and returns only the question text + opaque token to the caller.
     */
    private QuestionDispatch dispatchNextQuestion(PlayerGameState state) {
        int difficulty = resolveDifficulty(state);

        // Rubber-banding: trailing players in NORMAL mode receive Base-1 difficulty
        if (state.getMode() == GameMode.NORMAL && isTrailing(state)) {
            difficulty = Math.max(1, difficulty - 1);
        }

        GeneratedQuestion q = questionGeneratorService.generate(SUBJECT_AREA, difficulty);

        String token            = UUID.randomUUID().toString();
        String normalizedAnswer = q.correctAnswer()
                .map(a -> a.trim().toLowerCase())
                .orElse(null); // null = non-computable question type (word problem etc.)

        state.setQuestion(token, normalizedAnswer);

        return new QuestionDispatch(q.questionText(), token, state.getMode(),
                state.getDirtRoadQuestionsRemaining());
    }

    // =========================================================================
    // Supporting logic
    // =========================================================================

    /** Maps the current game mode to its difficulty level relative to the base. */
    private int resolveDifficulty(PlayerGameState state) {
        int base = state.getBaseDifficulty();
        return switch (state.getMode()) {
            case NORMAL    -> base;
            case HIGHWAY   -> Math.min(5, base + 1);
            case DIRT_ROAD -> Math.max(1, base - 1);
        };
    }

    /** Case-insensitive, trimmed comparison. Returns false if the stored answer is null. */
    private boolean isAnswerCorrect(String raw, String normalizedCorrect) {
        if (normalizedCorrect == null) return false;
        return raw != null && raw.trim().toLowerCase().equals(normalizedCorrect);
    }

    /**
     * Probabilistic decision event check.
     * Rolls against the cumulative probability; resets to 0% if triggered.
     */
    private boolean evaluateDecisionEvent(PlayerGameState state) {
        double prob = state.getDecisionEventProbability();
        if (prob <= 0.0) return false;
        if (ThreadLocalRandom.current().nextDouble() < prob) {
            state.resetDecisionProbability();
            return true;
        }
        return false;
    }

    /**
     * Evaluates whether a power-up fires after a correct answer.
     *
     * Trailing players: 15% base chance, 80% chance the result is Turbo.
     * Normal players:    5% base chance, 50% chance the result is Turbo.
     * Flat Tire: Engine Stall duration applied to the player (bad luck event).
     */
    private PowerUpResult evaluatePowerUp(boolean trailing) {
        double chance = trailing ? POWERUP_RUBBER_CHANCE : POWERUP_BASE_CHANCE;
        if (ThreadLocalRandom.current().nextDouble() >= chance) return null;

        double turboWeight = trailing ? TURBO_WEIGHT_TRAILING : TURBO_WEIGHT_NORMAL;
        PowerUpType type   = ThreadLocalRandom.current().nextDouble() < turboWeight
                ? PowerUpType.TURBO : PowerUpType.FLAT_TIRE;

        return new PowerUpResult(type, type == PowerUpType.TURBO ? TURBO_BONUS : 0);
    }

    /**
     * Returns true if the leader's position is ≥ RUBBER_BAND_GAP steps ahead of this player.
     *
     * Uses the in-memory stateMap instead of a DB query — positions are kept current
     * by advancePosition() on every correct answer, so this read is always up-to-date
     * within the same JVM instance and avoids a DB round-trip per correct answer.
     */
    private boolean isTrailing(PlayerGameState state) {
        int leaderPos = stateMap.values().stream()
                .filter(s -> s.getRaceId().equals(state.getRaceId()))
                .mapToInt(PlayerGameState::getCurrentPosition)
                .max()
                .orElse(0);
        return (leaderPos - state.getCurrentPosition()) >= RUBBER_BAND_GAP;
    }

    /** Updates in-memory position cache and persists the new position via RaceService. */
    private void advancePosition(PlayerGameState state, int delta) {
        int newPos = state.getCurrentPosition() + delta;
        state.setCurrentPosition(newPos); // optimistic in-memory update; DB is written below
        raceService.advanceParticipant(state.getRaceId(), state.getUserId(), newPos);
    }

    /** Publishes an event to the teacher's race-wide SSE channel via the event bus. */
    private void publishRaceEvent(PlayerGameState state, SseEventType type, Object data) {
        publisher.publishEvent(new RaceUpdateEvent(this, state.getRaceId(),
                SseEventPayload.of(type, data)));
    }

    private long randomStallDuration() {
        return ThreadLocalRandom.current().nextLong(STALL_MIN_MS, STALL_MAX_MS + 1);
    }

    private PlayerGameState requireState(Long participantId) {
        PlayerGameState s = stateMap.get(participantId);
        if (s == null) {
            throw new IllegalStateException("No game state found for participant " + participantId
                    + ". Was initPlayer() called?");
        }
        return s;
    }
}
