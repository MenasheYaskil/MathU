package com.mathu.racegame.race.repository;

import com.mathu.racegame.race.entity.RaceParticipant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RaceParticipantRepository extends JpaRepository<RaceParticipant, Long> {

    // Primary SSE broadcast query — backed by idx_rp_race_position composite index
    List<RaceParticipant> findByRaceIdOrderByCurrentPositionDesc(Long raceId);

    Optional<RaceParticipant> findByRaceIdAndUserId(Long raceId, Long userId);

    boolean existsByRaceIdAndUserId(Long raceId, Long userId);

    long countByRaceId(Long raceId);

    // JOIN FETCH on user: loads all participants + their users in one query for leaderboard snapshots.
    // Prevents N+1 selects when SseController maps participants → ParticipantSnapshot DTOs.
    @Query("SELECT rp FROM RaceParticipant rp JOIN FETCH rp.user " +
           "WHERE rp.race.id = :raceId ORDER BY rp.currentPosition DESC")
    List<RaceParticipant> findByRaceIdWithUsersOrderByPositionDesc(@Param("raceId") Long raceId);

    // Targeted position update that bypasses loading the full entity.
    // Includes the version check to surface optimistic locking conflicts early.
    // Returns 1 on success, 0 if version mismatch (caller must handle retry/conflict).
    @Modifying
    @Query("UPDATE RaceParticipant rp " +
           "SET rp.currentPosition = :position, rp.version = rp.version + 1 " +
           "WHERE rp.id = :id AND rp.version = :version")
    int updatePositionWithVersion(@Param("id") Long id,
                                  @Param("position") int position,
                                  @Param("version") Long version);
}
