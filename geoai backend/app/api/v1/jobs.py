import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models.user import User
from app.db.models.asset import Asset
from app.db.session import get_db
from app.services import job_service
from app.workers import dispatch

router = APIRouter(prefix="/jobs", tags=["jobs"])

VALID_KINDS = {"raster_conversion", "vision_analysis", "rag_ingest"}


class CreateJobRequest(BaseModel):
    kind: str
    asset_id: str | None = None
    image_url: str | None = None
    file_path: str | None = None
    session_id: str | None = None


def _serialize(job) -> dict:
    payload = job_service.persisted_job(job)
    return payload


@router.post("", status_code=201)
def create_job(
    payload: CreateJobRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.kind not in VALID_KINDS:
        raise HTTPException(400, f"Unsupported job kind {payload.kind!r}")

    if payload.kind in {"raster_conversion", "vision_analysis"}:
        if not payload.asset_id:
            raise HTTPException(400, "asset_id is required")
        if payload.kind == "vision_analysis" and not payload.image_url:
            raise HTTPException(400, "image_url is required")
        try:
            parsed_asset = uuid.UUID(str(payload.asset_id))
        except ValueError:
            parsed_asset = None
        asset = db.query(Asset).filter(Asset.id == parsed_asset).first() if parsed_asset else None
        if not asset or asset.user_id != user.id:
            raise HTTPException(404, "Asset not found")

    if payload.kind == "rag_ingest":
        if not payload.file_path:
            raise HTTPException(400, "file_path is required")

    job = job_service.create_job(db, user.id, payload.kind)

    if payload.kind == "raster_conversion":
        dispatch_mode = dispatch.dispatch_raster_job(str(job.id), payload.asset_id)
    elif payload.kind == "vision_analysis":
        dispatch_mode = dispatch.dispatch_vision_job(
            str(job.id), payload.asset_id, payload.image_url
        )
    else:
        dispatch_mode = dispatch.dispatch_rag_job(
            str(job.id), payload.file_path, payload.session_id or ""
        )

    body = _serialize(job)
    body["dispatch"] = dispatch_mode
    return body


@router.get("")
def list_jobs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_serialize(job) for job in job_service.list_jobs(db, user.id)]


@router.get("/{job_id}")
def get_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = job_service.get_job(db, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(404, "Job not found")
    return _serialize(job)


@router.delete("/{job_id}", status_code=204)
def delete_job(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = job_service.get_job(db, job_id)
    if not job or job.user_id != user.id:
        raise HTTPException(404, "Job not found")
    db.delete(job)
    db.commit()