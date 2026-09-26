from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_DOTENV_PATH = _BACKEND_ROOT / ".env"

load_dotenv(dotenv_path=_DOTENV_PATH)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "GeoAI Platform"
    environment: str = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    database_url: str
    satquery_database_url: str = ""
    db_pool_size: int = 10
    db_max_overflow: int = 20

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cookie_domain: str | None = None

    origin_check_enabled: bool = False

    cors_origins: list[str] = ["http://localhost:5173"]

    groq_api_key: str = ""
    llm_model: str = "openai/gpt-oss-120b"
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_timeout_seconds: float = 30.0

    openweather_api_key: str = ""
    weather_timeout_seconds: float = 10.0

    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "geoai"
    s3_region: str = "auto"

    max_upload_mb: int = 100
    allowed_raster_ext: list[str] = [".tif", ".tiff", ".jp2"]
    allowed_doc_ext: list[str] = [".txt", ".md", ".csv"]

    @model_validator(mode="after")
    def _fallback_satquery(self):
        if not self.satquery_database_url:
            self.satquery_database_url = self.database_url
        return self

    @model_validator(mode="after")
    def _normalize_llm(self):
        self.llm_base_url = self.llm_base_url.strip().rstrip("/")
        model = self.llm_model.strip()
        self.llm_model = model or "llama-3.3-70b-versatile"
        return self

    @model_validator(mode="after")
    def _validate_critical_secrets(self):
        environment = (self.environment or "").strip().lower()
        debug_override = environment == "development" and self.debug is True
        jwt = (self.jwt_secret or "").strip()
        if (
            not jwt
            or jwt == "dev-secret-change-me"
            or len(jwt) < 32
        ) and not debug_override:
            raise ValueError(
                "JWT_SECRET must be at least 32 characters and not a default "
                "value. The weak default is only allowed when "
                "ENVIRONMENT=development AND DEBUG=true."
            )
        if not (self.database_url or "").strip():
            raise ValueError(
                "DATABASE_URL must be set. Check .env and restart."
            )
        if environment == "production":
            lacks_storage = not (
                (self.s3_endpoint or "").strip()
                and (self.s3_bucket or "").strip()
                and (self.s3_access_key or "").strip()
                and (self.s3_secret_key or "").strip()
            )
            if lacks_storage:
                raise ValueError(
                    "S3/MinIO credentials (S3_ENDPOINT, S3_BUCKET, "
                    "S3_ACCESS_KEY, S3_SECRET_KEY) are required when "
                    "ENVIRONMENT=production."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()