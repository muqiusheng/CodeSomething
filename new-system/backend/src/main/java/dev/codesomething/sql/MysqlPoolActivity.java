package dev.codesomething.sql;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.function.LongSupplier;

final class MysqlPoolActivity {
    @FunctionalInterface
    interface Lease extends AutoCloseable {
        @Override void close();
    }

    private static final class Entry {
        private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock(true);
        private volatile long lastActivity;
        private Entry(long lastActivity) { this.lastActivity = lastActivity; }
    }

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();
    private final LongSupplier clock;
    private final long idleMillis;

    MysqlPoolActivity(LongSupplier clock, Duration idle) {
        this.clock = clock;
        this.idleMillis = idle.toMillis();
    }

    private Entry entry(String name) {
        return entries.computeIfAbsent(name, key -> new Entry(clock.getAsLong()));
    }

    Lease hold(String name) {
        var entry = entry(name);
        var lock = entry.lock.readLock();
        lock.lock();
        entry.lastActivity = clock.getAsLong();
        return () -> {
            entry.lastActivity = clock.getAsLong();
            lock.unlock();
        };
    }

    void touch(String name) {
        var entry = entry(name);
        var lock = entry.lock.readLock();
        if (!lock.tryLock()) return;
        try { entry.lastActivity = clock.getAsLong(); }
        finally { lock.unlock(); }
    }

    long lastActivity(String name) { return entry(name).lastActivity; }

    boolean reclaim(String name, Runnable action) {
        var entry = entry(name);
        var lock = entry.lock.writeLock();
        if (clock.getAsLong() - entry.lastActivity < idleMillis || !lock.tryLock()) return false;
        try {
            if (clock.getAsLong() - entry.lastActivity < idleMillis) return false;
            try { action.run(); }
            finally { entry.lastActivity = clock.getAsLong(); }
            return true;
        } finally { lock.unlock(); }
    }
}
