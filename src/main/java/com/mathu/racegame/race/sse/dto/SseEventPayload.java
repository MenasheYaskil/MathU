package com.mathu.racegame.race.sse.dto;

/**
 * Top-level SSE envelope. Every event sent over the wire has this shape:
 *   { "type": "POSITION_UPDATE", "data": { ... } }
 *
 * The React EventSource handler switches on `type` to route events to the
 * correct reducer/handler without coupling to a single monolithic payload.
 */
public record SseEventPayload(SseEventType type, Object data) {

    public static SseEventPayload of(SseEventType type, Object data) {
        return new SseEventPayload(type, data);
    }
}
