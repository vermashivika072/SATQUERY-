# Security Posture

Status of the SatQuery backend as of Phase H. This document records controls that
are **implemented and verified**, gaps that are **documented and accepted**, and the
items a production operator must change before public deployment.

## Authentication

- Passwords are bcrypt-hashed (`app/core/security.py`); only the first 72 bytes are
  used (bcrypt limit), matching the model constraints.
- Sessions are JWT-based (`python-jose`, HS/RS via `JWT_ALGORITHM`), stored in two
  `HttpOnly` cookies:
  - `access_token` — short-lived (`ACCESS_TOKEN_EXPIRE_MINUTES`, default 30 min),
  - `refresh_token` — long-lived (`REFRESH_TOKEN_EXPIRE_DAYS`, default 7 days).
- Cookies are `HttpOnly`, `SameSite=Lax`, optional `Secure` (`COOKIE_SECURE=true` in
  production behind TLS) and optional `Domain` (`COOKIE_DOMAIN`).
- Logout-all bumps `users.token_version`; both token claims (`tv`) and the DB value
  must match on every `get_current_user`/refresh, so old tokens are revoked
  immediately on `POST /auth/logout-all`.
- Login is rate-limited per IP: 5 attempts / 60 s (in-memory `FixedWindowLimiter`,
  `app/core/rate_limit.py`). **Limitation**: the limiter is process-local — multi-worker
  or multi-instance deployments must move it to Redis or a shared store (note: a Redis
  broker already exists for the Celery integration in `app/workers/`).

## Session management / CSRF

- `SameSite=Lax` mitigates most cross-site POST CSRF. For defense-in-depth the app
  ships an **optional Origin check middleware** (`app/core/middleware.py`):
  - Enabled with `ORIGIN_CHECK_ENABLED=true`.
  - For state-changing requests (POST/PUT/PATCH/DELETE) it verifies the `Origin`
    (falling back to `Referer`) against `CORS_ORIGINS` or same-origin with the `Host`
    header. Non-browser clients (curl, scripts, server-to-server) send no Origin and
    pass through, so API usage is unaffected. `GET`/`HEAD`/`OPTIONS` (CORS preflight)
    are exempt.
  - **Disabled by default in development** because `SameSite=Lax` already covers the
    primary browser vector; enabling it in production is recommended.

## Authorization / ownership

- Every user-owned route checks `asset.user_id == user.id` (or the corresponding
  `chat_id`, `job_id`, `message_id`) and returns `404` rather than `403` so foreign
  resource IDs cannot be enumerated.
- `GET /api/v1/assets/{asset_id}/download` is ownership-checked and streams the
  object with verified `Content-Length`; there is **no** raw key-based download
  endpoint (removed in Phase G). S3/MinIO deployments use presigned URLs instead.
- Roles: `admin` / `analyst` via JWT `role` claim; no privilege escalation paths
  currently exist in code.

## File handling / uploads

- Upload size is capped (`MAX_UPLOAD_MB`) and enforced via the spooled temp-file size
  before any write (both `/assets/upload` and the legacy `upload-satellite-image`).
- Filenames are sanitized (basename only, safe chars) before use in object keys and
  COG paths (`_safe_filename` / `_safe_stem` in `app/api/v1/assets.py`).
- Local object store (`app/services/storage.py`) confines reads/writes under the
  storage root (`_assert_local_path`); tests cover path-traversal attempts.
- Kind/extension allowlists on raster inputs; unknown kinds are rejected.

## Secrets & configuration

- No secrets are committed. Config comes from environment variables
  (`app/core/config.py`); defaults are dev-only and `ENVIRONMENT=production` forces
  safe values (e.g. debug off).
- `JWT_SECRET` must be ≥ 32 chars; rotate it, `GROQ_API_KEY`,
  `OPENWEATHER_API_KEY` and the Postgres password before production (see
  **Credential rotation** below and `docs/CREDENTIALS.md` — our credential runbook).
- Production checklist: set `ENVIRONMENT=production`, `JWT_SECRET`, `POSTGRES_*`,
  `OPENWEATHER_API_KEY`, `GROQ_API_KEY`, `COOKIE_SECURE=true`, TLS termination at a
  reverse proxy, `ORIGIN_CHECK_ENABLED=true`.

## Known, accepted gaps (honest)

- **Static COG tiles** (`/static/cogs/...`) are served unauthenticated. They are
  UUID-keyed and generated only from user-uploaded assets, but any client that knows a
  URL can fetch a tile image; the raw GeoTIFF only leaves via the authenticated
  download route. Image tiles cannot carry browser auth headers, so this is a
  deliberate trade-off.
- **LLM (Groq)** is currently **not configured** (`GROQ_API_KEY` empty) — the
  orchestrator falls back to heuristics and reports provenance accordingly
  (`REAL`/`HEURISTIC`/`SIMULATED`/`UNAVAILABLE`). Set a free key from
  https://console.groq.com/keys to enable it (see `docs/CREDENTIALS.md`).
- **`land_parcels` / `flood_hazards`** tables do not exist; parcels provenance is
  `UNAVAILABLE`, flood risk is labeled `HEURISTIC` (see `docs/FLOOD_RISK.md`).
- **At-rest encryption**: none for local files or the Postgres DB — appropriate for a
  dev machine on a personal desktop; must be addressed before production.
- **Admin surface**: there is an `admin` role claim but no user-management endpoints
  yet; bootstrap an admin manually.
- **SameSite="lax" + cookie auth** means a bearer-style API-token client would not pair
  well with browser auth; currently one identity model is used for both.

## Incident-response notes

- No secrets to redact from logs by default (JWT payloads are never logged as whole
  tokens; project `structlog` request logging logs paths/status only).
- Downgrade path: `logout-all` bumps `token_version`, instantly invalidating all of a
  user's sessions.