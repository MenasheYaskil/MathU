package com.mathu.racegame.race.engine;

/**
 * Represents the player's current racing mode.
 *
 * NORMAL    — baseline racing, 50 steps per correct answer.
 * HIGHWAY   — high-risk/high-reward fork: exactly 1 harder question, 150 steps if correct.
 * DIRT_ROAD — safe/slow fork: exactly 3 easier questions, 17 steps each if correct.
 */
public enum GameMode {
    NORMAL,
    HIGHWAY,
    DIRT_ROAD
}
