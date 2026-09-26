"""Unit tests for real COG conversion (no fallback copy)."""
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from app.services import cog_converter


@pytest.fixture
def raster(tmp_path):
    """Small synthetic single-band GeoTIFF."""
    path = tmp_path / "input.tif"
    height, width = 512, 512
    data = np.arange(height * width, dtype=np.uint8).reshape(height, width)
    data = data % 254  # keep within uint8
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="uint8",
        crs="EPSG:4326",
        transform=from_origin(0.0, 1.0, 0.01, 0.01),
    ) as dst:
        dst.write(data, 1)
    return path


def test_convert_produces_valid_cog(raster, tmp_path):
    target = tmp_path / "out_cog.tif"

    result = cog_converter.convert_to_cog(str(raster), str(target))

    assert result == str(target)
    assert target.exists()
    assert target.stat().st_size <= cog_converter.MAX_COG_BYTES
    validation = cog_converter.cog_validate(str(target))
    valid, errors, warnings = validation if isinstance(validation, tuple) else (validation, [], [])
    assert valid is True
    assert errors == []


def test_convert_missing_libs_raise(raster, tmp_path, monkeypatch):
    monkeypatch.setattr(cog_converter, "rasterio", None)
    monkeypatch.setattr(cog_converter, "cog_translate", None)
    monkeypatch.setattr(cog_converter, "cog_profiles", None)

    target = tmp_path / "out_cog.tif"
    with pytest.raises(RuntimeError, match="rasterio and rio-cogeo are required"):
        cog_converter.convert_to_cog(str(raster), str(target))
    assert not target.exists()  # no fallback byte-copy


def test_convert_missing_input_raises_file_not_found(tmp_path):
    target = tmp_path / "out_cog.tif"
    with pytest.raises(FileNotFoundError):
        cog_converter.convert_to_cog(str(tmp_path / "does-not-exist.tif"), str(target))
    assert not target.exists()


def test_oversize_cog_rejected(tmp_path):
    """Coarsely-incompressible raster that exceeds the 20MB cap must be refused."""
    path = tmp_path / "big_input.tif"
    height, width = 6000, 6000
    rng = np.random.default_rng(7)
    data = rng.integers(0, 256, size=(height, width), dtype=np.uint8)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="uint8",
        crs="EPSG:4326",
        transform=from_origin(0.0, 1.0, 0.001, 0.001),
    ) as dst:
        dst.write(data, 1)

    target = tmp_path / "big_cog.tif"
    with pytest.raises(RuntimeError, match="exceeds 20 MB cap"):
        cog_converter.convert_to_cog(str(path), str(target))
    assert not target.exists()