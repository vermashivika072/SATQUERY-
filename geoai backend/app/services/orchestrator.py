"""GeoAI orchestration, isolated from the HTTP layer.

Runs the copilot pipeline: query classification, document-aware RAG,
and the geospatial tool chain. Used by the /copilot/query endpoint.
"""
import json
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.provenance import provenance
from app.services import geocoding_service, llm_router, ml_predictor, spatial_engine, vision_engine

_SHOW_ACTIONS = {
    "parcels": "SHOW_PARCELS",
    "parcel": "SHOW_PARCELS",
    "flood": "SHOW_FLOOD",
    "flood risk": "SHOW_FLOOD",
    "weather": "SHOW_WEATHER",
}


def _explicit_show_action(prompt: str) -> str | None:
    """Deterministic guard: an explicit "show <layer>" request always returns
    the matching SHOW_* map action, regardless of LLM variance."""
    match = re.search(
        r"\bshow(?: me)? (?:the )?(parcels|parcel|flood risk|flood|weather)\b",
        (prompt or "").lower(),
    )
    if not match:
        return None
    return _SHOW_ACTIONS[match.group(1)]
from app.services.satquery_service import find_scenes

_LOCATION_RE = re.compile(
    r"\b(?:of|in|at|for|near|around)\s+"
    r"([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)*)"
)
_PLACEHOLDER_LOCATIONS = {
    "here", "hereabouts", "there", "this area", "the area", "my area",
    "this region", "the region", "my location", "current location",
}


def _extract_location_name(prompt: str) -> str | None:
    match = _LOCATION_RE.search(prompt)
    if not match:
        return None
    name = " ".join(match.group(1).split()).strip(" ,;.")
    if not name or name.lower() in _PLACEHOLDER_LOCATIONS:
        return None
    return name


def _map_context_sentence(map_context: dict | None) -> str:
    if not isinstance(map_context, dict):
        return ""
    try:
        lat, lon = float(map_context.get("lat")), float(map_context.get("lon"))
    except (TypeError, ValueError):
        return ""
    return (
        f"\nThe user's current map center is {lat:.4f}, {lon:.4f}."
        " Always answer based on this location unless the user explicitly"
        " names a different city."
    )


def _resolve_coordinates(prompt: str, intent: dict, map_context: dict | None = None) -> tuple[float, float, str]:
    name = intent.get("location_name") or _extract_location_name(prompt)
    coords = intent.get("coordinates")
    if name and (isinstance(coords, dict) and coords.get("lat") is not None
            and coords.get("lon") is not None):
        return float(coords["lat"]), float(coords["lon"]), "PROMPT"
    if name:
        try:
            place = geocoding_service.geocode(name)
        except Exception:
            place = None
        if isinstance(place, dict) and place.get("latitude") is not None:
            return float(place["latitude"]), float(place["longitude"]), "GEOCODED"
    if isinstance(map_context, dict):
        try:
            lat, lon = float(map_context.get("lat")), float(map_context.get("lon"))
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                return lat, lon, "DEFAULT"
        except (TypeError, ValueError):
            pass
    return 28.6139, 77.2090, "DEFAULT"


def run_geoai_pipeline(db: Session, session_id: str, prompt: str,
                       asset_id: str | None = None, user_id=None,
                       enable_cache: bool = True,
                       map_context: dict | None = None) -> dict:
    """Classify the prompt and execute the matching tool chain."""
    request_id = str(uuid.uuid4())
    query_type = llm_router.classify_query(prompt)

    if query_type == "general":
        structured = llm_router.answer_general_query_structured(prompt, map_context=map_context)
        text = structured["reply_text"]
        map_action = structured["map_action"]
        lat, lon = structured.get("lat"), structured.get("lon")
        if map_action in (
            "FLY_TO", "SHOW_PARCELS", "SHOW_FLOOD", "SHOW_WEATHER"
        ) and (lat is None or lon is None):
            name = structured.get("location_name") or _extract_location_name(prompt)
            if name:
                try:
                    place = geocoding_service.geocode(name)
                except Exception:
                    place = None
                if isinstance(place, dict) and place.get("latitude") is not None:
                    lat, lon = float(place["latitude"]), float(place["longitude"])
        if map_action == "FLY_TO" and (lat is None or lon is None):
            map_action = "NONE"
        map_action = _explicit_show_action(prompt) or map_action
        return {"session_id": session_id, "request_id": request_id, "text": text,
                "data": {"query_type": "general"},
                "map_action": map_action,
                "location_name": structured.get("location_name"),
                "lat": lat, "lon": lon,
                "layer_name": structured.get("layer_name"),
                "rag_sources": [], "cache_hit": False,
                "provenance": {"llm": llm_router._llm_provenance(text)}}

    if query_type == "document":
        rag_prompt, sources = llm_router.get_rag_context(prompt, session_id)
        answer = llm_router._call_llm([
            {"role": "system", "content": "Answer using the provided document context."},
            {"role": "user", "content": rag_prompt},
        ])
        return {"session_id": session_id, "request_id": request_id, "text": answer,
                "data": {"query_type": "document"}, "rag_sources": sources, "cache_hit": False,
                "provenance": {"llm": llm_router._llm_provenance(answer),
                               "rag": provenance("DB", True, "document chunks" if sources else "no documents ingested")}}

    # geoai path: the spatial tool chain
    intent, cache_hit = llm_router.extract_cached_spatial_intent(
        prompt,
        session_id=session_id,
        enable_cache=enable_cache,
    )
    lat, lon, coordinates_source = _resolve_coordinates(prompt, intent, map_context)
    parcels = spatial_engine.get_parcels_in_radius(lat, lon, 1000, db)
    weather = ml_predictor.get_current_weather(lat, lon)
    flood = ml_predictor.predict_flood_risk(lat, lon, 35.0)
    vision = None
    if asset_id:
        vision = vision_engine.analyze_cog_for_asset(db, user_id, asset_id)
    if vision is None:
        vision = vision_engine.simulate_satellite_imagery(lat=lat, lon=lon)

    scenes = []
    try:
        scenes = find_scenes(
            db, (lon - 0.1, lat - 0.1, lon + 0.1, lat + 0.1),
            datetime(2000, 1, 1, tzinfo=timezone.utc),
            datetime(2030, 1, 1, tzinfo=timezone.utc),
            limit=5,
        )
    except Exception:
        pass

    summary_raw = llm_router._call_llm([
        {"role": "system", "content": (
            "You are a geospatial analyst. Respond with only a single strict JSON object.\n"
            'Schema: {"reply_text": string, "map_action": "SHOW_PARCELS"|"SHOW_FLOOD"|"SHOW_WEATHER"|"FLY_TO"|"TOGGLE_LAYER"|"NONE", '
            '"location_name": string|null, "lat": number|null, "lon": number|null, '
            '"layer_name": "NDVI"|"FLOOD"|"WEATHER"|null}.\n'
            "reply_text summarizes the analysis in 2-3 concise sentences. "
            "When the user explicitly asks to show parcels/flood/weather, set map_action=SHOW_PARCELS/SHOW_FLOOD/SHOW_WEATHER. "
            "Otherwise do not set a non-NONE map_action." + _map_context_sentence(map_context)
        )},
        {"role": "user", "content": json.dumps({
            "prompt": prompt, "flood": flood, "weather": weather,
            "vision": vision, "scene_count": len(scenes),
        }, default=str)},
    ])
    geo = llm_router._parse_structured_reply(summary_raw)
    summary = geo["reply_text"] or "Geospatial analysis complete."
    map_action = geo["map_action"]
    if map_action not in (
        "TOGGLE_LAYER", "SHOW_PARCELS", "SHOW_FLOOD", "SHOW_WEATHER"
    ) and coordinates_source in ("PROMPT", "GEOCODED"):
        map_action = "FLY_TO"
    layer_name = geo.get("layer_name")
    if map_action == "TOGGLE_LAYER" and layer_name is None:
        map_action = "NONE"
    map_action = _explicit_show_action(prompt) or map_action

    return {
        "session_id": session_id,
        "request_id": request_id,
        "text": summary,
        "map_action": map_action,
        "location_name": intent.get("location_name") or _extract_location_name(prompt),
        "lat": lat, "lon": lon,
        "layer_name": layer_name,
        "data": {
            "query_type": "geoai",
            "coordinates": {"lat": lat, "lon": lon},
            "coordinates_source": coordinates_source,
            "parcel_mapping": parcels,
            "weather": weather,
            "flood_risk_heuristic": flood,
            "vision": vision,
            "scenes": scenes,
        },
        "rag_sources": [],
        "cache_hit": bool(cache_hit),
        "provenance": {
            "parcels": parcels.get("provenance", provenance("UNAVAILABLE", False)),
            "weather": weather.get("provenance", provenance("UNAVAILABLE", False)),
            "flood_risk_heuristic": flood.get("provenance", provenance("UNAVAILABLE", False)),
            "vision": vision.get("provenance", provenance("UNAVAILABLE", False)),
            "llm": llm_router._llm_provenance(summary),
            "coordinates_source": coordinates_source,
        },
    }