from datetime import datetime
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.provenance import provenance


def find_scenes(
    db: Session,
    bbox: tuple[float, float, float, float],
    start: datetime,
    end: datetime,
    max_cloud: float = 100.0,
    sensor: str | None = None,
    limit: int = 200,
) -> list[dict]:
    minx, miny, maxx, maxy = bbox
    sql = text(
        """
        SELECT id, sensor, acquired_at, cloud_cover, cog_url
        FROM satquery.scenes
        WHERE ST_Intersects(
            footprint,
            ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326)
        )
          AND acquired_at BETWEEN :start AND :end
          AND cloud_cover <= :max_cloud
          AND (:sensor IS NULL OR sensor = :sensor)
        ORDER BY acquired_at DESC
        LIMIT :limit
        """
    )
    rows = db.execute(sql, {
        "minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy,
        "start": start, "end": end, "max_cloud": max_cloud,
        "sensor": sensor, "limit": limit,
    }).mappings().all()
    return [dict(r) for r in rows]


def coverage_summary(db: Session, bbox: tuple[float, float, float, float]) -> dict:
    minx, miny, maxx, maxy = bbox
    sql = text(
        """
        SELECT sensor, COUNT(*) AS scene_count,
               AVG(cloud_cover) AS avg_cloud
        FROM satquery.scenes
        WHERE ST_Intersects(
            footprint,
            ST_MakeEnvelope(:minx, :miny, :maxx, :maxy, 4326)
        )
        GROUP BY sensor
        ORDER BY scene_count DESC
        """
    )
    rows = db.execute(sql, {"minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy}).mappings().all()
    return {
        "by_sensor": [dict(r) for r in rows],
        "provenance": provenance("DB", True, "coverage from satquery.scenes"),
    }