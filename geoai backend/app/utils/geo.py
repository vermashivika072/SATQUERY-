import math


def offset_coordinate(lat: float, lon: float, north_m: float, east_m: float) -> tuple[float, float]:
    """Return new (lat, lon) after moving north/east by meters."""
    dlat = north_m / 111320.0
    dlon = east_m / (111320.0 * max(math.cos(math.radians(lat)), 0.01))
    return lat + dlat, lon + dlon


def bounding_box_around(lat: float, lon: float, radius_meters: float) -> tuple[float, float, float, float]:
    """Return (minx, miny, maxx, maxy) around a point."""
    dlat = radius_meters / 111320.0
    dlon = radius_meters / (111320.0 * max(math.cos(math.radians(lat)), 0.01))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))