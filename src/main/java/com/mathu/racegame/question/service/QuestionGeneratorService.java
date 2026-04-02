package com.mathu.racegame.question.service;

import com.mathu.racegame.question.entity.QuestionTemplate;
import com.mathu.racegame.question.entity.VariableType;
import com.mathu.racegame.question.repository.QuestionTemplateRepository;
import com.mathu.racegame.question.repository.TemplateVariableRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure content-generation service. Has NO dependency on the race domain.
 * The caller (race controller / game engine) is responsible for bridging
 * a generated question to a specific race context.
 */
@Service
@Transactional(readOnly = true)
public class QuestionGeneratorService {

    // Matches any {ALL_CAPS_TOKEN} placeholder in a template string
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([A-Z_]+)\\}");

    private final QuestionTemplateRepository templateRepository;
    private final TemplateVariableRepository variableRepository;

    public QuestionGeneratorService(QuestionTemplateRepository templateRepository,
                                    TemplateVariableRepository variableRepository) {
        this.templateRepository = templateRepository;
        this.variableRepository = variableRepository;
    }

    /**
     * Selects a random template matching (subjectArea, difficultyLevel) and
     * replaces every {PLACEHOLDER} with a random value from template_variables.
     *
     * @param subjectArea    e.g. "ARITHMETIC", "WORD_PROBLEM"
     * @param difficultyLevel 1–5
     * @return a fully resolved GeneratedQuestion
     * @throws IllegalStateException if no matching templates or variable values exist
     */
    public GeneratedQuestion generate(String subjectArea, int difficultyLevel) {
        QuestionTemplate template = templateRepository
                .findOneRandomBySubjectAndDifficulty(subjectArea, difficultyLevel)
                .orElseThrow(() -> new IllegalStateException(
                        "No templates found for subject='%s' difficulty=%d"
                                .formatted(subjectArea, difficultyLevel)));

        return resolveTemplate(template);
    }

    private GeneratedQuestion resolveTemplate(QuestionTemplate template) {
        String resolved = replacePlaceholders(template.getTemplateText());
        return GeneratedQuestion.of(resolved);
    }

    private String replacePlaceholders(String templateText) {
        Matcher matcher = PLACEHOLDER.matcher(templateText);
        StringBuilder result = new StringBuilder();

        while (matcher.find()) {
            String token = matcher.group(1);                      // e.g. "NAME", "OPERATOR"
            String replacement = resolveToken(token);
            matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(result);
        return result.toString();
    }

    private String resolveToken(String token) {
        VariableType type;
        try {
            type = VariableType.valueOf(token);
        } catch (IllegalArgumentException e) {
            // Unknown token: leave placeholder intact for forward compatibility
            return "{" + token + "}";
        }

        return variableRepository
                .findOneRandomByVariableType(type.name())
                .map(tv -> tv.getValue())
                .orElseThrow(() -> new IllegalStateException(
                        "No template variables found for type: " + type));
    }
}
