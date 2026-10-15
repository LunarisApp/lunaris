"""Recover PowerSync independently; readiness is reported by healthcheck.sh."""
import json
import subprocess
import time

from readiness import http_ready, postgres_ready

INTERVAL = 30
STARTUP_GRACE = 90
FAILURE_THRESHOLD = 3
STABLE_THRESHOLD = 10
MAX_BACKOFF = 900


class SyncRecovery:
    def __init__(self, now):
        self.failures = 0
        self.stable = 0
        self.next_attempt = now + STARTUP_GRACE
        self.backoff = 60

    def tick(self, now, ready, dependencies_ready):
        if ready:
            self.failures = 0
            self.stable += 1
            if self.stable >= STABLE_THRESHOLD:
                self.backoff = 60
                self.next_attempt = now
            return False
        self.stable = 0
        if not dependencies_ready:
            self.failures = 0
            return False
        self.failures += 1
        if self.failures < FAILURE_THRESHOLD or now < self.next_attempt:
            return False
        self.failures = 0
        self.next_attempt = now + self.backoff
        self.backoff = min(self.backoff * 2, MAX_BACKOFF)
        return True


def event(message, **fields):
    print(json.dumps({"service": "aio-watchdog", "message": message, **fields}), flush=True)


def restart_sync():
    try:
        # Bound the command even when supervisor or the child is stuck.
        result = subprocess.run(
            ["supervisorctl", "-c", "/opt/aio/supervisord.conf", "restart", "powersync"],
            capture_output=True, timeout=75,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def main():
    recovery = SyncRecovery(time.monotonic())
    previous = None
    while True:
        ready = http_ready("http://127.0.0.1:8082/probes/readiness")
        dependencies_ready = postgres_ready() and http_ready("http://127.0.0.1:3000/auth/jwks")
        status = "ready" if ready else "unavailable" if dependencies_ready else "waiting for dependencies"
        if status != previous:
            event(f"sync {status}")
            previous = status
        if recovery.tick(time.monotonic(), ready, dependencies_ready):
            event("sync unavailable; restarting PowerSync only")
            if not restart_sync():
                event("PowerSync restart failed; retry scheduled")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
