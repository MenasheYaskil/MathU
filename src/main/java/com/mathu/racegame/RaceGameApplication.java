package com.mathu.racegame;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RaceGameApplication {

    public static void main(String[] args) {
        SpringApplication.run(RaceGameApplication.class, args);
    }
}
