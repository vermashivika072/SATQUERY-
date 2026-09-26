import re
import uuid
from pathlib import Path

from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models.asset import Asset
from app.services import cog_converter, job_service, storage, vision_engine

COG_DIR = Path(__file__).resolve().parents[2] / "static" / "cogs"


def _safe_stem(stem: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "-", stem)
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or "raster"


def convert_to_cog_work(job_id: str, asset_id: str) -> dict:
    def work() -> dict:
        db = SessionLocal()
        try:
            try:
                parsed = uuid.UUID(str(asset_id))
            except ValueError:
                parsed = None
            asset = db.query(Asset).filter(Asset.id == parsed).first() if parsed else None
        finally:
            db.close()
        if asset is None:
            raise RuntimeError(f"Unknown asset {asset_id}")

        ext = ("." + asset.filename.rsplit(".", 1)[-1].lower()
               if "." in asset.filename else ".tif")
        stem = _safe_stem(Path(asset.filename or "upload.tif").stem)
        raw_path = COG_DIR / f"{asset.id}_raw{ext}"
        cog_path = COG_DIR / f"{asset.id}_{stem}_cog.tif"
        try:
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            with raw_path.open("wb") as out:
                for chunk in storage.get_object_stream(asset.storage_key):
                    out.write(chunk)
            job_service.update_job(job_id, progress=30)
            cog_converter.convert_to_cog(str(raw_path), str(cog_path))
            job_service.update_job(job_id, progress=70)
        finally:
            raw_path.unlink(missing_ok=True)

        try:
            vision = vision_engine.analyze_satellite_imagery(str(cog_path))
        except Exception:
            vision = vision_engine.simulate_satellite_imagery(
                image_url=f"/static/cogs/{cog_path.name}"
            )
        return {
            "asset_id": str(asset.id),
            "cog_url": f"/static/cogs/{cog_path.name}",
            "filename": asset.filename,
            "storage_mode": storage.mode(),
            "vision": vision,
        }

    return job_service.run_job(job_id, work)


@celery_app.task(
    name="raster.convert_to_cog",
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=2,
)
def convert_to_cog_task(job_id: str, asset_id: str) -> dict:
    return convert_to_cog_work(job_id, asset_id)