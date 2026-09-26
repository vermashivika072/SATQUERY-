def test_weather_current_requires_auth(client):
    r = client.get("/api/v1/weather/current?lat=28.6&lon=77.2")
    assert r.status_code == 401


def test_weather_health_requires_auth(client):
    r = client.get("/api/v1/weather/health")
    assert r.status_code == 401