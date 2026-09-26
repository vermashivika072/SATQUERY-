import math
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.provenance import provenance
from app.db.models.user import User
from app.db.session import get_db
from app.services import spatial_engine

router = APIRouter(tags=["modules"])

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

_WMO_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle light",
    57: "Freezing drizzle dense",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Freezing rain light",
    67: "Freezing rain heavy",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def _sat_polygon_area_m2(geometry: dict) -> float | None:
    if not geometry or geometry.get("type") != "Polygon":
        return None
    ring = (geometry.get("coordinates") or [[]])[0]
    if not ring or len(ring) < 4:
        return None
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    mean_lat = sum(lats) / len(lats)
    mpx = 111320.0 * max(math.cos(math.radians(mean_lat)), 0.01)
    mpy = 111320.0
    acc = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        acc += (x1 * y2) - (x2 * y1)
    return abs(acc / 2.0) * mpx * mpy


def _enrich_parcels(features: list[dict]) -> list[dict]:
    result = []
    for i, feature in enumerate(features):
        props = dict(feature.get("properties") or {})
        geometry = feature.get("geometry") or {}
        area = _sat_polygon_area_m2(geometry)
        props["overlay_layer"] = "parcel"
        props["parcel_id"] = props.get("parcel_id") or props.get("id") or f"PARCEL-{i + 1}"
        props["area_sqm"] = area if area is not None else 0
        props["land_use"] = props.get("land_use") or "Residential"
        result.append({"type": "Feature", "geometry": geometry, "properties": props})
    return result


@router.get("/parcels")
def parcels(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_meters: float = Query(1000, ge=50, le=5000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Building footprints/parcels as GeoJSON around a point.

    Zero-cost: reads the local `land_parcels` table when present, otherwise
    returns a deterministic mock (no paid or external tile service).
    """
    result = spatial_engine.get_parcels_in_radius(lat, lon, radius_meters, db)
    return {
        "type": "FeatureCollection",
        "features": _enrich_parcels(result.get("features", [])),
        "provenance": result.get("provenance", provenance("UNAVAILABLE", False)),
    }


def _flood_zone_geometry(lat: float, lon: float) -> dict:
    """Deterministic simulated flood zone centred on the requested point."""
    ring = []
    steps = 12
    for i in range(steps + 1):
        a = 2.0 * math.pi * i / steps
        ring.append([lon + 0.085 * math.cos(a), lat + 0.05 * math.sin(a)])
    return {"type": "Polygon", "coordinates": [ring]}


@router.get("/disaster/flood-risk")
def flood_risk(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    user: User = Depends(get_current_user),
):
    """Simulated flood-risk zone as semi-transparent GeoJSON (no paid feed)."""
    feature: dict[str, Any] = {
        "type": "Feature",
        "geometry": _flood_zone_geometry(lat, lon),
        "properties": {
            "overlay_layer": "flood",
            "hazard_type": "flood",
            "name": "Simulated flood zone",
            "risk_level": "HIGH",
            "risk_score": 78.5,
        },
    }
    return {
        "type": "FeatureCollection",
        "features": [feature],
        "provenance": provenance(
            "SIMULATED", False, "deterministic polygon, no hazard data stream"
        ),
    }


@router.get("/weather")
def weather(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    user: User = Depends(get_current_user),
):
    """Real current weather via the free Open-Meteo API (no API key required)."""
    try:
        resp = httpx.get(
            OPEN_METEO_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,precipitation,"
                           "wind_speed_10m,weather_code",
                "timezone": "auto",
            },
            timeout=6.0,
        )
        if resp.status_code != 200:
            return {
                "status": "error",
                "source": "OPEN-METEO",
                "description": "Open-Meteo unavailable",
                "http_status": resp.status_code,
            }
        current = (resp.json() or {}).get("current") or {}
        code = current.get("weather_code")
        wind_kmh = float(current.get("wind_speed_10m", 0.0) or 0.0)
        return {
            "status": "ok",
            "source": "OPEN-METEO",
            "temperature_celsius": float(current.get("temperature_2m", 0.0) or 0.0),
            "precipitation_mm": float(current.get("precipitation", 0.0) or 0.0),
            "wind_speed_kmh": wind_kmh,
            "wind_speed_mps": wind_kmh / 3.6,
            "humidity_percentage": float(current.get("relative_humidity_2m", 0.0) or 0.0),
            "description": _WMO_CODES.get(int(code) if code is not None else -1, "Unknown"),
            "location_name": "Open-Meteo (current location)",
            "latitude": lat,
            "longitude": lon,
            "provenance": provenance(
                "LIVE", True, "current conditions via Open-Meteo (no key required)"
            ),
        }
    except httpx.RequestError as exc:
        return {
            "status": "error",
            "source": "OPEN-METEO",
            "description": "request_failed",
            "error": str(exc),
        }