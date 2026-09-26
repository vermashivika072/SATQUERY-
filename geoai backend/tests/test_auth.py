import uuid


def _random_email():
    return f"test-{uuid.uuid4().hex[:8]}@example.com"


def test_register_login_me(client):
    email = _random_email()
    username = f"user-{uuid.uuid4().hex[:6]}"

    r = client.post("/api/v1/auth/register", json={
        "email": email, "username": username, "password": "password123"
    })
    assert r.status_code in (201, 400)

    r = client.post("/api/v1/auth/login", json={
        "email": email, "password": "password123"
    })
    assert r.status_code == 200
    assert r.json()["authenticated"] is True

    r = client.get("/api/v1/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == email


def test_login_wrong_password(client):
    r = client.post("/api/v1/auth/login", json={
        "email": "nobody@example.com", "password": "wrong"
    })
    assert r.status_code == 401


def test_me_unauthenticated(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_refresh_rotates_cookies(client):
    email = _random_email()
    client.post("/api/v1/auth/register", json={
        "email": email, "username": f"user-{uuid.uuid4().hex[:6]}", "password": "password123"
    })

    r = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 200
    assert "access_token" in r.cookies
    assert "refresh_token" in r.cookies

    r = client.post("/api/v1/auth/refresh")
    assert r.status_code == 200
    assert r.json()["refreshed"] is True

    r = client.get("/api/v1/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == email


def test_refresh_rejects_access_token_used_as_refresh(client):
    email = _random_email()
    client.post("/api/v1/auth/register", json={
        "email": email, "username": f"user-{uuid.uuid4().hex[:6]}", "password": "password123"
    })

    r = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    access_cookie = r.cookies["access_token"]
    client.cookies.delete("access_token")
    client.cookies.delete("refresh_token")

    r = client.post("/api/v1/auth/refresh", cookies={"refresh_token": access_cookie})
    assert r.status_code == 401


def test_logout_all_revokes_session(client):
    email = _random_email()
    client.post("/api/v1/auth/register", json={
        "email": email, "username": f"user-{uuid.uuid4().hex[:6]}", "password": "password123"
    })

    r = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    refresh_cookie = r.cookies["refresh_token"]

    r = client.post("/api/v1/auth/logout-all")
    assert r.status_code == 204

    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401

    r = client.post("/api/v1/auth/refresh", cookies={"refresh_token": refresh_cookie})
    assert r.status_code == 401


def test_login_rate_limited_after_5_attempts(client):
    for _ in range(5):
        r = client.post("/api/v1/auth/login", json={
            "email": "burst@example.com", "password": "wrong"
        })
        assert r.status_code == 401

    r = client.post("/api/v1/auth/login", json={
        "email": "burst@example.com", "password": "wrong"
    })
    assert r.status_code == 429
    assert "Retry-After" in r.headers