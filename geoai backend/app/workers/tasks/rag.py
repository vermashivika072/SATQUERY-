from pathlib import Path

from app.workers.celery_app import celery_app
from app.services import job_service


def ingest_document_work(job_id: str, file_path: str, session_id: str) -> dict:
    def work() -> dict:
        from app.services.rag_engine import rag_engine

        job_service.update_job(job_id, progress=25)
        try:
            chunks = rag_engine.ingest_document(file_path, session_id)
        except FileNotFoundError:
            raise FileNotFoundError(f"Document not found: {file_path}")
        job_service.update_job(job_id, progress=80)
        return {
            "session_id": session_id,
            "file_path": Path(file_path).name,
            "chunks": len(chunks),
        }

    return job_service.run_job(job_id, work)


@celery_app.task(
    name="rag.ingest_document",
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=2,
)
def ingest_document_task(job_id: str, file_path: str, session_id: str) -> dict:
    return ingest_document_work(job_id, file_path, session_id)