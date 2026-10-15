"""Read-only readiness probes. Failures never trigger restarts here."""
from http.client import HTTPException
import os
import subprocess
import sys
from urllib.request import Request, build_opener, ProxyHandler

HTTP = build_opener(ProxyHandler({}))


def command_ready(args, expected=None, env=None):
    try:
        result = subprocess.run(args, capture_output=True, timeout=3, env=env)
        return result.returncode == 0 and (expected is None or result.stdout.strip() == expected)
    except (OSError, subprocess.TimeoutExpired):
        return False


def postgres_ready():
    return command_ready(["pg_isready", "-q", "-h", "127.0.0.1", "-U", "postgres"])


def http_ready(url, headers=None):
    try:
        with HTTP.open(Request(url, headers=headers or {}), timeout=2) as response:
            return response.status == 200
    except (OSError, ValueError, HTTPException):
        return False


def checks():
    origin = os.environ.get("PUBLIC_URL", "http://localhost:8080")
    return {
        "postgres": postgres_ready(),
        "redis": command_ready(
            ["redis-cli", "-h", "127.0.0.1", "ping"], b"PONG",
            {**os.environ, "REDISCLI_AUTH": os.environ["REDIS_PASSWORD"]},
        ),
        "api/database/storage": http_ready("http://127.0.0.1:8080/v1/health"),
        "sync": http_ready("http://127.0.0.1:8082/probes/readiness"),
        "web": http_ready("http://127.0.0.1:8080/index.html", {"Host": origin.split("://", 1)[1]}),
    }


if __name__ == "__main__":
    status = checks()
    for service, ready in status.items():
        print(f"{service}: {'ready' if ready else 'unavailable'}")
    sys.exit(0 if all(status.values()) else 1)
