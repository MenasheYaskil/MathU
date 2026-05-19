package com.mathu.racegame.race.sse;

import com.mathu.racegame.race.sse.event.RaceUpdateEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Bridges the game engine's ApplicationEvents to the SSE broadcast layer.
 *
 * The engine publishes RaceUpdateEvent via ApplicationEventPublisher and has
 * zero knowledge of SseService — all SSE coupling is contained here.
 *
 * Spring calls @EventListener synchronously in the publisher's thread by default.
 * Events fired from GameEngineService are not inside a DB transaction, so no
 * afterCommit() coordination is needed here.
 */
@Component
public class RaceUpdateEventListener {

    private final SseService sseService;

    public RaceUpdateEventListener(SseService sseService) {
        this.sseService = sseService;
    }

    @EventListener
    public void onRaceUpdate(RaceUpdateEvent event) {
        sseService.broadcastToRace(event.getRaceId(), event.getPayload());
    }
}
