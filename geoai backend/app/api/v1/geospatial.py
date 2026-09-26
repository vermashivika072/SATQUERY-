"""Geospatial agent pipeline, raster upload, and RAG document upload.

Ported from the legacy monolithic GeoAI entry point into the modular
FastAPI backend. Reuses the existing services layer.
"""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.provenance import provenance, source_of
from app.db.models.user import User
from app.db.session import get_db
from app.schemas.copilot import GeospatialAgentRequest
from app.services import (
    cog_converter,
    geocoding_service,
    job_service,
    llm_router,
    ml_predictor,
    rag_engine,
    spatial_engine,
    vision_engine,
    weather_service,
)

router = APIRouter(tags=["geospatial"])

DEFAULT_LAT = float(os.getenv("GEOAI_DEFAULT_LAT", "28.6139"))
DEFAULT_LON = float(os.getenv("GEOAI_DEFAULT_LON", "77.2090"))
DEFAULT_RADIUS_METERS = float(os.getenv("GEOAI_DEFAULT_RADIUS_METERS", "1000"))

APP_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = APP_DIR / "static"
COG_DIR = STATIC_DIR / "cogs"
UPLOAD_DIR = APP_DIR / "storage" / "uploads"

STATIC_DIR.mkdir(parents=True, exist_ok=True)
COG_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/geospatial-agent")
def geospatial_agent(
    request: GeospatialAgentRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    request_id = str(uuid.uuid4())
    llm_router.set_request_id(request_id)

    user_prompt = (request.prompt or request.user_prompt or "").strip()
    if not user_prompt:
        raise HTTPException(400, "user_prompt cannot be empty")

    session_id = request.session_id or str(uuid.uuid4())

    # Fast query router
    if _is_weather_query(user_prompt):
        query_type = "weather"
    elif _is_simple_chat(user_prompt):
        query_type = "general"
    else:
        query_type = llm_router.classify_query(user_prompt)

    executed_tools: list[str] = []

    if query_type == "general":
        answer = llm_router.answer_general_query(user_prompt)
        return {
            "request_id": request_id,
            "session_id": session_id,
            "memory_active": bool(request.enable_cache),
            "cache_hit": False,
            "executed_tools": ["llm_router.general_answer"],
            "data": {"query_type": "general", "answer": answer},
            "map_navigation": _build_map_navigation(user_prompt),
            "natural_language_summary": answer,
            "message": answer,
            "rag_sources": [],
            "provenance": {"llm": provenance(
                "CONFIG_ERROR" if str(answer).startswith("LLM is not configured")
                else "LIVE" if not str(answer).startswith("LLM error") else "FALLBACK",
                not str(answer).startswith(("LLM error", "LLM is not configured")))},
            "map_overlay": None,
        }

    if query_type == "document":
        try:
            rag_prompt, rag_sources = llm_router.get_rag_context(user_prompt, session_id)
            answer = llm_router.answer_general_query(rag_prompt)
            return {
                "request_id": request_id,
                "session_id": session_id,
                "memory_active": bool(request.enable_cache),
                "cache_hit": False,
                "executed_tools": ["rag_engine.query_context", "llm_router.document_answer"],
                "data": {"query_type": "document", "answer": answer},
                "map_navigation": _build_map_navigation(user_prompt),
                "natural_language_summary": answer,
                "message": answer,
                "rag_sources": rag_sources,
                "provenance": {"rag": provenance("DB", True, "document chunks") if rag_sources
                               else provenance("FALLBACK", False, "no documents ingested")},
                "map_overlay": None,
            }
        except Exception as exc:
            print(f"[geospatial_agent] {type(exc).__name__}: {exc}")
            return {
                "request_id": request_id,
                "session_id": session_id,
                "memory_active": bool(request.enable_cache),
                "cache_hit": False,
                "executed_tools": ["rag_engine.query_context"],
                "data": {"query_type": "document"},
                "natural_language_summary": f"I could not read the requested document right now. Reason: {exc}",
                "message": "Document processing failed.",
                "rag_sources": [],
                "provenance": {"rag": provenance("FALLBACK", False, str(exc))},
                "map_overlay": None,
                "map_navigation": _build_map_navigation(user_prompt),
            }

    try:
        rag_prompt, rag_sources = llm_router.get_rag_context(user_prompt, session_id)
    except Exception as err:
        print(f"[geospatial_agent] {type(err).__name__}: {err}")
        rag_prompt, rag_sources = user_prompt, []
    executed_tools.append("rag_engine.query_context")

    image_url = None
    if request.asset_id:
        asset_path = _find_asset_path(request.asset_id)
        if asset_path is None:
            raise HTTPException(404, "Satellite asset not found")
        image_url = f"/static/cogs/{asset_path.name}"
        executed_tools.append("raster_asset_processing")
    else:
        recent_assets = sorted(
            COG_DIR.glob("*.tif"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if recent_assets:
            image_url = f"/static/cogs/{recent_assets[0].name}"

    try:
        intent, cache_hit = llm_router.extract_cached_spatial_intent(
            user_prompt,
            session_id=session_id,
            enable_cache=bool(request.enable_cache),
            clear_cache=bool(request.clear_cache),
        )
    except Exception as err:
        print(f"[geospatial_agent] {type(err).__name__}: {err}")
        intent = {
            "location_name": None,
            "coordinates": None,
            "hazard_type": "general",
            "confidence": "LOW",
            "source": "fallback",
        }
        cache_hit = False
    executed_tools.append("llm_router.extract_spatial_intent")

    try:
        coordinates = _resolve_coordinates(intent)
    except Exception as err:
        print(f"[geospatial_agent] {type(err).__name__}: {err}")
        coordinates = {"lat": DEFAULT_LAT, "lon": DEFAULT_LON}
    lat, lon = coordinates["lat"], coordinates["lon"]

    try:
        parcel_mapping = spatial_engine.get_parcels_in_radius(
            lat, lon, DEFAULT_RADIUS_METERS, db=db
        )
    except Exception as err:
        print(f"[geospatial_agent] {type(err).__name__}: {err}")
        parcel_mapping = {"type": "FeatureCollection", "features": [], "provenance": "UNAVAILABLE"}
    executed_tools.append("spatial_engine.get_parcels_in_radius")

    try:
        hazard_overlay = _get_hazard_overlay(parcel_mapping, executed_tools, db=db)
    except Exception as err:
        print(f"[geospatial_agent] {type(err).__name__}: {err}")
        hazard_overlay = {"type": "FeatureCollection", "features": [], "provenance": "UNAVAILABLE"}

    try:
        vision_data = vision_engine.simulate_satellite_imagery(image_url=image_url, lat=lat, lon=lon)
    except Exception as err:
        print(f"[geospatial_agent] {type(err).__name__}: {err}")
        vision_data = {"observation_status": "FALLBACK", "cloud_cover_percentage": 0.0, "is_real": False,
                       "provenance": provenance("SIMULATED", False, "vision unavailable")}
    executed_tools.append("vision_engine.simulate_satellite_imagery")

    try:
        environmental_inputs = _derive_environmental_inputs(user_prompt, intent, vision_data)
    except Exception as err:
        print(f"[geospatial_agent] {type(err).__name__}: {err}")
        environmental_inputs = {
            "precipitation_mm": 0.0,
            "elevation_m": 35.0,
            "river_distance_km": 1.0,
            "soil_saturation": 0.45,
        }

    try:
        flood_warning = ml_predictor.predict_flood_risk(
            lat=lat,
            lon=lon,
            elevation_m=environmental_inputs["elevation_m"],
            river_distance_km=environmental_inputs["river_distance_km"],
            soil_saturation=environmental_inputs["soil_saturation"],
        )
    except Exception as err:
        print(f"[geospatial_agent] {type(err).__name__}: {err}")
        flood_warning = {
            "risk_level": "UNASSESSED",
            "risk_score": 0.0,
            "warning_message": "Risk model unavailable; field validation is recommended.",
            "weather": {"precipitation_mm": 0.0, "provenance": provenance("UNAVAILABLE", False)},
            "provenance": provenance("UNAVAILABLE", False, str(err)),
        }
    executed_tools.append("ml_predictor.predict_flood_risk")

    try:
        environmental_inputs["precipitation_mm"] = float(flood_warning["weather"]["precipitation_mm"])
    except (KeyError, TypeError, ValueError):
        environmental_inputs["precipitation_mm"] = 0.0

    weather_data = dict(flood_warning.get("weather") or {})
    if weather_data.get("location_name") and not intent.get("location_name"):
        intent["location_name"] = weather_data["location_name"]

    weather_tracker = {
        "location_name": intent.get("location_name"),
        "hazard_type": intent.get("hazard_type"),
        "coordinates": coordinates,
        "intent_confidence": intent.get("confidence"),
        "live_weather": weather_data,
        "satellite_telemetry": vision_data,
        "environmental_inputs": environmental_inputs,
    }

    if _is_weather_query(user_prompt):
        location = intent.get("location_name") or weather_data.get("location_name") or "the selected area"
        temperature = weather_data.get("temperature_celsius")
        humidity = weather_data.get("humidity_percentage")
        rain = weather_data.get("precipitation_mm")
        description = weather_data.get("description")
        wind = weather_data.get("wind_speed_mps")
        source = weather_data.get("source", "UNKNOWN")

        if all(isinstance(v, (int, float)) for v in (temperature, humidity, rain)):
            summary = (f"Current weather for {location}: {temperature:.1f}°C, "
                       f"humidity {humidity:.0f}%, rainfall in the last hour {rain:.1f} mm.")
            if description:
                summary += f" Conditions: {description}."
            if isinstance(wind, (int, float)):
                summary += f" Wind speed: {wind:.1f} m/s."
            summary += f" Weather source: {source}."
        else:
            error_message = weather_data.get("error")
            if error_message:
                summary = f"Weather data for {location} is currently unavailable. Reason: {error_message}"
            else:
                summary = f"Weather data for {location} is currently unavailable. Source: {source}."
        natural_language_summary = summary
    else:
        try:
            natural_language_summary = llm_router.synthesize_agent_summary(
                user_prompt=rag_prompt,
                spatial_data=parcel_mapping,
                ml_data=flood_warning,
                vision_data=vision_data,
            )
        except Exception as err:
            print(f"[geospatial_agent] {type(err).__name__}: {err}")
            natural_language_summary = (
                "AI Copilot completed with limited service data. "
                "Review the mapped area and validate conditions in the field."
            )
    executed_tools.append("llm_router.synthesize_agent_summary")

    if request.enable_cache:
        try:
            llm_router.save_cached_context(session_id, intent, coordinates, natural_language_summary)
        except Exception as err:
            print(f"[geospatial_agent] {type(err).__name__}: {err}")

    return {
        "request_id": request_id,
        "session_id": session_id,
        "memory_active": bool(request.enable_cache),
        "cache_hit": cache_hit,
        "executed_tools": executed_tools,
        "data": {
            "parcel_mapping": parcel_mapping,
            "weather_tracker": weather_tracker,
            "flood_risk_heuristic": flood_warning,
        },
        "provenance": {
            "parcel_mapping": source_of(parcel_mapping.get("provenance")),
            "weather": source_of(weather_data.get("provenance")),
            "flood_risk_heuristic": source_of(flood_warning.get("provenance")),
            "vision": source_of(vision_data.get("provenance")),
        },
        "natural_language_summary": natural_language_summary,
        "rag_sources": rag_sources,
        "map_overlay": _safe_map_overlay(parcel_mapping, hazard_overlay),
        "map_navigation": _build_map_navigation(user_prompt),
    }


@router.post("/rag/upload-doc")
async def upload_rag_document(
    file: UploadFile = File(...),
    session_id: str = Form(...),
    user: User = Depends(get_current_user),
):
    original_filename = file.filename or "document.txt"
    extension = Path(original_filename).suffix.lower()
    if extension not in settings.allowed_doc_ext:
        raise HTTPException(400, "Upload a .txt, .md, or .csv document.")

    content = await file.read()
    if len(content) / (1024 * 1024) > settings.max_upload_mb:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB")

    prefix = re.sub(r"[^A-Za-z0-9_.-]", "_", session_id or "doc") or "doc"
    safe_filename = f"{prefix}_{uuid.uuid4().hex}{extension}"
    upload_path = rag_engine.rag_engine.upload_dir / safe_filename

    try:
        upload_path.write_bytes(content)
        chunks = rag_engine.rag_engine.ingest_document(upload_path, session_id or "")
    except Exception as exc:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Document ingestion failed: {exc}") from exc

    return {
        "filename": safe_filename,
        "chunks_ingested": len(chunks),
    }


@router.get("/rag/documents")
def list_rag_documents(
    session_id: str = Query(""),
    user: User = Depends(get_current_user),
):
    prefix = re.sub(r"[^A-Za-z0-9_.-]", "_", session_id or "") or "doc"
    docs = sorted(
        (
            p.name
            for p in rag_engine.rag_engine.upload_dir.iterdir()
            if p.is_file()
            and p.name.startswith(f"{prefix}_")
            and p.suffix.lower() in settings.allowed_doc_ext
        ),
        key=str.lower,
    )
    return {
        "session_id": session_id,
        "documents": [{"filename": name} for name in docs],
    }


@router.delete("/rag/documents/{filename}", status_code=204)
def delete_rag_document(
    filename: str,
    user: User = Depends(get_current_user),
):
    upload_root = rag_engine.rag_engine.upload_dir.resolve()
    if (
        not re.fullmatch(r"[A-Za-z0-9_.-]+", filename)
        or Path(filename).suffix.lower() not in settings.allowed_doc_ext
    ):
        raise HTTPException(404, "Document not found")
    target = (upload_root / filename).resolve()
    if target.parent != upload_root or not target.is_file():
        raise HTTPException(404, "Document not found")
    try:
        target.unlink()
    except OSError as exc:
        raise HTTPException(500, f"Failed to delete document: {exc}") from exc


@router.post("/upload-satellite-image")
async def upload_satellite_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    original_filename = file.filename or "satellite_image.tif"
    extension = Path(original_filename).suffix.lower()
    if extension not in settings.allowed_raster_ext:
        raise HTTPException(400, "Unsupported raster format. Upload .tif, .tiff, or .jp2 files.")

    file.file.seek(0, 2)
    total_bytes = file.file.tell()
    file.file.seek(0)
    if total_bytes / (1024 * 1024) > settings.max_upload_mb:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB")

    safe_stem = _safe_filename(Path(original_filename).stem)
    asset_id = str(uuid.uuid4())
    safe_filename = f"{safe_stem}{extension}"
    upload_path = UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_filename}"
    cog_filename = f"{asset_id}_{safe_stem}_cog.tif"
    cog_path = COG_DIR / cog_filename
    cog_url = f"/static/cogs/{cog_filename}"

    try:
        with upload_path.open("wb") as out:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        cog_converter.convert_to_cog(str(upload_path), str(cog_path))
        try:
            vision = vision_engine.analyze_satellite_imagery(str(cog_path))
        except Exception:
            vision = vision_engine.simulate_satellite_imagery(image_url=cog_url)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Satellite upload processing failed: {exc}") from exc
    finally:
        upload_path.unlink(missing_ok=True)

    job = job_service.create_job(db, user.id, "satellite_upload")
    job_service.update_job(
        str(job.id),
        status="succeeded",
        progress=100,
        result={
            "asset_id": asset_id,
            "filename": safe_filename,
            "cog_url": cog_url,
            "vision": vision,
            "processed": "synchronously",
        },
    )

    return {
        "status": "SUCCESS",
        "asset_id": asset_id,
        "job_id": str(job.id),
        "filename": safe_filename,
        "cog_url": cog_url,
        "message": "Image converted to Cloud-Optimized GeoTIFF (COG) successfully.",
        "vision": vision,
    }


def _find_asset_path(asset_id: str) -> Path | None:
    safe_asset_id = _safe_filename(asset_id)
    if safe_asset_id != asset_id:
        return None
    matches = sorted(
        COG_DIR.glob(f"{safe_asset_id}_*_cog.tif"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return matches[0] if matches else None


def _build_map_navigation(user_prompt: str) -> dict[str, Any]:
    coordinates = llm_router._extract_coordinates(user_prompt)
    names = llm_router._extract_multiple_locations(user_prompt)
    locations: list[dict[str, Any]] = []

    if coordinates:
        locations.append({
            "name": "Coordinate-selected area",
            "latitude": float(coordinates["lat"]),
            "longitude": float(coordinates["lon"]),
            "bbox": None,
        })
    else:
        for name in names:
            result = geocoding_service.geocode(name)
            if not result:
                continue
            locations.append({
                "name": str(result["name"]),
                "latitude": float(result["latitude"]),
                "longitude": float(result["longitude"]),
                "bbox": result.get("bbox"),
            })

    return {
        "should_navigate": bool(locations),
        "locations": locations,
        "zoom": 8 if len(locations) > 1 else 11,
        "marker": bool(locations),
        "ambiguous": False,
        "message": None,
    }


def _resolve_coordinates(intent: dict[str, Any]) -> dict[str, float]:
    coordinates = intent.get("coordinates")
    if isinstance(coordinates, dict):
        lat = coordinates.get("lat")
        lon = coordinates.get("lon")
        if lat is not None and lon is not None:
            try:
                lat_f = float(lat)
                lon_f = float(lon)
                if -90 <= lat_f <= 90 and -180 <= lon_f <= 180:
                    resolved = {"lat": lat_f, "lon": lon_f}
                    intent["coordinates"] = resolved
                    return resolved
            except (TypeError, ValueError):
                pass

    location_name = intent.get("location_name")
    if isinstance(location_name, str) and location_name.strip():
        try:
            resolved = weather_service.geocode_location(location_name.strip())
        except Exception as err:
            print(f"[geospatial_agent] {type(err).__name__}: {err}")
            resolved = None
        if isinstance(resolved, dict):
            try:
                lat = float(resolved["lat"])
                lon = float(resolved["lon"])
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    coords = {"lat": lat, "lon": lon}
                    intent["coordinates"] = coords
                    canonical = resolved.get("name")
                    if isinstance(canonical, str) and canonical.strip():
                        intent["location_name"] = canonical.strip()
                    return coords
            except (KeyError, TypeError, ValueError):
                pass

    default_coordinates = {"lat": DEFAULT_LAT, "lon": DEFAULT_LON}
    intent["coordinates"] = default_coordinates
    return default_coordinates


def _safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("._-")
    return cleaned or "satellite_image"


def _get_hazard_overlay(
    parcel_mapping: dict[str, Any],
    executed_tools: list[str],
    db: Session | None = None,
) -> dict[str, Any]:
    features = parcel_mapping.get("features")
    if not isinstance(features, list) or not features:
        return {"type": "FeatureCollection", "features": []}
    hazard_overlay = spatial_engine.get_overlapping_hazards(features[0], db=db)
    executed_tools.append("spatial_engine.get_overlapping_hazards")
    return hazard_overlay


def _derive_environmental_inputs(
    user_prompt: str,
    intent: dict[str, Any],
    vision_data: dict[str, Any],
) -> dict[str, float]:
    hazard_type = str(intent.get("hazard_type") or "general")

    precipitation = _extract_metric(user_prompt, r"(\d+(?:\.\d+)?)\s*mm")
    if precipitation is None:
        precipitation = _default_precipitation(hazard_type)
        cloud_cover = _number_or_default(vision_data.get("cloud_cover_percentage"), 30.0)
        water_area = _number_or_default(vision_data.get("detected_water_bodies_km2"), 1.0)
        precipitation += min(cloud_cover * 0.8, 50.0)
        precipitation += min(water_area * 4.0, 40.0)

    elevation = _extract_metric(user_prompt, r"(?:elevation|altitude|height)\D{0,12}(\d+(?:\.\d+)?)\s*m")
    if elevation is None:
        elevation = float(os.getenv("GEOAI_DEFAULT_ELEVATION_M", "35"))

    river_distance = _extract_metric(
        user_prompt, r"(\d+(?:\.\d+)?)\s*km\D{0,24}(?:river|water|coast|lake|canal)"
    )
    if river_distance is None:
        river_distance = float(os.getenv("GEOAI_DEFAULT_RIVER_DISTANCE_KM", "1.0"))

    soil_saturation = _extract_soil_saturation(user_prompt)
    if soil_saturation is None:
        water_area = _number_or_default(vision_data.get("detected_water_bodies_km2"), 1.0)
        soil_saturation = min(0.95, 0.45 + water_area / 20.0)

    return {
        "precipitation_mm": round(float(precipitation), 2),
        "elevation_m": round(float(elevation), 2),
        "river_distance_km": round(float(river_distance), 2),
        "soil_saturation": round(float(soil_saturation), 2),
    }


def _is_weather_query(prompt: str) -> bool:
    lower = prompt.lower()
    return any(
        term in lower
        for term in (
            "weather", "temperature", "rainfall", "rain", "humidity",
            "forecast", "storm", "cyclone", "precipitation",
        )
    )


def _is_simple_chat(prompt: str) -> bool:
    return prompt.strip().lower() in {
        "hi", "hello", "hey", "hii", "hiii",
        "good morning", "good afternoon", "good evening", "good night",
        "thanks", "thank you", "thankyou", "thx", "ok", "okay",
        "bye", "goodbye",
    }


def _default_precipitation(hazard_type: str) -> float:
    defaults = {
        "flood": 145.0, "cyclone": 210.0, "landslide": 125.0,
        "urban_growth": 45.0, "wildfire": 18.0, "drought": 5.0,
        "general": 65.0,
    }
    return defaults.get(hazard_type, defaults["general"])


def _extract_metric(prompt: str, pattern: str) -> float | None:
    match = re.search(pattern, prompt, flags=re.IGNORECASE)
    if not match:
        return None
    return float(match.group(1))


def _extract_soil_saturation(prompt: str) -> float | None:
    match = re.search(
        r"(?:soil saturation|soil moisture)\D{0,12}(\d+(?:\.\d+)?)\s*(%)?",
        prompt,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    value = float(match.group(1))
    if match.group(2) or value > 1.0:
        value = value / 100.0
    return max(0.0, min(1.0, value))


def _number_or_default(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_map_overlay(
    parcel_mapping: dict[str, Any],
    hazard_overlay: dict[str, Any],
) -> dict[str, Any]:
    try:
        return _build_map_overlay(parcel_mapping, hazard_overlay)
    except Exception as err:
        print(f"[geospatial_agent] {type(err).__name__}: {err}")
        return {"type": "FeatureCollection", "features": [],
                "provenance": provenance("UNAVAILABLE", False, str(err))}


def _build_map_overlay(
    parcel_mapping: dict[str, Any],
    hazard_overlay: dict[str, Any],
) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    features.extend(_tag_features(parcel_mapping, "parcel"))
    features.extend(_tag_features(hazard_overlay, "hazard"))
    return {"type": "FeatureCollection", "features": features}


def _tag_features(
    feature_collection: dict[str, Any],
    layer: str,
) -> list[dict[str, Any]]:
    tagged_features: list[dict[str, Any]] = []
    features = feature_collection.get("features", [])
    if not isinstance(features, list):
        return tagged_features
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = dict(feature.get("properties") or {})
        properties.setdefault("overlay_layer", layer)
        tagged_feature = dict(feature)
        tagged_feature["properties"] = properties
        tagged_features.append(tagged_feature)
    return tagged_features