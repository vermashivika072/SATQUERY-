import httpx
from app.core.config import settings
from app.core.provenance import provenance

WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"
GEOCODING_URL = "https://api.openweathermap.org/geo/1.0/direct"

DEFAULT_WEATHER = {
    "provenance": provenance("FALLBACK", False, "weather unavailable"),
    "precipitation_mm": 0.0,
    "humidity_percentage": 0.0,
    "temperature_celsius": 0.0,
    "description": "Weather unavailable",
    "wind_speed_mps": 0.0,
    "source": "FALLBACK",
    "status": "fallback",
}


def geocode_location(location: str):
    if not location or not settings.openweather_api_key:
        return None
    try:
        r = httpx.get(
            GEOCODING_URL,
            params={"q": location, "limit": 1, "appid": settings.openweather_api_key},
            timeout=settings.weather_timeout_seconds,
        )
        if r.status_code != 200:
            return None
        results = r.json()
        if not results:
            return None
        item = results[0]
        return {
            "name": item.get("name") or location,
            "state": item.get("state"),
            "country": item.get("country"),
            "lat": float(item["lat"]),
            "lon": float(item["lon"]),
            "provenance": provenance("LIVE", True, "geocoded via OpenWeather"),
        }
    except Exception:
        return None


def get_current_weather(lat: float, lon: float) -> dict:
    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return {**DEFAULT_WEATHER, "source": "ERROR", "status": "invalid_coordinates"}

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return {**DEFAULT_WEATHER, "source": "ERROR", "status": "invalid_coordinates"}

    if not settings.openweather_api_key:
        return {**DEFAULT_WEATHER, "source": "ERROR", "status": "missing_api_key"}

    try:
        r = httpx.get(
            WEATHER_URL,
            params={
                "lat": lat,
                "lon": lon,
                "appid": settings.openweather_api_key,
                "units": "metric",
            },
            timeout=settings.weather_timeout_seconds,
        )
        if r.status_code != 200:
            try:
                error_data = r.json()
            except Exception:
                error_data = r.text
            return {
                **DEFAULT_WEATHER,
                "source": "OPENWEATHER",
                "status": "api_error",
                "http_status": r.status_code,
                "error": error_data,
            }

        data = r.json()
        main = data.get("main") or {}
        weather_list = data.get("weather") or []
        wind = data.get("wind") or {}
        rain = data.get("rain") or {}

        return {
            "precipitation_mm": max(0.0, float(rain.get("1h", 0.0) or 0.0)),
            "humidity_percentage": float(main.get("humidity", 0.0) or 0.0),
            "temperature_celsius": float(main.get("temp", 0.0) or 0.0),
            "wind_speed_mps": float(wind.get("speed", 0.0) or 0.0),
            "description": (weather_list[0].get("description") if weather_list else "Unknown"),
            "location_name": data.get("name", ""),
            "latitude": lat,
            "longitude": lon,
            "source": "OPENWEATHER",
            "status": "ok",
            "provenance": provenance("LIVE", True, "current conditions via OpenWeather"),
        }
    except httpx.RequestError as exc:
        return {**DEFAULT_WEATHER, "source": "ERROR", "status": "request_failed", "error": str(exc)}


def get_live_rainfall(lat: float, lon: float) -> dict:
    return get_current_weather(lat=lat, lon=lon)


def check_openweather() -> dict:
    if not settings.openweather_api_key:
        return {"configured": False, "working": False, "status": "missing_api_key"}
    result = get_current_weather(28.6139, 77.2090)
    if result.get("status") == "ok":
        return {
            "configured": True,
            "working": True,
            "status": "ok",
            "source": "OPENWEATHER",
            "provenance": provenance("LIVE", True, "OpenWeather reachable"),
        }
    return {
        "configured": True,
        "working": False,
        "status": result.get("status"),
        "http_status": result.get("http_status"),
        "error": result.get("error"),
        "provenance": provenance("FALLBACK", False, result.get("status")),
    }


__all__ = [
    "get_current_weather",
    "get_live_rainfall",
    "geocode_location",
    "check_openweather",
]