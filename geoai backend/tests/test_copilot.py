def test_copilot_requires_auth(client):
    r = client.post("/api/v1/copilot/query", json={
        "session_id": "s1", "prompt": "hello"
    })
    assert r.status_code == 401