package com.mathu.racegame.race.service;

import com.mathu.racegame.race.repository.RaceRepository;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;

@Component
public class EntryCodeGenerator {

    // Excludes visually ambiguous characters: 0/O and 1/I
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 6;
    private static final int MAX_ATTEMPTS = 10;

    private final SecureRandom secureRandom = new SecureRandom();
    private final RaceRepository raceRepository;

    public EntryCodeGenerator(RaceRepository raceRepository) {
        this.raceRepository = raceRepository;
    }

    /**
     * Generates a cryptographically random 6-character alphanumeric code
     * that is guaranteed to be unique within the races table.
     *
     * @throws IllegalStateException if a unique code cannot be found within MAX_ATTEMPTS
     *                               (statistically negligible at realistic race counts)
     */
    public String generateUnique() {
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            String candidate = generateCandidate();
            if (!raceRepository.existsByEntryCode(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException(
                "Could not generate a unique entry code after %d attempts".formatted(MAX_ATTEMPTS));
    }

    private String generateCandidate() {
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(ALPHABET.charAt(secureRandom.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }
}
