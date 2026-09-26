import json
import math
import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.provenance import provenance

log = logging.getLogger(__name__)
DEFAULT_SRID = 4326


def _is_development() -> bool:
    return (settings.environment or "").strip().lower() == "development"


def get_parcels_in_radius(lat: float, lon: float, radius_meters: float, db: Session) -> dict:
    try:
        sql = text(
            """
            SELECT
                ST_AsGeoJSON(p.geom)::json AS geometry,
                jsonb_strip_nulls(to_jsonb(p) - 'geom') AS properties
            FROM land_parcels AS p
            WHERE ST_DWithin(
                p.geom::geography,
                ST_SetSRID(ST_MakePoint(:lon, :lat), :srid)::geography,
                :radius
            )
            """
        )
        rows = db.execute(sql, {
            "lat": lat, "lon": lon,
            "radius": radius_meters, "srid": DEFAULT_SRID,
        }).mappings().all()
        features = [
            {"type": "Feature", "geometry": r["geometry"], "properties": r["properties"]}
            for r in rows
        ]
        return {"type": "FeatureCollection", "features": features,
                "provenance": provenance("LIVE", True, "parcels from land_parcels table")}
    except Exception as exc:
        log.warning("parcels fallback: %s", exc)
        db.rollback()
        if _is_development():
            return _mock_parcels(lat, lon, radius_meters)
        return {
            "type": "FeatureCollection",
            "features": [],
            "provenance": provenance("UNAVAILABLE", False, f"parcels unavailable: {exc}"),
            "error": str(exc),
        }


def get_overlapping_hazards(parcel_geojson: dict, db: Session) -> dict:
    try:
        geom_json = json.dumps(parcel_geojson.get("geometry") or parcel_geojson)
        sql = text(
            """
            WITH parcel AS (
                SELECT ST_SetSRID(ST_GeomFromGeoJSON(:gj), :srid) AS geom
            )
            SELECT ST_AsGeoJSON(h.geom)::json AS geometry,
                   jsonb_strip_nulls(to_jsonb(h) - 'geom') AS properties
            FROM flood_hazards AS h
            JOIN parcel ON ST_Intersects(h.geom, parcel.geom)
            """
        )
        rows = db.execute(sql, {"gj": geom_json, "srid": DEFAULT_SRID}).mappings().all()
        features = [
            {"type": "Feature", "geometry": r["geometry"], "properties": r["properties"]}
            for r in rows
        ]
        return {"type": "FeatureCollection", "features": features,
                "provenance": provenance("LIVE", True, "hazards from flood_hazards table")}
    except Exception as exc:
        log.warning("hazards fallback: %s", exc)
        db.rollback()
        return {"type": "FeatureCollection", "features": [],
                "provenance": provenance("FALLBACK", False, f"hazards unavailable: {exc}")}


def _mock_parcels(lat: float, lon: float, radius_meters: float) -> dict:
    size = min(max(radius_meters / 4.0, 35.0), 250.0)
    features = []
    for i, (n, e) in enumerate([(-0.6, -0.2), (0.25, 0.15), (-0.1, 0.7)], start=1):
        c_lat, c_lon = _offset(lat, lon, n * size * 2, e * size * 2)
        features.append({
            "type": "Feature",
            "geometry": _square(c_lat, c_lon, size),
            "properties": {"id": f"mock-parcel-{i}", "source": "fallback", "is_mock": True},
        })
    return {"type": "FeatureCollection", "features": features,
            "provenance": provenance("FALLBACK", False, "mock parcels, development fallback")}


def _square(lat: float, lon: float, half: float) -> dict:
    nw = _offset(lat, lon, half, -half)
    ne = _offset(lat, lon, half, half)
    se = _offset(lat, lon, -half, half)
    sw = _offset(lat, lon, -half, -half)
    return {"type": "Polygon", "coordinates": [[
        [nw[1], nw[0]], [ne[1], ne[0]], [se[1], se[0]], [sw[1], sw[0]], [nw[1], nw[0]],
    ]]}


def _offset(lat: float, lon: float, north_m: float, east_m: float):
    dlat = north_m / 111320.0
    dlon = east_m / (111320.0 * max(math.cos(math.radians(lat)), 0.01))
    return lat + dlat, lon + dlon