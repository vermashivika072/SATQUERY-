"""Honest flood risk modelling: heuristic, not ML."""
import pytest

from app.services import ml_predictor


def test_predict_flood_risk_returns_honest_heuristic():
    result = ml_predictor.predict_flood_risk(28.6139, 77.2090, elevation_m=35.0)

    assert result["risk_score"] >= 0.0 and result["risk_score"] <= 100.0
    assert result["risk_level"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
    assert result["warning_message"]
    assert isinstance(result["weather"], dict)
    assert result["provenance"]["source"] == "HEURISTIC"
    assert result["provenance"]["live"] is False
    assert "no ML model" in result["provenance"]["note"]


def test_predict_flood_risk_clamps_dimensionless_inputs():
    low = ml_predictor.predict_flood_risk(0.0, 0.0, elevation_m=500.0, precipitation_mm=0.0)
    high = ml_predictor.predict_flood_risk(0.0, 0.0, elevation_m=0.0, precipitation_mm=250.0,
                                           river_distance_km=0.0, soil_saturation=1.0)
    assert low["risk_score"] < high["risk_score"]


def test_old_heuristic_name_removed():
    assert not hasattr(ml_predictor, "predict_flood_risk_heuristic")