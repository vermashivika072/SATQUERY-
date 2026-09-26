"""Cached place geocoding."""
from __future__ import annotations

from typing import Any

from app.services import weather_service


_CACHE: dict[str, dict[str, Any] | None] = {}


def geocode(
    name: str,
) -> dict[str, Any] | None:

    if not isinstance(name, str):
        return None

    cleaned = name.strip()

    if not cleaned:
        return None

    key = cleaned.casefold()

    # Use cached location
    if key in _CACHE:
        return _CACHE[key]

    # Search real location
    external = weather_service.geocode_location(
        cleaned
    )

    if not isinstance(external, dict):

        _CACHE[key] = None

        return None

    result = _result_from_external(
        cleaned,
        external,
    )

    _CACHE[key] = result

    return result


def _result_from_external(
    name: str,
    result: dict[str, Any],
) -> dict[str, Any] | None:

    try:

        latitude = float(
            result["lat"]
        )

        longitude = float(
            result["lon"]
        )

    except (
        KeyError,
        TypeError,
        ValueError,
    ):

        return None

    display_name = ", ".join(
        str(part)
        for part in (
            result.get("name"),
            result.get("state"),
            result.get("country"),
        )
        if part
    ) or name

    return {
        "name": str(
            result.get("name") or name
        ),
        "display_name": display_name,
        "latitude": latitude,
        "longitude": longitude,
        "bbox": None,
        "source": str(
            result.get(
                "provenance",
                "OPENWEATHER",
            )
        ),
    }


__all__ = ["geocode"]