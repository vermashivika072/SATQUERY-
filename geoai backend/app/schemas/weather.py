from pydantic import BaseModel


class WeatherOut(BaseModel):
    temperature_celsius: float | None = None
    humidity_percentage: float | None = None
    precipitation_mm: float | None = None
    wind_speed_mps: float | None = None
    description: str | None = None
    location_name: str | None = None
    source: str | None = None
    status: str | None = None