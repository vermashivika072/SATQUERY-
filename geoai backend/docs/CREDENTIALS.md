# Credential rotation runbook

Which credentials exist, their current verified state (as of Phase I), and the exact
steps to rotate each one. **Never commit `.env`, and never paste a secret into chat,
logs, or this file.**

Reference table of keys in `geoai backend/.env`:

| Credential            | .env key                | Verified state (Phase I)                              |
|-----------------------|-------------------------|-------------------------------------------------------|
| JWT signing secret    | `JWT_SECRET`            | 62 chars, ≥32 ok; rotated to a fresh 64-char value in Phase I |
| Postgres app user     | `DATABASE_URL`, `POSTGRES_*` | local PostGIS; HEALTH `ok`                      |
| Groq (LLM)            | `GROQ_API_KEY`          | not set — free key from https://console.groq.com/keys |
| OpenWeather           | `OPENWEATHER_API_KEY`   | **working** (LIVE, HTTP 200)                            |
| S3 / MinIO (optional) | `S3_*`                  | not configured (local storage mode)                    |

After editing `.env`, restart the backend:

```powershell
# from geoai backend/
$c = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($c) { $c.OwningProcess | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force } }
Start-Process python -ArgumentList "-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8000" -WorkingDirectory (Get-Location) -WindowStyle Hidden
```

---

## 1. JWT_SECRET (done in Phase I — repeat any time)

Generate with a cryptographically random source and set it in `.env`:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

- Must be ≥ 32 chars; the config validator refuses to start with the default
  `dev-secret-change-me` unless `ENVIRONMENT=development` and `DEBUG=true`.
- **Impact**: rotating invalidates every existing session (old `access_token` /
  `refresh_token` signatures fail → clients get 401 and must log in again). This is
  the point of rotation. Verify below.

Verification (nothing may be printed raw): re-login flow must pass —
`POST /api/v1/auth/login` → 200 + cookies, `GET /api/v1/auth/me` → 200; a request with
an old pre-rotation cookie → 401.

## 2. Groq LLM (USER ACTION — free tier)

The app calls Groq's OpenAI-compatible endpoint. Configuration in `.env`:

| .env key      | Value                                |
|---------------|--------------------------------------|
| `GROQ_API_KEY`  | free key from https://console.groq.com/keys |
| `LLM_BASE_URL`  | `https://api.groq.com/openai/v1`     |
| `LLM_MODEL`     | `llama-3.3-70b-versatile`            |

1. Create a free account at https://console.groq.com/keys and copy a key.
2. Set `GROQ_API_KEY=<key>` in `.env` (do not change `LLM_BASE_URL`/`LLM_MODEL`
   unless you want another OpenAI-compatible provider or model).
3. Restart and verify:
   - `GET /api/v1/health/ready` → `llm_configured: true`;
   - a chat/geo query returns `source: "REAL"` / `llm` provenance instead of the
     heuristic fallback.

Notes:
- The router falls back through models in order: `LLM_MODEL`,
  `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`.
- A circuit breaker trips after 5 consecutive failures (60 s cooldown), so a bad
  key or no key degrades gracefully with `LLM error: ...` messages and
  `provenance.source: FALLBACK`.
- **Setting `GROQ_API_KEY` to a placeholder or leaving it empty keeps the app fully
  functional with heuristic fallbacks** (flood, weather, spatial intent are local).

## 3. OpenWeather (working — renew at will)

1. Generate a new key at https://home.openweathermap.org/api_keys.
2. Replace `OPENWEATHER_API_KEY` in `.env`.
3. Restart; verify `GET /api/v1/health/ready` → `weather_configured: true`, and a
   `weather` query returns `source: OPENWEATHER`, `provenance.source: LIVE`.

## 4. Postgres (USER ACTION)

The app connects with the credentials inside `DATABASE_URL`. `POSTGRES_*` are for
docker-compose only and must match.

```sql
-- psql as superuser
ALTER USER geoai WITH PASSWORD '<new strong password>';
```

Then edit `.env`:
- `DATABASE_URL=postgresql://geoai:<new strong password>@localhost:5432/<db>`
- `POSTGRES_PASSWORD=<new strong password>`

Restart and verify `GET /api/v1/health/ready` → `database: ok`.

## 5. S3 / MinIO (optional, not in use)

Fill `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and restart;
`/health/ready` reports `storage_configuration` and `storage_mode` flips to S3.

---

## Hygiene

- `.env` must never be committed; the source tree currently holds no secrets in code
  (verified by a Phase I source scan). If you ever commit `.env`, rotate everything
  in the table.
- Rotate `JWT_SECRET` immediately if it leaks or is committed, and all sessions die —
  run `/auth/logout-all`-style token-version bump is not needed; rotation alone
  invalidates signatures.
- Emergency downgrade: `POST /auth/logout-all` bumps `users.token_version`, instantly
  revoking every session without changing secrets.