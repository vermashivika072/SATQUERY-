import json
import re
import time

from openai import OpenAI
from openai import APIError, APIConnectionError, APITimeoutError, APIStatusError
from app.core.config import settings
from app.core.provenance import provenance
from app.schemas.copilot import SpatialIntent
from app.services import rag_engine

_CIRCUIT_MAX_FAILURES = 5
_CIRCUIT_COOLDOWN_SECONDS = 60
_circuit = {"failures": 0, "open_until": 0.0}


def _circuit_open() -> bool:
    if time.time() < _circuit["open_until"]:
        return True
    _circuit["failures"] = 0
    return False


def _circuit_success() -> None:
    _circuit["failures"] = 0
    _circuit["open_until"] = 0.0


def _circuit_failure() -> int:
    _circuit["failures"] += 1
    if _circuit["failures"] >= _CIRCUIT_MAX_FAILURES:
        _circuit["open_until"] = time.time() + _CIRCUIT_COOLDOWN_SECONDS
    return _circuit["failures"]


def classify_query(prompt: str) -> str:
    p = prompt.lower()
    if re.search(r"\b(weather|temperature|rain|forecast|humidity)\b", p):
        return "weather"
    if re.search(r"\b(document|pdf|uploaded file|attached)\b", p):
        return "document"
    if re.search(r"\b(flood|hazard|satellite|ndvi|parcel|gis|landslide|cyclone)\b", p):
        return "geoai"
    return "general"


def _call_llm(messages: list[dict]) -> str:
    key = settings.groq_api_key.strip()
    if not key:
        return "LLM is not configured. Add GROQ_API_KEY to .env."

    if _circuit_open():
        return "LLM error: provider temporarily unavailable (circuit open, retrying shortly)."

    base = settings.llm_base_url.strip().rstrip("/") or "https://api.groq.com/openai/v1"

    candidates = [
        settings.llm_model.strip(),
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
    ]
    seen: set[str] = set()
    models: list[str] = []
    for m in candidates:
        if not m or m in seen:
            continue
        seen.add(m)
        models.append(m)

    client = OpenAI(
        api_key=key,
        base_url=base,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )

    last_error = ""
    for model in models:
        for attempt in range(4):
            try:
                completion = client.chat.completions.create(
                    model=model,
                    messages=messages,
                )
            except APIConnectionError as exc:
                if attempt == 0:
                    time.sleep(1.0)
                    continue
                _circuit_failure()
                return f"LLM error: cannot reach Groq: {exc}"
            except APITimeoutError as exc:
                if attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                _circuit_failure()
                last_error = f"model '{model}' → timeout"
                break
            except APIStatusError as exc:
                status = exc.status_code
                if status in (401, 403):
                    _circuit_failure()
                    return (
                        f"LLM error: the Groq API key was denied access (HTTP {status}). "
                        "Check GROQ_API_KEY in .env for a valid key."
                    )
                if status == 404:
                    last_error = f"model '{model}' → HTTP 404: {exc.message}"
                    break
                if status == 429 or status >= 500:
                    if attempt < 3:
                        time.sleep(2 ** attempt)
                        continue
                    last_error = f"model '{model}' → HTTP {status}: {exc.message}"
                    _circuit_failure()
                    break
                _circuit_failure()
                return f"LLM error: Groq returned HTTP {status}: {exc.message}"
            except APIError as exc:
                if attempt < 3:
                    time.sleep(2 ** attempt)
                    continue
                _circuit_failure()
                last_error = f"model '{model}' → {exc}"
                break

            if not completion.choices:
                _circuit_failure()
                return f"LLM error: unexpected Groq response shape: no choices"
            text = (completion.choices[0].message.content or "").strip()
            _circuit_success()
            return text

    return (
        f"LLM error: all Groq model fallbacks failed. {last_error}"
    )


def _llm_provenance(answer: str) -> dict:
    ok = isinstance(answer, str) and not (
        answer.startswith("LLM error")
        or answer.startswith("LLM is not configured")
    )
    if not ok and isinstance(answer, str) and answer.startswith("LLM is not configured"):
        return provenance("CONFIG_ERROR", False, answer)
    return provenance("LIVE" if ok else "FALLBACK", ok, None if ok else answer)


def _rag(prompt: str, session_id: str):
    chunks = rag_engine.rag_engine.query_context(prompt, session_id)
    if not chunks:
        return prompt, []
    ctx = "\n\n".join(f"[{c['filename']}]\n{c['snippet']}" for c in chunks)
    return f"[CONTEXT]\n{ctx}\n\n[USER]\n{prompt}", chunks


def _extract_coords(prompt: str):
    m = re.search(r"([+-]?\d+\.\d+)\s*[, ]\s*([+-]?\d+\.\d+)", prompt)
    if m:
        try:
            lat, lon = float(m.group(1)), float(m.group(2))
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                return lat, lon
        except ValueError:
            pass
    return None


def _extract_coordinates(prompt: str):
    pair = _extract_coords(prompt)
    if pair:
        return {"lat": pair[0], "lon": pair[1]}
    return None


def _extract_multiple_locations(prompt: str) -> list[str]:
    names = re.findall(
        r"(?:in|at|for|near|around)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z'-]+)*)",
        prompt,
    )
    seen: list[str] = []
    for name in names:
        cleaned = " ".join(name.split()).strip(" ,;")
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen[:5]


_REQUEST_ID: str = ""
_SPATIAL_CACHE: dict[str, dict] = {}
_CONTEXT_CACHE: dict[str, dict] = {}


def set_request_id(request_id: str) -> None:
    global _REQUEST_ID
    _REQUEST_ID = request_id


def get_request_id() -> str:
    return _REQUEST_ID


def log_downstream_call(request_id: str, name: str) -> None:
    print(f"[llm_router] {request_id} -> {name}")


def answer_general_query(prompt: str) -> str:
    return _call_llm([
        {"role": "system", "content": "You are a helpful GeoAI assistant."},
        {"role": "user", "content": prompt},
    ])


_MAP_ACTIONS = (
    "FLY_TO",
    "TOGGLE_LAYER",
    "SHOW_PARCELS",
    "SHOW_FLOOD",
    "SHOW_WEATHER",
    "NONE",
)
_MAP_LAYERS = ("NDVI", "FLOOD", "WEATHER")


def _parse_structured_reply(raw: str) -> dict:
    result = {
        "reply_text": raw.strip(),
        "map_action": "NONE",
        "location_name": None,
        "lat": None,
        "lon": None,
        "layer_name": None,
    }
    marker = raw.strip()
    start = marker.find("{")
    end = marker.rfind("}")
    if start < 0 or end <= start:
        return result
    try:
        parsed = json.loads(marker[start:end + 1])
    except (ValueError, TypeError, json.JSONDecodeError):
        return result
    if isinstance(parsed, dict):
        text = parsed.get("reply_text")
        if isinstance(text, str) and text.strip():
            result["reply_text"] = text.strip()
        if parsed.get("map_action") in _MAP_ACTIONS:
            result["map_action"] = parsed["map_action"]
        name = parsed.get("location_name")
        if isinstance(name, str) and name.strip():
            result["location_name"] = name.strip()
        for key in ("lat", "lon"):
            try:
                result[key] = float(parsed.get(key))
            except (TypeError, ValueError):
                pass
        if parsed.get("layer_name") in _MAP_LAYERS:
            result["layer_name"] = parsed["layer_name"]
        if result["map_action"].startswith("SHOW_"):
            result["layer_name"] = {
                "SHOW_PARCELS": "PARCELS",
                "SHOW_FLOOD": "FLOOD",
                "SHOW_WEATHER": "WEATHER",
            }.get(result["map_action"])
    return result


def answer_general_query_structured(prompt: str, map_context: dict | None = None) -> dict:
    system = (
        "You are a helpful GeoAI assistant. Respond with only a single strict JSON object.\n"
        'Schema: {"reply_text": string, "map_action": "FLY_TO"|"TOGGLE_LAYER"|"SHOW_PARCELS"|"SHOW_FLOOD"|"SHOW_WEATHER"|"NONE", '
        '"location_name": string|null, "lat": number|null, "lon": number|null, '
        '"layer_name": "NDVI"|"FLOOD"|"WEATHER"|null}.\n'
        "reply_text is the conversational answer to the user. "
        "When the user names a place to look at, set map_action=FLY_TO and give its "
        "lat/lon (WGS84, longitude positive east) and location_name. "
        "When the user asks to show/toggle a map layer, set map_action=TOGGLE_LAYER and "
        "the matching layer_name (NDVI/FLOOD/WEATHER). "
        'When the user asks to show parcels, flood risk, or weather, set map_action=SHOW_PARCELS/SHOW_FLOOD/SHOW_WEATHER '
        "(and lat/lon/location_name when a place is named). "
        "Otherwise map_action=NONE and lat/lon/layer_name null."
    )
    if isinstance(map_context, dict):
        lat = map_context.get("lat")
        lon = map_context.get("lon")
        try:
            lat, lon = float(lat), float(lon)
        except (TypeError, ValueError):
            lat = lon = None
        if lat is not None and lon is not None:
            system += (
                f"\nThe user's current map center is {lat:.4f}, {lon:.4f}."
                " Always answer based on this location unless the user explicitly"
                " names a different city."
            )
    raw = _call_llm([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ])
    return _parse_structured_reply(raw)


def get_rag_context(prompt: str, session_id: str):
    return _rag(prompt, session_id)


def synthesize_agent_summary(user_prompt: str, spatial_data: dict,
                             ml_data: dict, vision_data: dict) -> str:
    return _call_llm([
        {"role": "system",
         "content": "You are a geospatial analyst. Summarize the analysis in 2-3 concise sentences."},
        {"role": "user", "content": json.dumps({
            "prompt": user_prompt,
            "spatial": spatial_data,
            "ml": ml_data,
            "vision": vision_data,
        }, default=str)},
    ])


def _local_spatial_fallback(prompt: str) -> dict:
    lower = prompt.lower()
    hazard = "general"
    for keyword, hazard_type in (
        ("landslide", "landslide"),
        ("cyclone", "cyclone"),
        ("drought", "drought"),
        ("wildfire", "wildfire"),
        ("urban", "urban_growth"),
        ("flood", "flood"),
    ):
        if keyword in lower:
            hazard = hazard_type
            break
    coords = _extract_coordinates(prompt)
    return {
        "location_name": None,
        "coordinates": coords,
        "hazard_type": hazard,
        "confidence": "MEDIUM",
        "source": "local",
    }


def _extract_spatial_intent_llm(prompt: str) -> dict:
    fallback = _local_spatial_fallback(prompt)
    try:
        reply = _call_llm([
            {"role": "system",
             "content": "Extract geospatial intent as JSON only: "
                        "{\"location_name\": str|null, \"coordinates\": {\"lat\": float, \"lon\": float}|null, "
                        "\"hazard_type\": \"flood\"|\"cyclone\"|\"landslide\"|\"wildfire\"|\"drought\"|\"urban_growth\"|\"general\", "
                        "\"confidence\": \"HIGH\"|\"MEDIUM\"|\"LOW\", \"source\": str}."},
            {"role": "user", "content": prompt},
        ])
        marker = reply.strip()
        start = marker.find("{")
        end = marker.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(marker[start:end + 1])
            merged = {**fallback, **parsed}
            intent = SpatialIntent(**merged).model_dump()
            intent["source"] = "groq"
            return intent
    except (ValueError, TypeError, json.JSONDecodeError):
        pass
    return fallback


def extract_cached_spatial_intent(prompt: str, session_id: str = "",
                                  enable_cache: bool = True,
                                  clear_cache: bool = False):
    key = f"{session_id or 'default'}::{prompt.strip().casefold()}"
    if clear_cache:
        _SPATIAL_CACHE.pop(key, None)
    if enable_cache and key in _SPATIAL_CACHE:
        return dict(_SPATIAL_CACHE[key]), True
    intent = _extract_spatial_intent_llm(prompt)
    if enable_cache:
        _SPATIAL_CACHE[key] = dict(intent)
    return intent, False


def save_cached_context(session_id: str, intent: dict, coordinates: dict,
                        natural_language_summary: str) -> None:
    _CONTEXT_CACHE[session_id or "default"] = {
        "intent": dict(intent),
        "coordinates": dict(coordinates),
        "summary": natural_language_summary,
    }


def clear_cached_context(session_id: str) -> dict:
    cleared = {"spatial": False, "context": False}
    if session_id:
        spatial = [k for k in _SPATIAL_CACHE if k.startswith(f"{session_id}::")]
        if spatial:
            for k in spatial:
                _SPATIAL_CACHE.pop(k, None)
            cleared["spatial"] = True
        cleared["context"] = _CONTEXT_CACHE.pop(session_id, None) is not None
    else:
        if _SPATIAL_CACHE:
            _SPATIAL_CACHE.clear()
            cleared["spatial"] = True
        if _CONTEXT_CACHE:
            _CONTEXT_CACHE.clear()
            cleared["context"] = True
    return cleared