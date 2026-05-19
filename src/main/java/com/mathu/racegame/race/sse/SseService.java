package com.mathu.racegame.race.sse;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mathu.racegame.race.sse.dto.HeartbeatData;
import com.mathu.racegame.race.sse.dto.SseEventPayload;
import com.mathu.racegame.race.sse.dto.SseEventType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class SseService {

    private static final Logger log = LoggerFactory.getLogger(SseService.class);

    // Thread-safe registry: raceId → active emitters for that race room (teacher channel)
    private final ConcurrentHashMap<Long, CopyOnWriteArrayList<SseEmitter>> raceEmitters =
            new ConcurrentHashMap<>();

    // Per-participant emitter registry for student-personal channels (/my-events).
    // Each student has at most one active emitter at a time — reconnects replace the old entry.
    private final ConcurrentHashMap<Long, SseEmitter> participantEmitters =
            new ConcurrentHashMap<>();

    private final ObjectMapper objectMapper;

    @Value("${app.sse.timeout-ms:900000}")
    private long timeoutMs;

    public SseService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * Subscribes a new client to a race room and sends the initial snapshot.
     *
     * Disconnect callbacks (onCompletion / onTimeout / onError) are registered
     * before the emitter is returned so there is no window where a dead emitter
     * can linger in the registry.
     *
     * Spring's ResponseBodyEmitter buffers sends made before the HTTP writer is
     * ready, so calling send() here is safe — it will be flushed once the
     * response is committed.
     */
    public SseEmitter subscribe(Long raceId, SseEventPayload initialSnapshot) {
        SseEmitter emitter = new SseEmitter(timeoutMs);

        raceEmitters.computeIfAbsent(raceId, id -> new CopyOnWriteArrayList<>()).add(emitter);

        Runnable cleanup = () -> removeEmitter(raceId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(t -> {
            log.debug("SSE emitter error for race {}: {}", raceId, t.getMessage());
            cleanup.run();
        });

        sendToSingleEmitter(emitter, initialSnapshot, raceId);
        return emitter;
    }

    /**
     * Broadcasts a payload to every connected client in a race room.
     *
     * Pre-serializes the JSON once, then iterates the CopyOnWriteArrayList
     * (snapshot iteration — thread-safe, no ConcurrentModificationException).
     * Dead emitters discovered during iteration are collected and pruned
     * after the loop to avoid mutating the list mid-iteration.
     *
     * Must be called AFTER the triggering transaction commits — use
     * TransactionSynchronizationManager.registerSynchronization() in callers.
     */
    public void broadcastToRace(Long raceId, SseEventPayload payload) {
        CopyOnWriteArrayList<SseEmitter> emitters = raceEmitters.get(raceId);
        if (emitters == null || emitters.isEmpty()) {
            return;
        }

        String json = serialize(payload);
        if (json == null) return;

        String eventName = payload.type().name();
        if (eventName == null) {
            throw new IllegalStateException("Event type name cannot be null");
        }

        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name(eventName)
                        .data(json, MediaType.TEXT_PLAIN));
            } catch (IOException e) {
                // Broken pipe / client disconnect — mark for removal
                dead.add(emitter);
            }
        }
        // Prune dead connections discovered during this broadcast
        dead.forEach(d -> removeEmitter(raceId, d));
    }

    /**
     * Sends a lightweight heartbeat to all active race rooms every 30 seconds
     * (configurable). Prevents proxies and school firewalls from closing
     * idle SSE connections before a race event occurs.
     */
    @Scheduled(fixedDelayString = "${app.sse.heartbeat-interval-ms:30000}")
    public void sendHeartbeats() {
        if (raceEmitters.isEmpty()) return;

        SseEventPayload heartbeat = SseEventPayload.of(
                SseEventType.HEARTBEAT,
                new HeartbeatData(System.currentTimeMillis()));

        raceEmitters.keySet().forEach(raceId -> broadcastToRace(raceId, heartbeat));
    }

    // =========================================================================
    // Student-personal channel (/my-events)
    // =========================================================================

    /**
     * Subscribes a student to their personal event channel.
     * At most one active emitter per participant — a reconnect replaces the old entry.
     * The initial payload (QUESTION_DISPATCHED) is sent immediately on subscribe.
     */
    public SseEmitter subscribeParticipant(Long participantId, SseEventPayload initialPayload) {
        SseEmitter emitter = new SseEmitter(timeoutMs);

        // Replace any stale emitter from a prior connection
        SseEmitter previous = participantEmitters.put(participantId, emitter);
        if (previous != null) {
            try { previous.complete(); } catch (Exception ignored) {}
        }

        Runnable cleanup = () -> participantEmitters.remove(participantId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(t -> {
            log.debug("Student emitter error for participant {}: {}", participantId, t.getMessage());
            cleanup.run();
        });

        sendToSingleParticipantEmitter(emitter, initialPayload, participantId);
        return emitter;
    }

    /**
     * Sends a payload to a single student's personal channel.
     * Silently drops the event if the student has no active SSE connection.
     */
    public void sendToParticipant(Long participantId, SseEventPayload payload) {
        SseEmitter emitter = participantEmitters.get(participantId);
        if (emitter == null) return;
        sendToSingleParticipantEmitter(emitter, payload, participantId);
    }

    private void sendToSingleParticipantEmitter(SseEmitter emitter, SseEventPayload payload,
                                                Long participantId) {
        String json = serialize(payload);
        if (json == null) return;

        String eventName = payload.type().name();
        if (eventName == null) {
            throw new IllegalStateException("Event type name cannot be null");
        }

        try {
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(json, MediaType.TEXT_PLAIN));
        } catch (IOException e) {
            log.debug("Failed send to participant {} emitter", participantId);
            participantEmitters.remove(participantId, emitter);
        }
    }

    public int activeConnectionCount(Long raceId) {
        CopyOnWriteArrayList<SseEmitter> list = raceEmitters.get(raceId);
        return list == null ? 0 : list.size();
    }

    private void sendToSingleEmitter(SseEmitter emitter, SseEventPayload payload, Long raceId) {
        String json = serialize(payload);
        if (json == null) return;

        String eventName = payload.type().name();
        if (eventName == null) {
            throw new IllegalStateException("Event type name cannot be null");
        }

        try {
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(json, MediaType.TEXT_PLAIN));
        } catch (IOException e) {
            log.debug("Failed initial send for race {} emitter — likely connected too fast", raceId);
            removeEmitter(raceId, emitter);
        }
    }

    private void removeEmitter(Long raceId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> list = raceEmitters.get(raceId);
        if (list == null) return;
        list.remove(emitter);
        // Remove the map entry only if it is still the same empty list we just drained.
        // ConcurrentHashMap.remove(key, value) is atomic — prevents a race where a new
        // subscriber adds themselves between our isEmpty() check and the remove().
        if (list.isEmpty()) {
            raceEmitters.remove(raceId, list);
        }
    }

    private String serialize(SseEventPayload payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize SSE payload of type {}", payload.type(), e);
            return null;
        }
    }
}
