package com.mathu.racegame.question.repository;

import com.mathu.racegame.question.entity.QuestionTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface QuestionTemplateRepository extends JpaRepository<QuestionTemplate, Long> {

    List<QuestionTemplate> findBySubjectArea(String subjectArea);

    List<QuestionTemplate> findBySubjectAreaAndDifficultyLevel(String subjectArea, int difficultyLevel);

    // Native query: MySQL RAND() for O(1) random selection without loading all rows
    @Query(value = "SELECT * FROM question_templates " +
                   "WHERE subject_area = :area AND difficulty_level = :level " +
                   "ORDER BY RAND() LIMIT 1",
           nativeQuery = true)
    Optional<QuestionTemplate> findOneRandomBySubjectAndDifficulty(@Param("area") String subjectArea,
                                                                    @Param("level") int difficultyLevel);
}
