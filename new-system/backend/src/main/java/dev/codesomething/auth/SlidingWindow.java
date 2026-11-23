package dev.codesomething.auth;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/** Bounded, process-local limiter. Production runs a single API replica. */
final class SlidingWindow {
    private static final int MAX_KEYS = 10_000;
    private final Map<String, ArrayDeque<Long>> windows = new HashMap<>();
    private final long duration;
    private final int limit;
    private long nextSweep;

    SlidingWindow(int limit, Duration duration) {
        this.limit = limit;
        this.duration = duration.toNanos();
    }

    synchronized boolean allow(String key) {
        long now = System.nanoTime();
        long start = now - duration;
        if (windows.size() >= MAX_KEYS || now - nextSweep >= 0) {
            windows.values().removeIf(window -> window.getLast() - start <= 0);
            nextSweep = now + Duration.ofSeconds(30).toNanos();
        }
        var window = windows.get(key);
        if (window == null) {
            if (windows.size() >= MAX_KEYS) return false;
            window = new ArrayDeque<>();
            windows.put(key, window);
        }
        while (!window.isEmpty() && window.getFirst() - start <= 0) window.removeFirst();
        if (window.size() >= limit) return false;
        window.addLast(now);
        return true;
    }
}
