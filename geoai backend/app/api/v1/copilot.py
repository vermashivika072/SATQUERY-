from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.deps import get_current_user
from app.db.session import get_db
from app.db.models.user import User
from app.schemas.copilot import ClearCacheRequest, CopilotRequest
from app.services import llm_router, orchestrator

router = APIRouter(prefix="/copilot", tags=["copilot"])


@router.post("/query")
def query(payload: CopilotRequest, user: User = Depends(get_current_user),
          db: Session = Depends(get_db)):
    return orchestrator.run_geoai_pipeline(
        db=db,
        session_id=payload.session_id,
        prompt=payload.prompt,
        asset_id=payload.asset_id,
        user_id=user.id,
        enable_cache=payload.enable_cache,
        map_context=payload.map_context,
    )


@router.post("/clear-cache")
def clear_cache(payload: ClearCacheRequest, user: User = Depends(get_current_user)):
    session_id = payload.session_id.strip() if isinstance(payload.session_id, str) else ""
    return {
        "status": "cleared",
        "session_id": session_id or None,
        "cleared": llm_router.clear_cached_context(session_id),
    }