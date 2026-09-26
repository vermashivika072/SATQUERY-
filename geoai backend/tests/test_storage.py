import io
import uuid

import numpy as np
import rasterio
from rasterio.transform import from_origin


def _random_email():
    return f"store-{uuid.uuid4().hex[:8]}@example.com"


def _register_and_login(client):
    email = _random_email()
    client.post("/api/v1/auth/register", json={
        "email": email, "username": f"user-{uuid.uuid4().hex[:6]}", "password": "password123"
    })
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 200


def _real_tiff_bytes():
    """Small real GeoTIFF (uint16, 3 bands) so the async job succeeds."""
    h = w = 16
    red = np.full((h, w), 40, dtype=np.uint16)
    nir = np.full((h, w), 200, dtype=np.uint16)
    green = np.full((h, w), 60, dtype=np.uint16)
    buffer = io.BytesIO()
    with rasterio.open(
        buffer,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=3,
        dtype="uint16",
        crs="EPSG:4326",
        transform=from_origin(77.0, 23.5, 0.01, 0.01),
    ) as dst:
        dst.write(red, 1)
        dst.write(nir, 2)
        dst.write(green, 3)
        for idx, ident in ((1, "B4"), (2, "B8"), (3, "B3")):
            dst.set_band_description(idx, ident)
    buffer.seek(0)
    return buffer.getvalue()


def _poll_job(client, job_id, timeout=20.0):
    import time

    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = client.get(f"/api/v1/jobs/{job_id}")
        assert r.status_code == 200
        last = r.json()
        if last["status"] in {"succeeded", "failed"}:
            return last
        time.sleep(0.25)
    raise AssertionError(f"job {job_id} did not finish, last status {last['status']}")


def test_upload_persists_list_download_delete(client):
    _register_and_login(client)
    raster = _real_tiff_bytes()

    r = client.post("/api/v1/assets/upload", files={"file": ("demo.tif", raster, "image/tiff")})
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "processing"
    assert data["job_id"]
    asset_id = data["asset_id"]

    job = _poll_job(client, data["job_id"])
    assert job["status"] == "succeeded"
    assert job["progress"] == 100
    assert job["result"]["cog_url"].startswith("/static/cogs/")
    assert job["result"]["vision"]["observation_status"] == "REAL"

    r = client.get("/api/v1/assets")
    assert r.status_code == 200
    listing = r.json()
    assert any(a["asset_id"] == asset_id for a in listing)

    r = client.get(f"/api/v1/assets/{asset_id}")
    assert r.status_code == 200
    detail = r.json()
    assert detail["filename"] == "demo.tif"
    assert detail["size_bytes"] == len(raster)
    assert detail["download_url"] == f"/api/v1/assets/{asset_id}/download"

    r = client.get(detail["download_url"])
    assert r.status_code == 200
    assert r.content == raster
    assert r.headers["content-type"].startswith("image/tiff")

    r = client.get("/api/v1/assets/file?key=uploads/nope/nope.tif")
    assert r.status_code == 404

    r = client.delete(f"/api/v1/assets/{asset_id}")
    assert r.status_code == 204

    r = client.get(f"/api/v1/assets/{asset_id}")
    assert r.status_code == 404


def test_asset_requires_ownership(client):
    _register_and_login(client)
    r = client.post("/api/v1/assets/upload", files={"file": ("demo.tif", b"x", "image/tiff")})
    asset_id = r.json()["asset_id"]

    client.post("/api/v1/auth/logout", headers={})

    email = _random_email()
    client.post("/api/v1/auth/register", json={
        "email": email, "username": f"user-{uuid.uuid4().hex[:6]}", "password": "password123"
    })
    client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})

    r = client.get(f"/api/v1/assets/{asset_id}")
    assert r.status_code == 404
    r = client.get(f"/api/v1/assets/{asset_id}/download")
    assert r.status_code == 404
    r = client.delete(f"/api/v1/assets/{asset_id}")
    assert r.status_code == 404


def test_upload_rejects_unsupported_extension(client):
    _register_and_login(client)
    r = client.post("/api/v1/assets/upload", files={"file": ("notes.exe", b"x", "application/octet-stream")})
    assert r.status_code == 400


def test_storage_unavailable_503_in_production(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "environment", "production")
    _register_and_login(client)
    r = client.post("/api/v1/assets/upload", files={"file": ("demo.tif", b"x", "image/tiff")})
    assert r.status_code == 503


def test_storage_health_local_mode(client):
    from app.core.config import settings

    r = client.get("/api/v1/health/ready")
    checks = r.json()["checks"]
    if settings.s3_endpoint and settings.s3_access_key:
        assert checks["storage_configured"] is True
    else:
        assert checks["storage_configured"] is False
        assert checks["storage_mode"] == "local"