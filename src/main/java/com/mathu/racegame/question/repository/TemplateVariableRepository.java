package com.mathu.racegame.question.repository;

import com.mathu.racegame.question.entity.TemplateVariable;
import com.mathu.racegame.question.entity.VariableType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TemplateVariableRepository extends JpaRepository<TemplateVariable, Long> {

    List<TemplateVariable> findByVariableType(VariableType variableType);

    // Native query: random selection from a specific variable type bucket.
    // Backed by idx_tv_variable_type. Called once per placeholder during generation.
    @Query(value = "SELECT * FROM template_variables " +
                   "WHERE variable_type = :type " +
                   "ORDER BY RAND() LIMIT 1",
           nativeQuery = true)
    Optional<TemplateVariable> findOneRandomByVariableType(@Param("type") String type);
}
