import uuid
from datetime import datetime

from pydantic import BaseModel


class SceneOut(BaseModel):
    id: uuid.UUID
    sensor: str
    acquired_at: datetime
    cloud_cover: float | None
    cog_url: str | None

    class Config:
        from_attributes = True


class SceneSearchResponse(BaseModel):
    scenes: list[SceneOut]
    count: int
    provenance: dict = {}