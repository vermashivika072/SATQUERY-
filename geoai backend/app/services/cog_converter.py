"""Real COG conversion via rasterio + rio-cogeo (no fallback byte copy)."""
import logging
import os
from pathlib import Path

try:
    import rasterio
    from rio_cogeo.cogeo import cog_translate, cog_validate
    from rio_cogeo.profiles import cog_profiles
except Exception as err:  # keep the app importable; conversion hard-fails via RuntimeError
    rasterio = None
    cog_translate = None
    cog_validate = None
    cog_profiles = None
    _IMPORT_ERROR = err
else:
    _IMPORT_ERROR = None

if rasterio is not None:
    _bundled_proj = Path(rasterio.__file__).parent / "proj_data"
    if _bundled_proj.is_dir():
        # The PostGIS installer sets a machine-level PROJ_LIB to PostgreSQL's old-layout
        # proj.db, which rasterio's bundled PROJ rejects. Use rasterio's own bundled DB.
        os.environ["PROJ_DATA"] = str(_bundled_proj)
        os.environ["PROJ_LIB"] = str(_bundled_proj)

log = logging.getLogger(__name__)

MAX_COG_BYTES = 20 * 1024 * 1024


def _require_libs() -> None:
    if cog_translate is None or cog_profiles is None or rasterio is None:
        raise RuntimeError(
            "rasterio and rio-cogeo are required for COG conversion "
            f"(import failed: {_IMPORT_ERROR})"
        )


def _overview_level(width: int, height: int) -> int:
    """Pick overview levels so the full-res + overview pixel budget fits the 20MB cap."""
    budget = MAX_COG_BYTES // 8  # conservative bytes-per-pixel estimate
    pixels = width * height
    level = 0
    while pixels / (4 ** (level + 1)) > budget and level < 6:
        level += 1
    return max(level, 1)


def convert_to_cog(input_path: str, output_path: str) -> str:
    _require_libs()

    source = Path(input_path)
    target = Path(output_path)
    if not source.exists():
        raise FileNotFoundError(source)
    target.parent.mkdir(parents=True, exist_ok=True)

    with rasterio.open(source) as src:
        overview_level = _overview_level(src.width, src.height)

    profile = cog_profiles.get("deflate")
    profile.update({"blockxsize": 256, "blockysize": 256, "tiled": True})
    cog_translate(str(source), str(target), profile, quiet=True, overview_level=overview_level)

    try:
        validation = cog_validate(str(target))
    except Exception as err:
        target.unlink(missing_ok=True)
        raise RuntimeError(f"COG validation failed: {err}") from err
    if isinstance(validation, tuple):
        validation = validation[0] if validation else False
    if not validation:
        target.unlink(missing_ok=True)
        raise RuntimeError("COG validation failed; output is not a valid Cloud-Optimized GeoTIFF")

    size = target.stat().st_size
    if size > MAX_COG_BYTES:
        target.unlink(missing_ok=True)
        limit_mb = MAX_COG_BYTES // (1024 * 1024)
        raise RuntimeError(f"COG exceeds {limit_mb} MB cap ({size} bytes)")

    log.info("COG written %s (%s bytes, %s overview levels)", target, size, overview_level)
    return str(target)