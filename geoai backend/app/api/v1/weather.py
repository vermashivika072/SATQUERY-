from fastapi import APIRouter, Depends, HTTPException
from app.core.deps import get_current_user
from app.db.models.user import User
from app.services import weather_service

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("/current")
def current(lat: float, lon: float, user: User = Depends(get_current_user)):
    result = weather_service.get_current_weather(lat, lon)
    if result.get("status") != "ok":
        raise HTTPException(502, result.get("error", "Weather unavailable"))
    return result


@router.get("/health")
def health(user: User = Depends(get_current_user)):
    return weather_service.check_openweather()