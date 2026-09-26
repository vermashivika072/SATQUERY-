import uuid


def _register_and_login(client):
    email = f"flow-{uuid.uuid4().hex[:8]}@example.com"
    username = f"flow-{uuid.uuid4().hex[:6]}"

    r = client.post("/api/v1/auth/register", json={
        "email": email, "username": username, "password": "password123"
    })
    assert r.status_code in (201, 400)

    r = client.post("/api/v1/auth/login", json={
        "email": email, "password": "password123"
    })
    assert r.status_code == 200
    assert r.json()["authenticated"] is True


def test_full_flow_copilot_chat_persistence(client):
    """End-to-end flow: session -> chat -> message -> copilot query -> contract keys."""
    _register_and_login(client)

    r = client.post("/api/v1/chats", json={
        "title": "Full Flow", "context": "Satellite / AI"
    })
    assert r.status_code == 201
    chat_id = r.json()["id"]

    r = client.post(f"/api/v1/chats/{chat_id}/messages", json={
        "role": "user", "text": "hello"
    })
    assert r.status_code == 201

    r = client.post("/api/v1/copilot/query", json={
        "session_id": "flow-session-1", "prompt": "hello"
    })
    assert r.status_code == 200
    body = r.json()

    assert body["session_id"] == "flow-session-1"
    assert isinstance(body["request_id"], str) and body["request_id"]
    assert body["request_id"] != body["session_id"]
    assert isinstance(body["text"], str) and body["text"].strip()
    assert isinstance(body["data"], dict)
    assert body["data"]["query_type"] == "general"
    assert isinstance(body["rag_sources"], list)
    assert isinstance(body["cache_hit"], bool)

    llm = body["provenance"]["llm"]
    assert isinstance(llm, dict)
    assert llm["source"] in {"LIVE", "FALLBACK", "CONFIG_ERROR"}
    assert "generated_at" in llm
    assert llm["source"] != "LIVE" or not body["text"].startswith(
        ("LLM error", "LLM is not configured")
    )

    r = client.get(f"/api/v1/chats/{chat_id}")
    assert r.status_code == 200
    messages = r.json()["messages"]
    assert len(messages) == 1
    assert messages[0]["role"] == "user"
    assert messages[0]["text"] == "hello"

    r = client.delete(f"/api/v1/chats/{chat_id}")
    assert r.status_code == 204