"""Object storage abstraction.

Uses S3/MinIO when credentials are configured, otherwise falls back to a
local disk folder so development flows always persist bytes. In production a
missing/empty storage configuration is a hard startup error and, defensively,
every storage operation returns 503 instead of silently dropping data.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings

APP_DIR = Path(__file__).resolve().parents[2]
LOCAL_ROOT = APP_DIR / "storage" / "files"

_s3_client = None


def _has_s3() -> bool:
    return bool(
        settings.s3_endpoint
        and settings.s3_bucket
        and settings.s3_access_key
        and settings.s3_secret_key
    )


def _client():
    global _s3_client
    if _s3_client is None:
        import boto3
        from botocore.client import Config

        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint or None,
            aws_access_key_id=settings.s3_access_key or None,
            aws_secret_access_key=settings.s3_secret_key or None,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


def _is_production() -> bool:
    return (settings.environment or "").strip().lower() == "production"


def mode() -> str:
    return "s3" if _has_s3() else "local"


def is_configured() -> bool:
    return _has_s3()


def ensure_available() -> None:
    if not _has_s3() and _is_production():
        raise HTTPException(
            503,
            "Object storage is not configured. Add S3/MinIO credentials to "
            "the environment and restart.",
            headers={"Retry-After": "30"},
        )


def _local_path(key: str) -> Path:
    return (LOCAL_ROOT / key).resolve()


def _assert_local_path(path: Path) -> None:
    path.relative_to(LOCAL_ROOT.resolve())


def put_object(key: str, body: bytes, content_type: str | None = None) -> None:
    ensure_available()
    if _has_s3():
        _client().put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=body,
            ContentType=content_type or "application/octet-stream",
        )
        return
    path = _local_path(key)
    _assert_local_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(body)


def put_object_stream(
    key: str,
    source,
    content_type: str | None = None,
) -> int:
    """Stream a file-like `source` into storage, returning bytes written.

    `source` must implement a synchronous `.read(n)` (e.g. Starlette's
    UploadFile exposes the spooled file via `.file`). Chunked writes keep
    memory bounded for large uploads.
    """
    ensure_available()
    if _has_s3():
        _client().upload_fileobj(
            source,
            settings.s3_bucket,
            key,
            ExtraArgs={"ContentType": content_type or "application/octet-stream"},
        )
        return source.tell() if hasattr(source, "tell") else 0
    path = _local_path(key)
    _assert_local_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with open(path, "wb") as out:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            written += len(chunk)
    return written


def get_object(key: str) -> bytes:
    ensure_available()
    if _has_s3():
        return _client().get_object(Bucket=settings.s3_bucket, Key=key)["Body"].read()
    path = _local_path(key)
    _assert_local_path(path)
    if not path.is_file():
        raise HTTPException(404, "Object not found")
    return path.read_bytes()


def get_object_stream(key: str, chunk_size: int = 1024 * 1024):
    """Yield `key` contents in chunks (for ownership-checked downloads).

    The generator closes the underlying handle/file object on exhaustion or
    generator close. Raises 404 when the object is missing.
    """
    ensure_available()

    def _s3_chunks():
        body = _client().get_object(Bucket=settings.s3_bucket, Key=key)["Body"]
        try:
            while True:
                chunk = body.read(chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            body.close()

    def _file_chunks():
        path = _local_path(key)
        _assert_local_path(path)
        if not path.is_file():
            raise HTTPException(404, "Object not found")
        with open(path, "rb") as handle:
            while True:
                chunk = handle.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    return _s3_chunks() if _has_s3() else _file_chunks()


def object_exists(key: str) -> bool:
    if _has_s3():
        try:
            _client().head_object(Bucket=settings.s3_bucket, Key=key)
            return True
        except Exception:
            return False
    path = _local_path(key)
    try:
        _assert_local_path(path)
    except ValueError:
        return False
    return path.is_file()


def delete_object(key: str) -> None:
    ensure_available()
    if _has_s3():
        _client().delete_object(Bucket=settings.s3_bucket, Key=key)
        return
    path = _local_path(key)
    try:
        _assert_local_path(path)
    except ValueError:
        return
    path.unlink(missing_ok=True)


def presigned_url(key: str, expires: int = 3600) -> str:
    ensure_available()
    if _has_s3():
        return _client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": key},
            ExpiresIn=expires,
        )
    raise HTTPException(
        503,
        "presigned URLs are only available in S3/MinIO mode; "
        "use /assets/{asset_id}/download in local mode.",
    )