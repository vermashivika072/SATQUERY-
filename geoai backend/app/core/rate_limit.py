import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status


class FixedWindowLimiter:
    """In-memory fixed-window rate limiter keyed by an arbitrary string."""

    def __init__(self, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            kept = [t for t in self._hits[key] if t > cutoff]
            kept.append(now)
            self._hits[key] = kept
            if len(kept) > self.max_attempts:
                retry_after = max(1, int(round(self.window_seconds - (now - kept[0]))))
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Too many login attempts. Try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


login_limiter = FixedWindowLimiter(max_attempts=5, window_seconds=60)


def check_login_rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    login_limiter.check(ip)