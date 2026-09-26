"""Async jobs lifecycle: create, poll, result, failure, ownership, delete."""
import time
import uuid


def _random_email(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:8]}@example.com"


def _register_and_login(client, prefix):
    email = _random_email(prefix)
    client.post("/api/v1/auth/register", json={
        "email": email, "username": f"{prefix}-{uuid.uuid4().hex[:6]}", "password": "password123"
    })
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code == 200
    return email


def _poll_job(client, job_id, timeout=20.0):
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


def _upload_real_tiff(client, name="real.tif"):
    import io

    import numpy as np
    import rasterio
    from rasterio.transform import from_origin

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
    r = client.post("/api/v1/assets/upload", files={"file": (name, buffer.getvalue(), "image/tiff")})
    assert r.status_code == 200
    return r.json()


def test_upload_wires_job_and_polls_to_succeeded(client):
    _register_and_login(client, "up")

    upload = _upload_real_tiff(client)
    assert upload["status"] == "processing"
    assert upload["job_id"]

    job = _poll_job(client, upload["job_id"])
    assert job["kind"] == "raster_conversion"
    assert job["status"] == "succeeded"
    assert job["progress"] == 100
    assert job["error"] is None
    assert job["result"]["asset_id"] == upload["asset_id"]
    assert job["result"]["cog_url"].startswith("/static/cogs/")
    assert job["result"]["vision"]["is_real"] is True
    assert job["result"]["vision"]["observation_status"] == "REAL"
    assert job["result"]["vision"]["provenance"]["source"] == "LIVE"

    listing = client.get("/api/v1/jobs").json()
    assert any(job_item["job_id"] == upload["job_id"] for job_item in listing)
    # newest first
    assert listing[0]["job_id"] == upload["job_id"]


def test_vision_analysis_job_on_owned_asset(client):
    _register_and_login(client, "vis")
    upload = _upload_real_tiff(client)
    _poll_job(client, upload["job_id"])

    r = client.post("/api/v1/jobs", json={
        "kind": "vision_analysis",
        "asset_id": upload["asset_id"],
        "image_url": "/static/cogs/x_cog.tif",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "vision_analysis"
    assert body["status"] in {"pending", "running", "succeeded"}

    job = _poll_job(client, body["job_id"])
    assert job["status"] == "succeeded"
    assert job["result"]["vision"]["observation_status"] in {"REAL", "SIMULATED"}


def test_rag_job_fails_with_structured_error(client):
    _register_and_login(client, "rag")

    r = client.post("/api/v1/jobs", json={
        "kind": "rag_ingest",
        "file_path": "C:/definitely/does/not/exist.txt",
        "session_id": "missing-doc",
    })
    assert r.status_code == 201
    job_id = r.json()["job_id"]

    job = _poll_job(client, job_id)
    assert job["status"] == "failed"
    assert job["progress"] < 100
    assert job["error"]["type"] == "FileNotFoundError"
    assert "does/not/exist.txt" in job["error"]["message"]


def test_job_owner_isolation_and_delete(client):
    from fastapi.testclient import TestClient
    from app.main import app

    _register_and_login(client, "own1")
    r = client.post("/api/v1/jobs", json={
        "kind": "rag_ingest",
        "file_path": "C:/definitely/does/not/exist.txt",
        "session_id": "iso",
    })
    assert r.status_code == 201
    job_id = r.json()["job_id"]
    _poll_job(client, job_id)

    other = TestClient(app)
    _register_and_login(other, "other")

    assert other.get(f"/api/v1/jobs/{job_id}").status_code == 404
    assert other.delete(f"/api/v1/jobs/{job_id}").status_code == 404

    r = client.delete(f"/api/v1/jobs/{job_id}")
    assert r.status_code == 204
    assert client.get(f"/api/v1/jobs/{job_id}").status_code == 404
    assert client.get("/api/v1/jobs").json() == []


def test_job_validation(client):
    _register_and_login(client, "val")

    assert client.post("/api/v1/jobs", json={"kind": "bogus"}).status_code == 400
    assert client.post("/api/v1/jobs", json={"kind": "raster_conversion"}).status_code == 400
    assert client.post("/api/v1/jobs", json={
        "kind": "vision_analysis",
        "asset_id": "00000000-0000-0000-0000-000000000000",
        "image_url": "/x",
    }).status_code == 404
    assert client.post("/api/v1/jobs", json={"kind": "rag_ingest"}).status_code == 400