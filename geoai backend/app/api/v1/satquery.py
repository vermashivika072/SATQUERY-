from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.deps import get_current_user
from app.core.provenance import provenance
from app.db.session import get_satquery_db
from app.db.models.user import User
from app.schemas.satquery import SceneOut, SceneSearchResponse
from app.services import satquery_service

router = APIRouter(prefix="/satquery", tags=["satquery"])


@router.get("/scenes", response_model=SceneSearchResponse)
def search_scenes(
    minx: float = Query(...), miny: float = Query(...),
    maxx: float = Query(...), maxy: float = Query(...),
    start: datetime = Query(...), end: datetime = Query(...),
    max_cloud: float = Query(100.0, ge=0, le=100),
    sensor: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_satquery_db),
):
    scenes = satquery_service.find_scenes(
        db, (minx, miny, maxx, maxy), start, end, max_cloud, sensor, limit
    )
    return {
        "scenes": [SceneOut(**s) for s in scenes],
        "count": len(scenes),
        "provenance": provenance("DB", True, "scenes from satquery.scenes"),
    }


@router.get("/coverage")
def coverage(minx: float, miny: float, maxx: float, maxy: float,
             user: User = Depends(get_current_user),
             db: Session = Depends(get_satquery_db)):
    return satquery_service.coverage_summary(db, (minx, miny, maxx, maxy))