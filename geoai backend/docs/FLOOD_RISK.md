# Flood Risk Model

## Status: HEURISTIC — not a machine-learning model

`app/services/ml_predictor.predict_flood_risk(lat, lon, elevation_m, ...)` computes a
flood risk score from a **weighted, transparent formula**. It deliberately is **not**
advertised as ML:

- The audit explicitly called out relabeling over posing a placeholder model — an ML
  model requires a labeled flood dataset which is not currently available.

## Inputs (with fixed weights)

| Input                 | Weight  | Why it scales |
| --------------------- | ------- | ------------- |
| Precipitation (`/250mm`) | 45%  | Heavy rainfall drives pluvial flooding. |
| Elevation (`120m−x`)      | 25%  | Low terrain floods first. |
| River proximity (`5km−x`) | 15%  | Near-river sites are exposed to fluvial flooding. |
| Soil saturation (0..1)    | 15%  | Saturated soil sheds runoff. |

Score = 0..100 → `LOW` (0-19) / `MEDIUM` (20-49) / `HIGH` (50-79) / `CRITICAL` (80+).

Live precipitation is pulled from the OpenWeather probe at the query coordinates
(`weather_service.get_current_weather`); the other three inputs are caller-supplied
(defaults: elevation 35 m, river 1.0 km, saturation 0.5).

## Provenance

Every result carries `provenance.source = "HEURISTIC"`, `live = False`, and a note:
*"weighted formula, no ML model"*. The frontend renders this as the **Heuristic Flood
Risk** amber badge and the telemetry label reads **HEURISTIC FLOOD RISK**.

## API key stability

The response key remains `flood_risk_heuristic` (honest by name). The Python function
was renamed from `predict_flood_risk_heuristic` to `predict_flood_risk`.

## Future: a real model (Option 2)

A genuine ML flood model would need, at minimum:
1. A labeled training set (observed flood/non-flood outcomes + covariates such as
   elevation, slope, land use, precipitation, soil type).
2. A defined target metric and validation protocol (cannot validate the model before
   training data exists).
3. A model artifact with versioning and, ideally, a calibration step before any UI
   claims change from `HEURISTIC` to `ML`.