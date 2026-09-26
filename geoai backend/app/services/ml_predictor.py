import math
from app.core.provenance import provenance
from app.services.weather_service import get_current_weather


def predict_flood_risk(lat: float, lon: float, elevation_m: float,
                       river_distance_km: float = 1.0,
                       soil_saturation: float = 0.5,
                       precipitation_mm: float | None = None) -> dict:
    weather = get_current_weather(lat, lon)
    precip = weather.get("precipitation_mm", 0.0) if precipitation_mm is None else precipitation_mm
    precip = max(0.0, float(precip))
    elevation = max(0.0, float(elevation_m))
    distance = max(0.0, float(river_distance_km))
    sat = _clamp(float(soil_saturation), 0.0, 1.0)

    precip_score = _clamp((precip / 250.0) * 100, 0, 100)
    elev_score = _clamp(((120 - elevation) / 120) * 100, 0, 100)
    river_score = _clamp(((5 - distance) / 5) * 100, 0, 100)
    soil_score = sat * 100

    score = round(precip_score * 0.45 + elev_score * 0.25 + river_score * 0.15 + soil_score * 0.15, 1)
    return {
        "provenance": provenance("HEURISTIC", False, "weighted formula, no ML model"),
        "risk_score": score,
        "risk_level": _level(score),
        "warning_message": _message(_level(score)),
        "weather": weather,
    }


def _level(s):
    if s >= 80: return "CRITICAL"
    if s >= 50: return "HIGH"
    if s >= 20: return "MEDIUM"
    return "LOW"


def _message(level):
    return {
        "CRITICAL": "Extreme flood risk. Activate response.",
        "HIGH": "High flood risk. Prepare resources.",
        "MEDIUM": "Moderate risk. Monitor conditions.",
        "LOW": "Low risk. Normal conditions.",
    }[level]


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))