package com.mathu.racegame.race.sse.event;

import org.springframework.context.ApplicationEvent;

/**
 * Published by RaceService (after transaction commit) when a race reaches FINISHED status.
 * GameEngineService listens for this event to clean up in-memory player state.
 */
public class RaceFinishedEvent extends ApplicationEvent {

    private final Long raceId;

    public RaceFinishedEvent(Object source, Long raceId) {
        super(source);
        this.raceId = raceId;
    }

    public Long getRaceId() { return raceId; }
}
