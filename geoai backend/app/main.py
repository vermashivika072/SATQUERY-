import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# 1. Get the absolute path of the directory containing this script (backend root)
BASE_DIR = Path(__file__).resolve().parents[1]

# 2. Point explicitly to the .env file in this directory
ENV_PATH = BASE_DIR / ".env"

# 3. Load the .env file using the explicit path, overriding any existing vars
load_dotenv(dotenv_path=ENV_PATH, override=True)

# 4. Debug print to verify it worked
print(f"--- ENV DEBUG ---")
print(f"Looking for .env at: {ENV_PATH}")
print(f"File exists: {ENV_PATH.exists()}")
print(f"GROQ KEY LOADED: {bool(os.getenv('GROQ_API_KEY'))}")
print(f"-----------------")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import (
    AppError, app_error_handler, validation_error_handler, unhandled_error_handler,
)
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware, OriginCheckMiddleware

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"


def create_app() -> FastAPI:
    configure_logging(settings.debug)
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(
        OriginCheckMiddleware,
        allow_origins=settings.cors_origins,
        enabled=settings.origin_check_enabled,
    )
    app.add_middleware(RequestContextMiddleware)
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()