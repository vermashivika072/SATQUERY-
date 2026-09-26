from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.services import storage

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live():
    return {"status": "ok"}


@router.get("/ready")
def ready(db: Session = Depends(get_db)):
    checks = {}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e.__class__.__name__}"
    checks["llm_configured"] = bool(settings.groq_api_key)
    checks["weather_configured"] = bool(settings.openweather_api_key)
    checks["storage_configured"] = storage.is_configured()
    checks["storage_mode"] = storage.mode()
    overall = "ok" if checks["database"] == "ok" else "degraded"
    return {"status": overall, "checks": checks}