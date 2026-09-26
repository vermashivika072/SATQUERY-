from app.workers.celery_app import celery_app
from app.services import job_service, vision_engine


def analyze_asset_work(job_id: str, asset_id: str, image_url: str) -> dict:
    def work() -> dict:
        job_service.update_job(job_id, progress=30)
        cog_path = vision_engine.find_cog_for_asset(asset_id)
        if cog_path is not None:
            try:
                vision = vision_engine.analyze_satellite_imagery(str(cog_path))
            except Exception:
                vision = vision_engine.simulate_satellite_imagery(image_url=image_url)
        else:
            vision = vision_engine.simulate_satellite_imagery(image_url=image_url)
        job_service.update_job(job_id, progress=85)
        return {
            "asset_id": asset_id,
            "cog_url": image_url,
            "vision": vision,
        }

    return job_service.run_job(job_id, work)


@celery_app.task(
    name="vision.analyze_asset",
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=2,
)
def analyze_asset_task(job_id: str, asset_id: str, image_url: str) -> dict:
    return analyze_asset_work(job_id, asset_id, image_url)