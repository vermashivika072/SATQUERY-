"""Job dispatch: Celery when a broker is reachable, else an in-process worker.

This environment has no Redis broker and no Docker, so the Celery path cannot
run here. To keep the async contract (POST returns a job_id immediately, the
frontend polls for progress) every dispatch falls back to a small in-process
thread pool that runs the SAME task bodies and persists through the same
job_service. The Celery path is exercised whenever redis://broker responds.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

from app.core.config import settings
from app.workers.tasks import raster, rag, vision

_BROKER_CHECK_TTL = 30.0
_broker_cache: dict = {"at": 0.0, "ok": False}
_broker_lock = threading.Lock()


def broker_available() -> bool:
    """Lazy, cached redis ping. Returns False when no broker is running."""
    now = time.monotonic()
    if now - _broker_cache["at"] < _BROKER_CHECK_TTL:
        return bool(_broker_cache["ok"])
    ok = False
    try:
        import redis

        client = redis.Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=1.0,
            socket_timeout=1.0,
        )
        ok = bool(client.ping())
        client.close()
    except Exception:
        ok = False
    with _broker_lock:
        _broker_cache.update(at=now, ok=ok)
    return ok


_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="geoai-job")


def _local_runner(fn, *args):
    try:
        fn(*args)
    except Exception as exc:
        print(f"[jobs] local worker failed: {type(exc).__name__}: {exc}")


def _dispatch(task_reference, *args) -> str:
    if broker_available():
        task_reference.delay(*args)
        return "celery"
    # task.run holds the plain decorated function (no retry wrapper)
    _executor.submit(_local_runner, task_reference.run, *args)
    return "local"


def dispatch_raster_job(job_id: str, asset_id: str) -> str:
    return _dispatch(raster.convert_to_cog_task, job_id, asset_id)


def dispatch_vision_job(job_id: str, asset_id: str, image_url: str) -> str:
    return _dispatch(vision.analyze_asset_task, job_id, asset_id, image_url)


def dispatch_rag_job(job_id: str, file_path: str, session_id: str) -> str:
    return _dispatch(rag.ingest_document_task, job_id, file_path, session_id)