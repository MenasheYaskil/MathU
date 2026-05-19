package com.mathu.racegame.question.controller;

import com.mathu.racegame.question.service.GeneratedQuestion;
import com.mathu.racegame.question.service.QuestionGeneratorService;
import com.mathu.racegame.user.entity.User;
import com.mathu.racegame.user.entity.UserRole;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

/**
 * REST facade for QuestionGeneratorService — teacher-facing preview endpoint.
 *
 * Intentionally separate from the race domain: question generation is a pure content
 * concern, and the correct answer IS returned here (admin preview, not student flow).
 */
@RestController
@RequestMapping("/api/questions")
@Validated
public class QuestionController {

    private final QuestionGeneratorService questionGeneratorService;

    public QuestionController(QuestionGeneratorService questionGeneratorService) {
        this.questionGeneratorService = questionGeneratorService;
    }

    /**
     * Generates a sample question for the given subject area and difficulty level.
     * Intended for teachers to preview question content before starting a race.
     *
     * Unlike the student-facing game flow, this endpoint returns the correct answer
     * so teachers can validate the generated content.
     *
     * @param subjectArea     e.g. "ARITHMETIC", "WORD_PROBLEM"
     * @param difficultyLevel 1–5 (validated by Bean Validation)
     * @param currentUser     must be a TEACHER; enforced server-side
     */
    @GetMapping("/preview")
    public ResponseEntity<QuestionPreviewResponse> previewQuestion(
            @RequestParam String subjectArea,
            @RequestParam @Min(1) @Max(5) int difficultyLevel,
            @AuthenticationPrincipal User currentUser) {

        if (currentUser.getRole() != UserRole.TEACHER) {
            throw new AccessDeniedException("Only teachers can preview questions");
        }

        GeneratedQuestion q = questionGeneratorService.generate(subjectArea, difficultyLevel);
        return ResponseEntity.ok(new QuestionPreviewResponse(
                q.questionText(),
                q.correctAnswer().orElse(null)
        ));
    }

    /**
     * Response DTO — correctAnswer is null for word-problem templates whose answer
     * cannot be computed server-side.
     */
    public record QuestionPreviewResponse(String questionText, String correctAnswer) {}
}
