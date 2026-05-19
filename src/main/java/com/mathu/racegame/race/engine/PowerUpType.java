package com.mathu.racegame.race.engine;

/**
 * Luck-based power-up types applied as random events after a correct answer.
 *
 * TURBO     — bonus +50 steps added to the player's distance gain this answer.
 * FLAT_TIRE — Engine Stall (3–4 s cooldown) applied even though the answer was correct.
 *
 * Trailing players (leader ≥ 200 steps ahead) receive a 15% power-up chance
 * (vs. the normal 5%) and an 80/20 Turbo-to-FlatTire split (vs. 50/50).
 */
public enum PowerUpType {
    TURBO,
    FLAT_TIRE
}
