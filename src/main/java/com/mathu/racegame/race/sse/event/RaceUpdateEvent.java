package com.mathu.racegame.race.sse.event;

import com.mathu.racegame.race.sse.dto.SseEventPayload;
import org.springframework.context.ApplicationEvent;

/**
 * Spring ApplicationEvent published by GameEngineService for events that should be
 * broadcast to ALL connected teacher clients for a given race.
 *
 * Decouples the game engine from the SSE infrastructure — the engine never
 * imports SseService directly; the RaceUpdateEventListener bridges the two.
 */
public class RaceUpdateEvent extends ApplicationEvent {

    private final Long raceId;
    private final SseEventPayload payload;

    public RaceUpdateEvent(Object source, Long raceId, SseEventPayload payload) {
        super(source);
        this.raceId  = raceId;
        this.payload = payload;
    }

    public Long getRaceId()          { return raceId; }
    public SseEventPayload getPayload() { return payload; }
}
