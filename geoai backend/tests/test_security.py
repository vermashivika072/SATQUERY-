from app.core.middleware import OriginCheckMiddleware
from app.core.config import settings
from app.main import create_app


def _app_with_origin_check(monkeypatch):
    monkeypatch.setattr(settings, "origin_check_enabled", True)
    monkeypatch.setattr(settings, "cors_origins", ["http://localhost:5173"])
    return create_app()


def test_origin_check_rejects_cross_origin_state_change(monkeypatch):
    from fastapi.testclient import TestClient
    app = _app_with_origin_check(monkeypatch)
    client = TestClient(app)
    r = client.post("/api/v1/health/ready", headers={"Origin": "http://evil.example"})
    assert r.status_code == 403
    # even with auth-bearing cookies, a foreign origin is blocked
    r2 = client.post("/api/v1/auth/logout", headers={
        "Origin": "http://evil.example",
        "Cookie": "access_token=dummy; refresh_token=dummy",
    })
    assert r2.status_code == 403


def test_origin_check_allows_configured_origin(monkeypatch):
    from fastapi.testclient import TestClient
    app = _app_with_origin_check(monkeypatch)
    client = TestClient(app)
    # route exists (405 not 403) proves the origin passed the check
    r = client.post("/api/v1/health/ready", headers={"Origin": "http://localhost:5173"})
    assert r.status_code != 403 and r.status_code != 503


def test_origin_check_allows_same_origin_via_host(monkeypatch):
    from fastapi.testclient import TestClient
    app = _app_with_origin_check(monkeypatch)
    client = TestClient(app)
    r = client.post("/api/v1/health/ready", headers={"Origin": "http://testserver"})
    assert r.status_code != 403


def test_origin_check_allows_originless_clients(monkeypatch):
    from fastapi.testclient import TestClient
    app = _app_with_origin_check(monkeypatch)
    client = TestClient(app)
    r = client.post("/api/v1/health/ready")
    assert r.status_code != 403


def test_origin_check_bypasses_safe_methods(monkeypatch):
    from fastapi.testclient import TestClient
    app = _app_with_origin_check(monkeypatch)
    client = TestClient(app)
    r = client.get("/api/v1/health/ready", headers={"Origin": "http://evil.example"})
    assert r.status_code == 200


def test_origin_check_disabled_by_default():
    from fastapi.testclient import TestClient
    assert settings.origin_check_enabled is False
    client = TestClient(create_app())
    r = client.post("/api/v1/health/ready", headers={"Origin": "http://evil.example"})
    assert r.status_code != 403


def test_middleware_referer_fallback():
    captured = {}

    async def stub_app(scope, receive, send):
        captured["called"] = True

    middleware = OriginCheckMiddleware(
        stub_app, allow_origins=["http://localhost:5173"], enabled=True
    )

    async def send(message):
        pass

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def run(method, headers):
        captured.clear()
        scope = {
            "type": "http",
            "method": method,
            "scheme": "http",
            "headers": [(k.encode(), v.encode()) for k, v in headers],
        }
        await middleware(scope, receive, send)
        return captured.get("called", False)

    import asyncio

    assert asyncio.get_event_loop().run_until_complete(
        run("POST", [("host", "api.example"), ("referer", "http://evil.example/page")])
    ) is False
    assert asyncio.get_event_loop().run_until_complete(
        run("POST", [("host", "api.example"), ("referer", "http://localhost:5173/a")])
    ) is True
    # wrong referer scheme vs host
    assert asyncio.get_event_loop().run_until_complete(
        run("POST", [("host", "api.example"), ("referer", "https://api.example/x")])
    ) is False
    # no origin/referer at all -> non-browser, allowed
    assert asyncio.get_event_loop().run_until_complete(run("DELETE", [("host", "api.example")])) is True