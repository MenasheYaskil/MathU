package com.mathu.racegame.question.controller;

import com.mathu.racegame.question.service.GeneratedQuestion;
import com.mathu.racegame.question.service.QuestionGeneratorService;
import com.mathu.racegame.user.entity.User;
import com.mathu.racegame.user.entity.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("QuestionController")
class QuestionControllerTest {

    @Mock
    QuestionGeneratorService questionGeneratorService;

    @InjectMocks
    QuestionController controller;

    private User teacher;
    private User student;

    @BeforeEach
    void setUp() {
        teacher = new User();
        teacher.setRole(UserRole.TEACHER);

        student = new User();
        student.setRole(UserRole.STUDENT);
    }

    @Nested
    @DisplayName("previewQuestion — access control")
    class AccessControl {

        @Test
        @DisplayName("student gets AccessDeniedException; service is never called")
        void student_throwsAccessDenied() {
            assertThatThrownBy(() ->
                    controller.previewQuestion("ARITHMETIC", 2, student))
                    .isInstanceOf(AccessDeniedException.class);

            verifyNoInteractions(questionGeneratorService);
        }

        @Test
        @DisplayName("teacher with valid params returns 200 OK")
        void teacher_returns200() {
            when(questionGeneratorService.generate("ARITHMETIC", 2))
                    .thenReturn(GeneratedQuestion.of("5 + 3 = ?", "8"));

            ResponseEntity<QuestionController.QuestionPreviewResponse> response =
                    controller.previewQuestion("ARITHMETIC", 2, teacher);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }
    }

    @Nested
    @DisplayName("previewQuestion — response content")
    class ResponseContent {

        @Test
        @DisplayName("arithmetic question: questionText and correctAnswer are both populated")
        void arithmetic_returnsTextAndAnswer() {
            when(questionGeneratorService.generate("ARITHMETIC", 3))
                    .thenReturn(GeneratedQuestion.of("6 × 7 = ?", "42"));

            QuestionController.QuestionPreviewResponse body =
                    controller.previewQuestion("ARITHMETIC", 3, teacher).getBody();

            assertThat(body).isNotNull();
            assertThat(body.questionText()).isEqualTo("6 × 7 = ?");
            assertThat(body.correctAnswer()).isEqualTo("42");
        }

        @Test
        @DisplayName("word-problem template: correctAnswer is null when not computable")
        void wordProblem_correctAnswerIsNull() {
            when(questionGeneratorService.generate("WORD_PROBLEM", 1))
                    .thenReturn(GeneratedQuestion.of("If Alice has 3 apples and gives 1 away, how many remain?"));

            QuestionController.QuestionPreviewResponse body =
                    controller.previewQuestion("WORD_PROBLEM", 1, teacher).getBody();

            assertThat(body).isNotNull();
            assertThat(body.questionText()).contains("Alice");
            assertThat(body.correctAnswer()).isNull();
        }

        @Test
        @DisplayName("delegates to QuestionGeneratorService with exact subject and difficulty")
        void delegatesWithCorrectParams() {
            when(questionGeneratorService.generate("ARITHMETIC", 5))
                    .thenReturn(GeneratedQuestion.of("99 ÷ 9 = ?", "11"));

            controller.previewQuestion("ARITHMETIC", 5, teacher);

            verify(questionGeneratorService).generate("ARITHMETIC", 5);
        }
    }
}
