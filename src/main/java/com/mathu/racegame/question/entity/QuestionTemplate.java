package com.mathu.racegame.question.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "question_templates")
@Getter
@Setter
@NoArgsConstructor
public class QuestionTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Template text with {PLACEHOLDER} tokens. Examples:
    //   "{NAME} {ACTION} {AMOUNT} {OBJECT}."
    //   "{NUMBER} {OPERATOR} {NUMBER} = ?"
    @Column(name = "template_text", nullable = false, length = 500)
    private String templateText;

    // Logical grouping for question selection. Examples: "ARITHMETIC", "WORD_PROBLEM"
    @Column(name = "subject_area", nullable = false, length = 50)
    private String subjectArea;

    // 1 (easiest) to 5 (hardest) — enforced by DB CHECK constraint
    @Column(name = "difficulty_level", nullable = false)
    private int difficultyLevel = 1;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
