import uuid


def _auth(client):
    email = f"prov-{uuid.uuid4().hex[:8]}@example.com"
    username = f"prov-{uuid.uuid4().hex[:6]}"
    client.post("/api/v1/auth/register", json={
        "email": email, "username": username, "password": "password123"
    })
    r = client.post("/api/v1/auth/login", json={
        "email": email, "password": "password123"
    })
    assert r.status_code == 200


def _assert_provenance_shape(provenance):
    assert isinstance(provenance, dict)
    assert provenance.get("source")
    assert isinstance(provenance.get("live"), bool)
    assert "generated_at" in provenance


def test_copilot_query_provenance(client):
    _auth(client)
    r = client.post("/api/v1/copilot/query", json={
        "session_id": "prov-session", "prompt": "hello"
    })
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["cache_hit"], bool)
    assert isinstance(body["rag_sources"], list)
    prov = body["provenance"]
    assert isinstance(prov, dict) and prov
    assert "llm" in prov
    for value in prov.values():
        _assert_provenance_shape(value)


def test_geoai_pipeline_provenance(client):
    _auth(client)
    r = client.post("/api/v1/copilot/query", json={
        "session_id": "prov-geoai", "prompt": "flood risk analysis"
    })
    assert r.status_code == 200
    body = r.json()
    assert body["data"]["query_type"] == "geoai"
    assert isinstance(body["rag_sources"], list)
    assert isinstance(body["cache_hit"], bool)
    for key in ("parcels", "weather", "flood_risk_heuristic", "vision", "llm"):
        _assert_provenance_shape(body["provenance"][key])


def test_geospatial_agent_provenance(client):
    _auth(client)
    r = client.post("/api/v1/geospatial-agent", json={"prompt": "hello"})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["cache_hit"], bool)
    prov = body["provenance"]
    assert isinstance(prov, dict) and prov
    assert "llm" in prov


def test_satquery_scenes_provenance(client):
    _auth(client)
    r = client.get("/api/v1/satquery/scenes", params={
        "minx": 70, "miny": 20, "maxx": 90, "maxy": 30,
        "start": "2000-01-01T00:00:00Z", "end": "2030-01-01T00:00:00Z",
    })
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["scenes"], list)
    _assert_provenance_shape(body["provenance"])


def test_satquery_coverage_provenance(client):
    _auth(client)
    r = client.get("/api/v1/satquery/coverage", params={
        "minx": 70, "miny": 20, "maxx": 90, "maxy": 30,
    })
    assert r.status_code == 200
    _assert_provenance_shape(r.json()["provenance"])


def test_weather_current_provenance(client):
    _auth(client)
    r = client.get("/api/v1/weather/current",
                   params={"lat": 28.6139, "lon": 77.2090})
    if r.status_code != 200:
        return
    _assert_provenance_shape(r.json()["provenance"])