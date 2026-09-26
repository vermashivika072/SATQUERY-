from celery import Celery
from app.core.config import settings

celery_app = Celery("geoai", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_track_started=True,
    task_time_limit=600,
)
celery_app.autodiscover_tasks(["app.workers.tasks"])