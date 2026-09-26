"""Real raster vision analysis: NDVI / NDWI water from actual bands."""
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from app.services import vision_engine


@pytest.fixture
def realimage(tmp_path):
    """Synthetic 3-band raster tagged as B3 green / B4 red / B8 NIR (Sentinel-2 style).

    Vegetated lower half (low red, high NIR), water upper half (high green, low NIR).
    """
    path = tmp_path / "scene.tif"
    h = w = 256
    rng = np.random.default_rng(3)
    red = rng.integers(0, 60, (h, w), dtype=np.uint16)
    nir = rng.integers(0, 60, (h, w), dtype=np.uint16)
    green = rng.integers(0, 60, (h, w), dtype=np.uint16)
    half = h // 2
    red[half:] = rng.integers(0, 30, (half, w), dtype=np.uint16)
    nir[half:] = rng.integers(220, 255, (half, w), dtype=np.uint16)
    green[:half] = rng.integers(220, 255, (half, w), dtype=np.uint16)
    nir[:half] = rng.integers(0, 30, (half, w), dtype=np.uint16)

    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=3,
        dtype="uint16",
        crs="EPSG:4326",
        transform=from_origin(77.0, 23.5, 0.01, 0.01),
    ) as dst:
        dst.write(red, 1)
        dst.write(nir, 2)
        dst.write(green, 3)
        for idx, ident in ((1, "B4"), (2, "B8"), (3, "B3")):
            dst.set_band_description(idx, ident)
    return path


def test_real_analysis_detects_vegetation_and_water(realimage):
    result = vision_engine.analyze_satellite_imagery(str(realimage))

    assert result["observation_status"] == "REAL"
    assert result["is_real"] is True
    assert result["provenance"]["source"] == "LIVE"
    assert result["provenance"]["live"] is True
    assert result["ndvi_vegetation_index"] > 0.2  # vegetation half dominates
    assert result["vegetation_fraction"] > 0.3
    assert result["water_fraction"] > 0.3
    assert result["ndwi_water_index"] > 0.0
    assert result["bands_used"]["red"] == 1
    assert result["bands_used"]["nir"] == 2
    assert result["bands_used"]["green"] == 3


def test_real_analysis_rejects_missing_bands(tmp_path):
    path = tmp_path / "singleband.tif"
    h = w = 64
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=h,
        width=w,
        count=1,
        dtype="uint8",
        crs="EPSG:4326",
        transform=from_origin(0.0, 1.0, 0.01, 0.01),
    ) as dst:
        dst.write(np.zeros((h, w), dtype=np.uint8), 1)

    with pytest.raises(ValueError, match="red .*NIR"):
        vision_engine.analyze_satellite_imagery(str(path))


def test_real_analysis_missing_file_raises(tmp_path):
    with pytest.raises(Exception):
        vision_engine.analyze_satellite_imagery(str(tmp_path / "nope.tif"))


def test_find_cog_for_asset_returns_none_on_missing_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(vision_engine, "find_cog_for_asset", lambda _: None)
    assert vision_engine.find_cog_for_asset("missing-asset") is None