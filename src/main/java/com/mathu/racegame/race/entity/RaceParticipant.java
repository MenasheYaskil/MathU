package com.mathu.racegame.race.entity;

import com.mathu.racegame.user.entity.User;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "race_participants",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_rp_race_user",
        columnNames = {"race_id", "user_id"}
    )
)
@Getter
@Setter
@NoArgsConstructor
public class RaceParticipant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "race_id", nullable = false)
    private Race race;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Discrete track position: 0 (start) to 1000 (finish line)
    @Column(name = "current_position", nullable = false)
    private int currentPosition = 0;

    // Optimistic locking: prevents concurrent SSE ticks from overwriting each other.
    // Hibernate increments this on every UPDATE; mismatches throw OptimisticLockException.
    @Version
    @Column(nullable = false)
    private Long version;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private LocalDateTime joinedAt;

    @PrePersist
    protected void onCreate() {
        this.joinedAt = LocalDateTime.now();
        this.currentPosition = 0;
    }
}
