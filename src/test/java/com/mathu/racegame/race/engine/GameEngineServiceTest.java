package com.mathu.racegame.race.engine;

import com.mathu.racegame.question.service.GeneratedQuestion;
import com.mathu.racegame.question.service.QuestionGeneratorService;
import com.mathu.racegame.race.entity.RaceParticipant;
import com.mathu.racegame.race.repository.RaceParticipantRepository;
import com.mathu.racegame.race.service.RaceService;
import com.mathu.racegame.user.entity.User;
import com.mathu.racegame.user.entity.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.lang.reflect.Field;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for GameEngineService — the core game brain.
 *
 * Strategy: mock all three dependencies (RaceService, QuestionGeneratorService,
 * RaceParticipantRepository) so the tests exercise only the engine's own logic.
 *
 * Reflection helpers are used sparingly to observe or force volatile in-memory
 * state (stall expiry, decision event probability) that cannot be observed or
 * controlled via the public API alone.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("GameEngineService")
class GameEngineServiceTest {

    @Mock RaceService               raceService;
    @Mock QuestionGeneratorService  questionGeneratorService;
    @Mock RaceParticipantRepository participantRepository;
    @Mock ApplicationEventPublisher publisher;  // injected into GameEngineService constructor

    @InjectMocks GameEngineService engine;

    // Shared test identifiers
    private static final Long   RACE_ID        = 1L;
    private static final Long   USER_ID        = 2L;
    private static final Long   PARTICIPANT_ID = 3L;
    private static final int    BASE_DIFF      = 2;   // teacher-set difficulty
    private static final String CORRECT_ANS    = "42";
    private static final String WRONG_ANS      = "99";

    @BeforeEach
    void setUp() {
        // All question generations return a question with a known, deterministic answer.
        when(questionGeneratorService.generate(anyString(), anyInt()))
                .thenReturn(GeneratedQuestion.of("6 × 7 = ?", CORRECT_ANS));

        // initPlayer queries DB for starting position (always 0 at race start).
        when(participantRepository.findByRaceIdAndUserId(RACE_ID, USER_ID))
                .thenReturn(Optional.of(makeParticipant(USER_ID, 0)));

        // isTrailing() now reads from the in-memory stateMap — no repository stub needed.
        // A single player in the map means leaderPos == myPos, so isTrailing() returns false,
        // which suppresses rubber-banding in tests that don't specifically exercise it.
    }

    // =========================================================================
    // Initialisation
    // =========================================================================

    @Nested
    @DisplayName("initPlayer")
    class InitPlayer {

        @Test
        @DisplayName("dispatches first question with text and opaque token")
        void dispatchesFirstQuestion() {
            QuestionDispatch dispatch = initPlayer();

            assertThat(dispatch.questionText()).isEqualTo("6 × 7 = ?");
            assertThat(dispatch.questionToken()).isNotBlank();
            assertThat(dispatch.mode()).isEqualTo(GameMode.NORMAL);
            assertThat(dispatch.dirtRoadRemaining()).isZero();
        }

        @Test
        @DisplayName("uses base difficulty for the first question")
        void usesBaseDifficultyForFirstQuestion() {
            initPlayer();

            verify(questionGeneratorService).generate("ARITHMETIC", BASE_DIFF);
        }
    }

    // =========================================================================
    // Normal progression — 50 steps
    // =========================================================================

    @Nested
    @DisplayName("Normal mode — correct answer")
    class NormalCorrect {

        @Test
        @DisplayName("advances position by at least 50 steps (base normal distance)")
        void advances50Steps() {
            QuestionDispatch dispatch = initPlayer();
            ArgumentCaptor<Integer> posCaptor = ArgumentCaptor.forClass(Integer.class);

            engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS);

            verify(raceService).advanceParticipant(eq(RACE_ID), eq(USER_ID), posCaptor.capture());
            // Minimum 50; Turbo power-up can add another 50 — both are correct behaviour
            assertThat(posCaptor.getValue())
                    .isGreaterThanOrEqualTo(GameEngineService.NORMAL_DISTANCE);
        }

        @Test
        @DisplayName("result is marked correct with distanceGained >= 50")
        void resultIsCorrectWithPositiveDistance() {
            QuestionDispatch dispatch = initPlayer();

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS);

            assertThat(result.correct()).isTrue();
            assertThat(result.distanceGained()).isGreaterThanOrEqualTo(GameEngineService.NORMAL_DISTANCE);
        }

        @Test
        @DisplayName("provides next question token (or signals decision event pending)")
        void providesNextQuestionOrDecisionEvent() {
            QuestionDispatch dispatch = initPlayer();

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS);

            // Either a next question is ready, OR a decision event was triggered
            assertThat(result.nextQuestionToken() != null || result.decisionEventPending()).isTrue();
        }
    }

    // =========================================================================
    // Engine Stall — wrong answer in Normal mode
    // =========================================================================

    @Nested
    @DisplayName("Engine Stall — wrong answer")
    class EngineStall {

        @Test
        @DisplayName("wrong answer in Normal mode: position is never advanced (no backward movement)")
        void wrongAnswer_positionNeverAdvanced() {
            QuestionDispatch dispatch = initPlayer();

            engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), WRONG_ANS);

            verify(raceService, never()).advanceParticipant(anyLong(), anyLong(), anyInt());
        }

        @Test
        @DisplayName("wrong answer in Normal mode: result reports 0 distance and stalledNow=true")
        void wrongAnswer_zeroDistanceAndStallApplied() {
            QuestionDispatch dispatch = initPlayer();

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), WRONG_ANS);

            assertThat(result.correct()).isFalse();
            assertThat(result.distanceGained()).isZero();
            assertThat(result.stalledNow()).isTrue();
        }

        @Test
        @DisplayName("stall duration is strictly between 3 000 ms and 4 000 ms inclusive")
        void stallDurationIsWithinSpecifiedRange() {
            QuestionDispatch dispatch = initPlayer();

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), WRONG_ANS);

            assertThat(result.stallDurationMs())
                    .isGreaterThanOrEqualTo(GameEngineService.STALL_MIN_MS)
                    .isLessThanOrEqualTo(GameEngineService.STALL_MAX_MS);
        }

        @Test
        @DisplayName("answering during an active stall returns stall status without processing the answer")
        void answerDuringStall_rejectedWithRemainingTime() {
            QuestionDispatch dispatch = initPlayer();
            engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), WRONG_ANS); // trigger stall
            reset(raceService);

            // Immediate second submission — player is still stalled
            AnswerResult duringStall = engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS);

            assertThat(duringStall.stalledNow()).isTrue();
            assertThat(duringStall.stallDurationMs()).isGreaterThan(0L);
            verify(raceService, never()).advanceParticipant(anyLong(), anyLong(), anyInt());
        }

        @Test
        @DisplayName("after stall expires, the same question token is accepted and processed")
        void afterStallExpires_answerIsProcessed() throws Exception {
            QuestionDispatch dispatch = initPlayer();
            engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), WRONG_ANS); // trigger stall

            expireStall(PARTICIPANT_ID); // reflection: set stallUntil to past

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS);

            assertThat(result.stalledNow()).isFalse();
            assertThat(result.correct()).isTrue();
        }

        @Test
        @DisplayName("submitting with an invalid token throws SecurityException")
        void invalidToken_throwsSecurityException() {
            initPlayer();

            assertThatThrownBy(() ->
                    engine.submitAnswer(PARTICIPANT_ID, "not-a-valid-token", CORRECT_ANS))
                    .isInstanceOf(SecurityException.class);
        }
    }

    // =========================================================================
    // Highway mechanics
    // =========================================================================

    @Nested
    @DisplayName("Highway mode")
    class HighwayMode {

        @Test
        @DisplayName("correct answer advances exactly 150 steps (3× normal)")
        void correctAnswer_advances150Steps() {
            initPlayer();
            QuestionDispatch highwayQ = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.HIGHWAY);
            ArgumentCaptor<Integer> posCaptor = ArgumentCaptor.forClass(Integer.class);

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, highwayQ.questionToken(), CORRECT_ANS);

            verify(raceService).advanceParticipant(eq(RACE_ID), eq(USER_ID), posCaptor.capture());
            assertThat(posCaptor.getValue()).isEqualTo(GameEngineService.HIGHWAY_DISTANCE);
            assertThat(result.distanceGained()).isEqualTo(GameEngineService.HIGHWAY_DISTANCE);
            assertThat(result.correct()).isTrue();
        }

        @Test
        @DisplayName("mode returns to NORMAL after the single highway question (correct)")
        void correctAnswer_modeReturnsToNormal() {
            initPlayer();
            QuestionDispatch highwayQ = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.HIGHWAY);

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, highwayQ.questionToken(), CORRECT_ANS);

            assertThat(result.currentMode()).isEqualTo(GameMode.NORMAL);
        }

        @Test
        @DisplayName("wrong answer: Engine Stall applied, 0 distance, mode returns to NORMAL")
        void wrongAnswer_stallAndZeroDistanceAndNormalMode() {
            initPlayer();
            QuestionDispatch highwayQ = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.HIGHWAY);

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, highwayQ.questionToken(), WRONG_ANS);

            verify(raceService, never()).advanceParticipant(anyLong(), anyLong(), anyInt());
            assertThat(result.correct()).isFalse();
            assertThat(result.distanceGained()).isZero();
            assertThat(result.stalledNow()).isTrue();
            assertThat(result.currentMode()).isEqualTo(GameMode.NORMAL);
        }

        @Test
        @DisplayName("dispatches question at Base+1 difficulty (capped at 5)")
        void dispatchesAtBasePlusOneDifficulty() {
            initPlayer();
            engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.HIGHWAY);

            verify(questionGeneratorService, atLeastOnce())
                    .generate("ARITHMETIC", Math.min(5, BASE_DIFF + 1));
        }
    }

    // =========================================================================
    // Dirt Road mechanics
    // =========================================================================

    @Nested
    @DisplayName("Dirt Road mode")
    class DirtRoadMode {

        @Test
        @DisplayName("correct answer advances exactly 17 steps")
        void correctAnswer_advances17Steps() {
            initPlayer();
            QuestionDispatch dirtQ = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.DIRT_ROAD);
            ArgumentCaptor<Integer> posCaptor = ArgumentCaptor.forClass(Integer.class);

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dirtQ.questionToken(), CORRECT_ANS);

            verify(raceService).advanceParticipant(eq(RACE_ID), eq(USER_ID), posCaptor.capture());
            assertThat(posCaptor.getValue()).isEqualTo(GameEngineService.DIRT_ROAD_DISTANCE);
            assertThat(result.distanceGained()).isEqualTo(GameEngineService.DIRT_ROAD_DISTANCE);
        }

        @Test
        @DisplayName("wrong answer: 0 points, NO Engine Stall (safe path guarantee)")
        void wrongAnswer_zeroPointsAndNoStall() {
            initPlayer();
            QuestionDispatch dirtQ = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.DIRT_ROAD);

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dirtQ.questionToken(), WRONG_ANS);

            assertThat(result.stalledNow()).isFalse();
            assertThat(result.stallDurationMs()).isZero();
            assertThat(result.distanceGained()).isZero();
            verify(raceService, never()).advanceParticipant(anyLong(), anyLong(), anyInt());
        }

        @Test
        @DisplayName("wrong answer immediately provides the next question (no stall gate)")
        void wrongAnswer_nextQuestionDispatchedImmediately() {
            initPlayer();
            QuestionDispatch dirtQ = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.DIRT_ROAD);

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dirtQ.questionToken(), WRONG_ANS);

            assertThat(result.nextQuestionToken()).isNotBlank();
        }

        @Test
        @DisplayName("sequence is exactly 3 questions; counter decrements correctly then mode returns to NORMAL")
        void sequenceIsExactly3Questions_thenNormalMode() {
            initPlayer();
            QuestionDispatch q = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.DIRT_ROAD);

            assertThat(q.dirtRoadRemaining()).isEqualTo(3);

            // Q1
            AnswerResult r1 = engine.submitAnswer(PARTICIPANT_ID, q.questionToken(), CORRECT_ANS);
            assertThat(r1.currentMode()).isEqualTo(GameMode.DIRT_ROAD);
            assertThat(r1.dirtRoadRemaining()).isEqualTo(2);

            // Q2
            AnswerResult r2 = engine.submitAnswer(PARTICIPANT_ID, r1.nextQuestionToken(), CORRECT_ANS);
            assertThat(r2.currentMode()).isEqualTo(GameMode.DIRT_ROAD);
            assertThat(r2.dirtRoadRemaining()).isEqualTo(1);

            // Q3 — final; must transition back to NORMAL
            AnswerResult r3 = engine.submitAnswer(PARTICIPANT_ID, r2.nextQuestionToken(), CORRECT_ANS);
            assertThat(r3.currentMode()).isEqualTo(GameMode.NORMAL);
            assertThat(r3.dirtRoadRemaining()).isZero();
        }

        @Test
        @DisplayName("three correct answers total exactly 51 steps (17 × 3)")
        void threeCorrectAnswers_total51Steps() {
            initPlayer();
            QuestionDispatch q = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.DIRT_ROAD);
            ArgumentCaptor<Integer> posCaptor = ArgumentCaptor.forClass(Integer.class);

            AnswerResult r1 = engine.submitAnswer(PARTICIPANT_ID, q.questionToken(), CORRECT_ANS);
            AnswerResult r2 = engine.submitAnswer(PARTICIPANT_ID, r1.nextQuestionToken(), CORRECT_ANS);
            engine.submitAnswer(PARTICIPANT_ID, r2.nextQuestionToken(), CORRECT_ANS);

            verify(raceService, times(3))
                    .advanceParticipant(eq(RACE_ID), eq(USER_ID), posCaptor.capture());

            List<Integer> positions = posCaptor.getAllValues();
            assertThat(positions).containsExactly(17, 34, 51);
        }

        @Test
        @DisplayName("mixed right/wrong answers still complete the sequence in exactly 3 questions")
        void mixedAnswers_sequenceStillCompletesIn3Questions() {
            initPlayer();
            QuestionDispatch q = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.DIRT_ROAD);

            AnswerResult r1 = engine.submitAnswer(PARTICIPANT_ID, q.questionToken(), WRONG_ANS);
            assertThat(r1.currentMode()).isEqualTo(GameMode.DIRT_ROAD);

            AnswerResult r2 = engine.submitAnswer(PARTICIPANT_ID, r1.nextQuestionToken(), CORRECT_ANS);
            assertThat(r2.currentMode()).isEqualTo(GameMode.DIRT_ROAD);

            AnswerResult r3 = engine.submitAnswer(PARTICIPANT_ID, r2.nextQuestionToken(), WRONG_ANS);
            assertThat(r3.currentMode()).isEqualTo(GameMode.NORMAL);
        }

        @Test
        @DisplayName("dispatches questions at Base-1 difficulty (floored at 1)")
        void dispatchesAtBaseMinusOneDifficulty() {
            initPlayer();
            engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.DIRT_ROAD);

            verify(questionGeneratorService, atLeastOnce())
                    .generate("ARITHMETIC", Math.max(1, BASE_DIFF - 1));
        }
    }

    // =========================================================================
    // Decision Event — cumulative probability trigger
    // =========================================================================

    @Nested
    @DisplayName("Decision Event — cumulative probability")
    class DecisionEvent {

        @Test
        @DisplayName("triggers and returns decisionEventPending=true when probability reaches 100%")
        void triggersAt100PercentProbability() throws Exception {
            QuestionDispatch dispatch = initPlayer();
            setDecisionProbability(PARTICIPANT_ID, 1.0); // force deterministic trigger

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS);

            assertThat(result.decisionEventPending()).isTrue();
            assertThat(result.nextQuestionToken()).isNull(); // no next question until path chosen
        }

        @Test
        @DisplayName("probability resets to 0% after the event triggers")
        void probabilityResetsAfterTrigger() throws Exception {
            QuestionDispatch dispatch = initPlayer();
            setDecisionProbability(PARTICIPANT_ID, 1.0);

            engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS);

            assertThat(getDecisionProbability(PARTICIPANT_ID)).isEqualTo(0.0);
        }

        @Test
        @DisplayName("wrong answer does NOT increment the decision event probability")
        void wrongAnswer_doesNotIncrementProbability() throws Exception {
            QuestionDispatch dispatch = initPlayer();
            setDecisionProbability(PARTICIPANT_ID, 0.10); // set a known baseline

            engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), WRONG_ANS); // wrong → stall

            // Probability must remain unchanged after a wrong answer
            assertThat(getDecisionProbability(PARTICIPANT_ID)).isEqualTo(0.10);
        }

        @Test
        @DisplayName("correct answer in Normal mode increments probability OR triggers event")
        void correctAnswer_incrementsProbabilityOrTriggersEvent() throws Exception {
            QuestionDispatch dispatch = initPlayer();
            setDecisionProbability(PARTICIPANT_ID, 0.0); // start at 0%

            AnswerResult result = engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS);

            double probAfter = getDecisionProbability(PARTICIPANT_ID);
            // Either the probability incremented to 5% (not triggered),
            // or the event triggered and reset to 0% (decisionEventPending=true)
            assertThat(result.decisionEventPending() || probAfter > 0.0)
                    .as("Correct answer must either increment probability or trigger the event")
                    .isTrue();
        }

        @Test
        @DisplayName("submitting answer with no active question (after trigger) throws IllegalStateException")
        void noActiveQuestion_throwsIllegalStateException() throws Exception {
            QuestionDispatch dispatch = initPlayer();
            setDecisionProbability(PARTICIPANT_ID, 1.0);
            engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS); // triggers event → clears question

            // A Flat Tire power-up may have stalled the player (2.5% chance) — expire it so
            // the null-token check is reached rather than the stall guard.
            expireStall(PARTICIPANT_ID);

            // State has no pending token now; a submission must be rejected
            assertThatThrownBy(() ->
                    engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS))
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("choosing HIGHWAY after decision event sets mode and dispatches hard question")
        void chooseHighwayAfterDecision_setsHighwayMode() throws Exception {
            QuestionDispatch dispatch = initPlayer();
            setDecisionProbability(PARTICIPANT_ID, 1.0);
            engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS); // trigger

            QuestionDispatch highwayQ = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.HIGHWAY);

            assertThat(highwayQ.mode()).isEqualTo(GameMode.HIGHWAY);
            assertThat(highwayQ.questionToken()).isNotBlank();
        }

        @Test
        @DisplayName("choosing DIRT_ROAD after decision event sets mode and starts 3-question sequence")
        void chooseDirtRoadAfterDecision_setsDirtRoadMode() throws Exception {
            QuestionDispatch dispatch = initPlayer();
            setDecisionProbability(PARTICIPANT_ID, 1.0);
            engine.submitAnswer(PARTICIPANT_ID, dispatch.questionToken(), CORRECT_ANS); // trigger

            QuestionDispatch dirtQ = engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.DIRT_ROAD);

            assertThat(dirtQ.mode()).isEqualTo(GameMode.DIRT_ROAD);
            assertThat(dirtQ.dirtRoadRemaining()).isEqualTo(3);
        }

        @Test
        @DisplayName("choosing NORMAL as decision path throws IllegalArgumentException")
        void chooseNormal_throwsIllegalArgumentException() {
            initPlayer();

            assertThatThrownBy(() ->
                    engine.chooseDecisionPath(PARTICIPANT_ID, GameMode.NORMAL))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    // =========================================================================
    // Cleanup
    // =========================================================================

    @Nested
    @DisplayName("cleanupRace")
    class CleanupRace {

        @Test
        @DisplayName("removes all participant state; subsequent submitAnswer throws IllegalStateException")
        void removesAllState_subsequentCallThrows() {
            initPlayer();

            engine.cleanupRace(RACE_ID);

            assertThatThrownBy(() ->
                    engine.submitAnswer(PARTICIPANT_ID, "any-token", CORRECT_ANS))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    // =========================================================================
    // Reflection helpers — access private state for deterministic assertions
    // =========================================================================

    /** Initialises the test player and returns the first question dispatch. */
    private QuestionDispatch initPlayer() {
        return engine.initPlayer(RACE_ID, USER_ID, PARTICIPANT_ID, BASE_DIFF);
    }

    /** Retrieves the PlayerGameState for a participant via reflection. */
    private PlayerGameState getPlayerState(Long participantId) throws Exception {
        Field f = GameEngineService.class.getDeclaredField("stateMap");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        ConcurrentHashMap<Long, PlayerGameState> map =
                (ConcurrentHashMap<Long, PlayerGameState>) f.get(engine);
        return map.get(participantId);
    }

    /** Forces the Engine Stall to be expired by setting stallUntil to the past. */
    private void expireStall(Long participantId) throws Exception {
        PlayerGameState state = getPlayerState(participantId);
        Field f = PlayerGameState.class.getDeclaredField("stallUntil");
        f.setAccessible(true);
        f.set(state, Instant.EPOCH);
    }

    /** Sets decisionEventProbability to a known value for deterministic event testing. */
    private void setDecisionProbability(Long participantId, double probability) throws Exception {
        PlayerGameState state = getPlayerState(participantId);
        Field f = PlayerGameState.class.getDeclaredField("decisionEventProbability");
        f.setAccessible(true);
        f.set(state, probability);
    }

    /** Reads the current decisionEventProbability from in-memory state. */
    private double getDecisionProbability(Long participantId) throws Exception {
        PlayerGameState state = getPlayerState(participantId);
        Field f = PlayerGameState.class.getDeclaredField("decisionEventProbability");
        f.setAccessible(true);
        return (double) f.get(state);
    }

    /** Builds a RaceParticipant with a User for isTrailing() queries. */
    private RaceParticipant makeParticipant(Long userId, int position) {
        User user = new User();
        user.setId(userId);
        user.setUsername("student_" + userId);
        user.setRole(UserRole.STUDENT);

        RaceParticipant p = new RaceParticipant();
        p.setUser(user);
        p.setCurrentPosition(position);
        return p;
    }
}
