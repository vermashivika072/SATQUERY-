import re
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.db.models.user import User
from app.db.models.asset import Asset
from app.services import job_service, storage
from app.workers import dispatch

router = APIRouter(prefix="/assets", tags=["assets"])

APP_DIR = Path(__file__).resolve().parents[2]
COG_DIR = APP_DIR / "static" / "cogs"
COG_DIR.mkdir(parents=True, exist_ok=True)

_CHUNK = 1024 * 1024


def _safe_filename(stem: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "-", stem)
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or "raster"


def _spooled_size(file: UploadFile) -> int:
    file.file.seek(0, 2)
    total = file.file.tell()
    file.file.seek(0)
    return total


def _content_type_for(file: UploadFile, ext: str) -> str:
    guess = file.content_type
    if not guess or guess == "application/octet-stream":
        import mimetypes

        guess = mimetypes.guess_type(file.filename or "")[0]
    if not guess:
        guess = "image/tiff" if ext in {".tif", ".tiff"} else "image/jp2" if ext == ".jp2" else "application/octet-stream"
    return guess


def _asset_payload(asset: Asset, include_download: bool = False) -> dict:
    payload = {
        "asset_id": str(asset.id),
        "filename": asset.filename,
        "content_type": asset.content_type,
        "size_bytes": asset.size_bytes,
        "status": asset.status,
        "created_at": asset.created_at.isoformat()
        if isinstance(asset.created_at, datetime)
        else asset.created_at,
    }
    if include_download:
        if storage.is_configured():
            payload["download_url"] = storage.presigned_url(asset.storage_key)
        else:
            payload["download_url"] = f"/api/v1/assets/{asset.id}/download"
        payload["storage_mode"] = storage.mode()
    return payload


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    storage.ensure_available()
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in settings.allowed_raster_ext:
        raise HTTPException(400, f"Unsupported extension {ext}")

    size_bytes = _spooled_size(file)
    if size_bytes / (1024 * 1024) > settings.max_upload_mb:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB")

    asset_id = uuid.uuid4()
    key = f"uploads/{user.id}/{asset_id}{ext}"
    content_type = _content_type_for(file, ext)

    storage.put_object_stream(key, file.file, content_type)

    asset = Asset(
        id=asset_id, user_id=user.id, filename=file.filename,
        content_type=content_type, size_bytes=size_bytes,
        storage_key=key, status="stored",
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    job = job_service.create_job(db, user.id, "raster_conversion")
    dispatch_mode = dispatch.dispatch_raster_job(str(job.id), str(asset.id))

    return {
        "asset_id": str(asset_id),
        "job_id": str(job.id),
        "status": "processing",
        "dispatch": dispatch_mode,
        "storage_mode": storage.mode(),
    }


@router.get("")
def list_assets(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assets = (
        db.query(Asset)
        .filter(Asset.user_id == user.id)
        .order_by(Asset.created_at.desc())
        .all()
    )
    return [_asset_payload(asset) for asset in assets]


@router.get("/{asset_id}/download")
def download_asset(
    asset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    storage.ensure_available()
    try:
        parsed = uuid.UUID(str(asset_id))
    except ValueError:
        raise HTTPException(404, "Asset not found")
    asset = db.query(Asset).filter(Asset.id == parsed).first()
    if not asset or asset.user_id != user.id:
        raise HTTPException(404, "Asset not found")

    def _stream():
        yield from storage.get_object_stream(asset.storage_key)

    return StreamingResponse(
        _stream(),
        media_type=asset.content_type or "application/octet-stream",
        headers={"Content-Length": str(asset.size_bytes)},
    )


@router.get("/{asset_id}")
def get_asset(
    asset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed = uuid.UUID(str(asset_id))
    except ValueError:
        raise HTTPException(404, "Asset not found")
    asset = db.query(Asset).filter(Asset.id == parsed).first()
    if not asset or asset.user_id != user.id:
        raise HTTPException(404, "Asset not found")
    return _asset_payload(asset, include_download=True)


@router.delete("/{asset_id}", status_code=204)
def delete_asset(
    asset_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        parsed = uuid.UUID(str(asset_id))
    except ValueError:
        raise HTTPException(404, "Asset not found")
    asset = db.query(Asset).filter(Asset.id == parsed).first()
    if not asset or asset.user_id != user.id:
        raise HTTPException(404, "Asset not found")
    try:
        storage.delete_object(asset.storage_key)
    except Exception:
        pass
    db.delete(asset)
    db.commit()