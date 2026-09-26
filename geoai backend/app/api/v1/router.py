from fastapi import APIRouter
from app.api.v1 import auth, chats, copilot, weather, assets, satquery, health, geospatial, jobs, modules

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(chats.router)
api_router.include_router(copilot.router)
api_router.include_router(weather.router)
api_router.include_router(assets.router)
api_router.include_router(jobs.router)
api_router.include_router(satquery.router)
api_router.include_router(geospatial.router)
api_router.include_router(modules.router)