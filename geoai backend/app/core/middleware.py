import uuid
import time
import structlog
from urllib.parse import urlsplit
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

log = structlog.get_logger()


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            path=request.url.path,
            method=request.method,
        )
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["x-request-id"] = request_id
        log.info("request", status=response.status_code, duration_ms=round(duration_ms, 2))
        return response


_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _header(scope, name: bytes) -> str | None:
    for key, value in scope.get("headers") or []:
        if key.lower() == name:
            return value.decode("latin-1")
    return None


def _origin_of(scope) -> str | None:
    origin = _header(scope, b"origin")
    if origin:
        return origin
    referer = _header(scope, b"referer")
    if referer:
        try:
            parts = urlsplit(referer)
            if parts.scheme and parts.netloc:
                return f"{parts.scheme}://{parts.netloc}"
        except ValueError:
            return None
    return None


class OriginCheckMiddleware:
    """Optional cross-site request defense for cookie-authenticated APIs.

    When enabled, state-changing requests (POST/PUT/PATCH/DELETE) must carry an
    Origin (or Referer) that is either in `allow_origins` or is same-origin with
    the Host header. Non-browser clients and curl send no Origin and are allowed
    through, so server-to-server/API clients are unaffected. GET/HEAD/OPTIONS
    (including CORS preflight) are exempt.

    Opt-in via ORIGIN_CHECK_ENABLED=true; disabled by default for development.
    """

    def __init__(self, app, allow_origins: list[str] | None = None, enabled: bool = True):
        self.app = app
        self.allow_origins = {str(o).rstrip("/") for o in (allow_origins or [])}
        self.enabled = enabled

    async def __call__(self, scope, receive, send):
        if self.enabled and scope.get("type") == "http":
            method = str(scope.get("method", "GET"))
            if method not in _SAFE_METHODS:
                origin = _origin_of(scope)
                if origin and not self._allowed(origin.rstrip("/"), scope):
                    response = Response(
                        "Cross-origin request blocked", status_code=403
                    )
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)

    def _allowed(self, origin: str, scope) -> bool:
        if origin in self.allow_origins:
            return True
        host = _header(scope, b"host")
        scheme = str(scope.get("scheme", "http"))
        if host and origin == f"{scheme}://{host.rstrip('/')}":
            return True
        return False