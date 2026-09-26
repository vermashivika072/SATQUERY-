from datetime import datetime
from sqlalchemy import String, Float, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from geoalchemy2 import Geometry
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class SatQueryScene(Base):
    __tablename__ = "scenes"
    __table_args__ = {"schema": "satquery"}

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    sensor: Mapped[str] = mapped_column(String(64))
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    cloud_cover: Mapped[float | None] = mapped_column(Float, nullable=True)
    footprint = mapped_column(Geometry(geometry_type="POLYGON", srid=4326))
    cog_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json = mapped_column(JSONB, name="metadata", nullable=True)