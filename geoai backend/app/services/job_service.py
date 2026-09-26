"""Async job persistence.

`run_job` wraps a task body so worker threads (Celery or the local fallback
executor) can drive a job through running -> succeeded/failed without a
request-scoped session.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.models.job import Job

VALID_STATUSES = {"pending", "running", "succeeded", "failed"}


def create_job(db: Session, user_id: uuid.UUID, kind: str) -> Job:
    if isinstance(user_id, str):
        user_id = uuid.UUID(user_id)
    job = Job(user_id=user_id, kind=kind)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_job(db: Session, job_id: str) -> Job | None:
    try:
        parsed = uuid.UUID(str(job_id))
    except ValueError:
        return None
    return db.query(Job).filter(Job.id == parsed).first()


def list_jobs(db: Session, user_id: uuid.UUID) -> list[Job]:
    return (
        db.query(Job)
        .filter(Job.user_id == user_id)
        .order_by(Job.created_at.desc())
        .all()
    )


def persisted_job(job: Job) -> dict:
    return {
        "job_id": str(job.id),
        "user_id": str(job.user_id),
        "kind": job.kind,
        "status": job.status,
        "progress": job.progress,
        "result": job.result,
        "error": job.error,
        "created_at": job.created_at.isoformat() if isinstance(job.created_at, datetime) else job.created_at,
        "updated_at": job.updated_at.isoformat() if isinstance(job.updated_at, datetime) else job.updated_at,
    }


def update_job(
    job_id: str,
    *,
    status: str | None = None,
    progress: int | None = None,
    result: dict | None = None,
    error: dict | None = None,
    clear_error: bool = False,
) -> dict | None:
    if status is not None and status not in VALID_STATUSES:
        raise ValueError(f"Invalid job status {status!r}")
    db: Session = SessionLocal()
    try:
        try:
            parsed = uuid.UUID(str(job_id))
        except ValueError:
            return None
        job = db.query(Job).filter(Job.id == parsed).first()
        if job is None:
            return None
        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = max(0, min(100, int(progress)))
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error
        if clear_error:
            job.error = None
        job.updated_at = func.now()
        db.commit()
        db.refresh(job)
        return persisted_job(job)
    finally:
        db.close()


def run_job(job_id: str, fn):
    """Execute `fn` (returning the job result dict) with honest status updates.

    Marks the job running, persisted the result on success, or records a
    structured error and re-raises so Celery autoretry / the local executor
    can observe the failure.
    """
    update_job(job_id, status="running", progress=10, clear_error=True)
    try:
        result = fn()
        update_job(job_id, status="succeeded", progress=100, result=result, clear_error=True)
        return result
    except Exception as exc:
        update_job(
            job_id,
            status="failed",
            error={"type": type(exc).__name__, "message": str(exc)},
        )
        raise