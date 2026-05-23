package com.mathu.racegame.race.repository;

import com.mathu.racegame.race.entity.Race;
import com.mathu.racegame.race.entity.RaceStatus;
import com.mathu.racegame.user.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RaceRepository extends JpaRepository<Race, Long> {

    Optional<Race> findByEntryCode(String entryCode);

    List<Race> findByCreatedBy(User teacher);

    List<Race> findByStatus(RaceStatus status);

    // Used by EntryCodeGenerator to guarantee uniqueness before saving
    boolean existsByEntryCode(String entryCode);

    // JOIN FETCH on createdBy so callers can access race.getCreatedBy() outside a transaction
    // (open-in-view is disabled — lazy loads outside a tx throw LazyInitializationException)
    @Query("SELECT r FROM Race r JOIN FETCH r.createdBy WHERE r.id = :id")
    Optional<Race> findByIdWithCreator(@Param("id") Long id);

    // Same as above, also LEFT JOIN FETCHes winner (null for non-FINISHED races).
    // Used where winner details are needed (e.g. getRace REST endpoint).
    @Query("SELECT r FROM Race r JOIN FETCH r.createdBy LEFT JOIN FETCH r.winner WHERE r.id = :id")
    Optional<Race> findByIdWithCreatorAndWinner(@Param("id") Long id);
}
