package com.mathu.racegame.race.sse.dto;

public enum SseEventType {
    // --- Race lifecycle (teacher + all participants) ---
    LEADERBOARD_SNAPSHOT,
    POSITION_UPDATE,
    PARTICIPANT_JOINED,
    PLAYER_KICKED,            // teacher removed a participant; payload: PlayerKickedData
    RACE_START,
    RACE_FINISH,
    HEARTBEAT,

    // --- Game engine events → teacher dashboard only ---
    ENGINE_STALL,             // a participant is stalled; payload: EngineStallData
    POWER_UP,                 // a power-up fired; payload: PowerUpData
    DECISION_EVENT_TRIGGERED, // a participant hit the fork choice; payload: DecisionEventData

    // --- Student-personal events → /my-events channel only ---
    QUESTION_DISPATCHED       // initial question on SSE connect; payload: QuestionDispatchedData
}
