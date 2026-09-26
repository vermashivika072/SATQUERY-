import uuid


def _make_user(client):
    email = f"chat-{uuid.uuid4().hex[:8]}@example.com"
    username = f"chat-{uuid.uuid4().hex[:6]}"
    client.post("/api/v1/auth/register", json={
        "email": email, "username": username, "password": "password123"
    })
    client.post("/api/v1/auth/login", json={
        "email": email, "password": "password123"
    })


def test_create_list_chat(client):
    _make_user(client)

    r = client.post("/api/v1/chats", json={"title": "Test", "context": "Satellite / AI"})
    assert r.status_code == 201
    chat_id = r.json()["id"]

    r = client.get("/api/v1/chats")
    assert r.status_code == 200
    assert any(c["id"] == chat_id for c in r.json())

    r = client.delete(f"/api/v1/chats/{chat_id}")
    assert r.status_code == 204


def test_cannot_access_others_chat(client):
    _make_user(client)
    r = client.post("/api/v1/chats", json={"title": "Mine"})
    chat_id = r.json()["id"]

    client.post("/api/v1/auth/logout")
    _make_user(client)

    r = client.get(f"/api/v1/chats/{chat_id}")
    assert r.status_code == 404