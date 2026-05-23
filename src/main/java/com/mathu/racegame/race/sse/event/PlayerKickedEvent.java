package com.mathu.racegame.race.sse.event;

import org.springframework.context.ApplicationEvent;

/**
 * Published by RaceService (after transaction commit) when a teacher removes a participant.
 * GameEngineService listens to clean up the player's in-memory game state.
 */
public class PlayerKickedEvent extends ApplicationEvent {

    private final Long raceId;
    private final Long participantId;

    public PlayerKickedEvent(Object source, Long raceId, Long participantId) {
        super(source);
        this.raceId        = raceId;
        this.participantId = participantId;
    }

    public Long getRaceId()        { return raceId; }
    public Long getParticipantId() { return participantId; }
}
