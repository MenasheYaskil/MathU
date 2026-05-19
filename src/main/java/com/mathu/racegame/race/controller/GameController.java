package com.mathu.racegame.race.controller;

import com.mathu.racegame.race.controller.dto.DecisionChoiceRequest;
import com.mathu.racegame.race.controller.dto.SubmitAnswerRequest;
import com.mathu.racegame.race.engine.AnswerResult;
import com.mathu.racegame.race.engine.GameEngineService;
import com.mathu.racegame.race.engine.QuestionDispatch;
import com.mathu.racegame.race.entity.RaceParticipant;
import com.mathu.racegame.race.repository.RaceParticipantRepository;
import com.mathu.racegame.user.entity.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/races/{raceId}")
public class GameController {

    private final GameEngineService         gameEngineService;
    private final RaceParticipantRepository participantRepository;

    public GameController(GameEngineService gameEngineService,
                          RaceParticipantRepository participantRepository) {
        this.gameEngineService     = gameEngineService;
        this.participantRepository = participantRepository;
    }

    /**
     * Student submits an answer for their current question.
     *
     * The request body carries:
     *  - token  : the opaque UUID from the last QuestionDispatch (SSE or prior response)
     *  - answer : the student's raw answer text
     *
     * The response is an AnswerResult which includes the next question
     * (text + token) so the client does not need to poll for it.
     */
    @PostMapping("/answer")
    public ResponseEntity<AnswerResult> submitAnswer(
            @PathVariable Long raceId,
            @Valid @RequestBody SubmitAnswerRequest req,
            @AuthenticationPrincipal User currentUser) {

        Long participantId = resolveParticipantId(raceId, currentUser.getId());

        AnswerResult result = gameEngineService.submitAnswer(participantId, req.questionToken(), req.answer());
        return ResponseEntity.ok(result);
    }

    /**
     * Student chooses their Decision Event path (Highway or Dirt Road).
     * Must be called only when the prior AnswerResult had decisionEventPending=true.
     *
     * Returns the first question on the chosen path.
     */
    @PostMapping("/decision")
    public ResponseEntity<QuestionDispatch> chooseDecisionPath(
            @PathVariable Long raceId,
            @Valid @RequestBody DecisionChoiceRequest req,
            @AuthenticationPrincipal User currentUser) {

        Long participantId = resolveParticipantId(raceId, currentUser.getId());

        QuestionDispatch dispatch = gameEngineService.chooseDecisionPath(participantId, req.choice());
        return ResponseEntity.ok(dispatch);
    }

    /** Looks up the participant record and returns the participantId for the given user+race. */
    private Long resolveParticipantId(Long raceId, Long userId) {
        return participantRepository.findByRaceIdAndUserId(raceId, userId)
                .map(RaceParticipant::getId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "You are not a participant in race " + raceId));
    }
}
