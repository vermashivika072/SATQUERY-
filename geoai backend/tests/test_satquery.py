def test_satquery_requires_auth(client):
    r = client.get(
        "/api/v1/satquery/scenes"
        "?minx=77&miny=28&maxx=78&maxy=29"
        "&start=2020-01-01T00:00:00Z&end=2030-01-01T00:00:00Z"
    )
    assert r.status_code == 401


def test_coverage_requires_auth(client):
    r = client.get(
        "/api/v1/satquery/coverage?minx=77&miny=28&maxx=78&maxy=29"
    )
    assert r.status_code == 401