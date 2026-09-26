"""Satellite imagery analysis: real raster spectral stats or deterministic simulation."""
import hashlib
import math
import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.provenance import provenance


def simulate_satellite_imagery(image_url: str | None = None, lat: float | None = None, lon: float | None = None) -> dict:
    seed = hashlib.sha256(f"{image_url}|{lat}|{lon}".encode()).hexdigest()
    tropical = max(0.0, 1.0 - abs(lat or 0.0) / 35.0)
    coastal = (math.sin(math.radians((lon or 0.0) * 1.7)) + 1.0) / 2.0
    noise = int(seed[:8], 16) / 0xFFFFFFFF

    cloud = _clamp(8 + tropical * 34 + coastal * 18 + noise * 22, 3, 96)
    water = _clamp(0.35 + tropical * 3.4 + coastal * 2.1 + noise * 4.8, 0.05, 18)
    ndvi = _clamp(0.18 + tropical * 0.32 + (1 - cloud / 100) * 0.18 - water * 0.012, -0.1, 0.86)

    return {
        "cloud_cover_percentage": round(cloud, 1),
        "detected_water_bodies_km2": round(water, 2),
        "ndvi_vegetation_index": round(ndvi, 2),
        "satellite_source": "Sentinel-2 / Landsat-8",
        "observation_status": "SIMULATED",
        "is_real": False,
        "provenance": provenance("SIMULATED", False, "deterministic formula, no satellite data stream"),
    }


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _band_indexes(src) -> dict[str, int]:
    """Map Sentinel-2 style bands (B2 blue, B3 green, B4 red, B8/B8A NIR) to rasterio band numbers."""
    found: dict[str, int] = {}
    descriptions = list(src.descriptions or [])
    for offset, idx in enumerate(src.indexes):
        tags = src.tags(idx)
        ident = str(tags.get("id") or "").upper().strip()
        desc = str(descriptions[offset] if offset < len(descriptions) else "").lower()
        if not ident:
            match = re.match(r"^b([0-9a]+)$", desc.strip())
            if match:
                ident = "B" + match.group(1).upper()
        color = next(
            (w for w in ("coastal", "blue", "green", "red edge", "red", "nir", "swir") if w in desc),
            None,
        )
        if ident.startswith("B8A"):
            color = "nir"
        elif ident == "B8":
            color = "nir"
        elif ident == "B4":
            color = "red"
        elif ident == "B3":
            color = "green"
        elif ident == "B2":
            color = "blue"
        elif ident == "B1":
            color = "coastal"
        elif ident in {"B6", "B7", "B11", "B12"}:
            color = "swir"
        elif ident.startswith("B5"):
            color = "red edge"
        if color:
            found.setdefault(color, idx)
    return found


def analyze_satellite_imagery(image_path: str) -> dict:
    """Real spectral analysis of a provided raster (Sentinel-2 band convention).

    Computes NDVI from B4 (red) / B8 (NIR) and NDWI water index from B3 (green) /
    B8 (NIR), plus vegetation/water fractions and an area estimate.

    Raises RuntimeError if rasterio is unavailable and ValueError if the raster
    lacks the red and NIR bands required for NDVI.
    """
    try:
        import numpy as np
        import rasterio
    except Exception as err:
        raise RuntimeError(f"rasterio is required for real satellite analysis: {err}") from err

    with rasterio.open(str(image_path)) as src:
        bands = _band_indexes(src)
        red_idx = bands.get("red")
        nir_idx = bands.get("nir")
        green_idx = bands.get("green")
        if red_idx is None or nir_idx is None:
            raise ValueError(
                "raster lacks the red (B4) and NIR (B8) bands required for NDVI analysis "
                f"(found band ids: {sorted(bands)})"
            )

        red = src.read(red_idx).astype("float32")
        nir = src.read(nir_idx).astype("float32")
        denom = nir + red
        ndvi = np.where(denom > 0, (nir - red) / denom, np.nan)

        if green_idx is not None:
            green = src.read(green_idx).astype("float32")
            ndwi = np.where((green + nir) > 0, (green - nir) / (green + nir), np.nan)
            water_bands = [green_idx, nir_idx]
        else:
            ndwi = np.where(denom > 0, (red - nir) / denom, np.nan)
            water_bands = [red_idx, nir_idx]

        valid_count = float(np.count_nonzero(~np.isnan(ndvi))) or 1.0
        ndvi_mean = float(np.nanmean(ndvi)) if np.count_nonzero(~np.isnan(ndvi)) else 0.0
        ndwi_mean = float(np.nanmean(ndwi)) if np.count_nonzero(~np.isnan(ndwi)) else 0.0
        veg_fraction = float(np.count_nonzero((~np.isnan(ndvi)) & (ndvi > 0.2))) / valid_count
        water_mask = (~np.isnan(ndwi)) & (ndwi > 0.0)
        water_fraction = float(np.count_nonzero(water_mask)) / valid_count
        cloud_fraction = float(np.count_nonzero(red >= 250)) / valid_count

        water_km2: float | None = None
        try:
            res_x = abs(src.transform.a)
            res_y = abs(src.transform.e)
            epsg = src.crs.to_epsg() if src.crs else None
            mean_lat = (src.bounds.bottom + src.bounds.top) / 2.0
            if epsg == 4326 and res_x and res_y:
                m_y = 111_320.0
                m_x = 111_320.0 * math.cos(math.radians(mean_lat))
                pix_km2 = (res_x * m_x) * (res_y * m_y) / 1e6
            elif epsg:
                pix_km2 = (res_x * res_y) / 1e6
            else:
                pix_km2 = None
            if pix_km2:
                water_km2 = float(np.count_nonzero(water_mask)) * pix_km2
        except Exception:
            water_km2 = None

        transform = [float(getattr(src.transform, a)) for a in ("a", "b", "d", "e")]

    return {
        "cloud_cover_percentage": round(cloud_fraction * 100.0, 1),
        "detected_water_bodies_km2": round(water_km2, 4) if water_km2 is not None else None,
        "ndvi_vegetation_index": round(ndvi_mean, 2),
        "ndwi_water_index": round(ndwi_mean, 3),
        "vegetation_fraction": round(veg_fraction, 3),
        "water_fraction": round(water_fraction, 3),
        "bands_used": {
            "green": green_idx or None,
            "red": red_idx,
            "nir": nir_idx,
            "water_bands": water_bands,
        },
        "bands_available": sorted(bands),
        "transform": transform,
        "satellite_source": "analyzed raster bands (B4 red / B8 NIR)",
        "observation_status": "REAL",
        "is_real": True,
        "provenance": provenance("LIVE", True, "spectral analysis of the provided raster bands"),
    }


def find_cog_for_asset(asset_id: str) -> Path | None:
    cog_dir = Path(__file__).resolve().parents[1] / "static" / "cogs"
    candidates = sorted(cog_dir.glob(f"{asset_id}_*_cog.tif"))
    return candidates[0] if candidates else None


def analyze_cog_for_asset(db: Session, user_id, asset_id: str) -> dict | None:
    """Resolve asset_id -> owned asset -> its COG, and run real analysis.

    Returns None (caller falls back to simulation) if the asset is not found,
    is not owned by the user, has no COG on disk, or analysis fails.
    """
    from app.db.models.asset import Asset

    try:
        asset = db.query(Asset).filter(Asset.id == str(asset_id), Asset.user_id == user_id).first()
    except Exception:
        return None
    if not asset:
        return None
    cog = find_cog_for_asset(str(asset.id))
    if cog is None:
        return None
    try:
        return analyze_satellite_imagery(str(cog))
    except Exception:
        return None