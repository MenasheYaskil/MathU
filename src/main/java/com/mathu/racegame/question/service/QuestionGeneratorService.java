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

    // Detects arithmetic expressions of the form "12 + 7 = ?" after variable substitution
    private static final Pattern ARITHMETIC_PATTERN = Pattern.compile(
            "(\\d+)\\s*([+\\-×÷*/x])\\s*(\\d+)\\s*=\\s*\\?", Pattern.CASE_INSENSITIVE);

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
        String text = template.getTemplateText();
        String raw  = replacePlaceholders(text);

        // Assign once so `resolved` is effectively final for the lambda closures below.
        // Division post-processing: round dividend up to nearest multiple of divisor.
        final String resolved = (text.contains("÷") || text.contains("/"))
                ? ensureIntegerDivision(raw)
                : raw;

        return tryComputeArithmeticAnswer(resolved)
                .map(answer -> GeneratedQuestion.of(resolved, answer))
                .orElseGet(() -> GeneratedQuestion.of(resolved));
    }

    /**
     * For expressions like "13 ÷ 4 = ?", rounds the dividend UP to the nearest
     * multiple of the divisor so the answer is always a whole number.
     * E.g.: "13 ÷ 4" → "16 ÷ 4" (answer = 4).
     * Ensures quotient ≥ 1 and divisor ≥ 2.
     */
    private String ensureIntegerDivision(String questionText) {
        Matcher m = ARITHMETIC_PATTERN.matcher(questionText);
        if (!m.find()) return questionText;

        String op = m.group(2);
        if (!op.equals("÷") && !op.equals("/")) return questionText;

        int divisor  = Math.max(2, Integer.parseInt(m.group(3)));
        int rawDividend = Integer.parseInt(m.group(1));

        // Round dividend up to the nearest multiple of divisor, quotient ≥ 1
        int quotient = Math.max(1, (rawDividend + divisor - 1) / divisor);
        int dividend = divisor * quotient;

        return dividend + " ÷ " + divisor + " = ?";
    }

    /**
     * Attempts to evaluate a simple arithmetic expression of the form "A op B = ?".
     * Returns the string result if computable; empty if the pattern is not matched
     * or the operation is undefined (e.g. division by zero).
     */
    private java.util.Optional<String> tryComputeArithmeticAnswer(String questionText) {
        Matcher m = ARITHMETIC_PATTERN.matcher(questionText);
        if (!m.find()) return java.util.Optional.empty();
        try {
            int a = Integer.parseInt(m.group(1));
            String op = m.group(2);
            int b = Integer.parseInt(m.group(3));
            int result = switch (op) {
                case "+"      -> a + b;
                case "-"      -> a - b;
                case "×", "*", "x" -> a * b;
                case "÷", "/" -> { if (b == 0) yield Integer.MIN_VALUE; else yield a / b; }
                default       -> Integer.MIN_VALUE;
            };
            if (result == Integer.MIN_VALUE) return java.util.Optional.empty();
            return java.util.Optional.of(String.valueOf(result));
        } catch (NumberFormatException e) {
            return java.util.Optional.empty();
        }
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
