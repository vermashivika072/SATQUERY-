from typing import Literal

from pydantic import BaseModel


class SpatialIntentCoordinates(BaseModel):
    lat: float
    lon: float


class SpatialIntent(BaseModel):
    location_name: str | None = None
    coordinates: SpatialIntentCoordinates | None = None
    hazard_type: str = "general"
    confidence: Literal["HIGH", "MEDIUM", "LOW"] = "MEDIUM"
    source: str = "local"


class CopilotRequest(BaseModel):
    session_id: str
    prompt: str
    asset_id: str | None = None
    enable_cache: bool = True
    map_context: dict | None = None


class CopilotResponse(BaseModel):
    session_id: str
    request_id: str
    text: str
    data: dict
    rag_sources: list = []
    cache_hit: bool = False
    provenance: dict = {}


class GeospatialAgentRequest(BaseModel):
    prompt: str | None = None
    user_prompt: str | None = None
    session_id: str | None = None
    asset_id: str | None = None
    enable_cache: bool = True
    clear_cache: bool = False


class ClearCacheRequest(BaseModel):
    session_id: str | None = None