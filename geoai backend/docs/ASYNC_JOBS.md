# Async Jobs (Celery E2E)

Long-running work (COG conversion, satellite vision, RAG ingestion) runs as
**jobs** so uploads return a `job_id` immediately and the frontend polls for
progress.

## API

| Method | Path                   | Purpose                                       |
| ------ | ---------------------- | --------------------------------------------- |
| POST   | `/api/v1/jobs`         | Create+dispatch a job (`kind` in `raster_conversion`, `vision_analysis`, `rag_ingest`). |
| GET    | `/api/v1/jobs`         | List the current user's jobs (newest first).  |
| GET    | `/api/v1/jobs/{id}`    | Poll job status/progress/result/error.        |
| DELETE | `/api/v1/jobs/{id}`    | Delete a job (owner only).                    |

Upload endpoints return `{asset_id, job_id, status: "processing"}`. The asset
raster endpoint (`POST /api/v1/assets/upload`) dispatches a
`raster.convert_to_cog` job that converts to COG, runs real band analysis
(REAL) or simulation fallback, and persists `cog_url + vision` in `job.result`.

## Tables

`jobs` (alembic revision `a1b2c3d4e5f6`): `id`, `user_id` (FK users),
`kind`, `status` (`pending`/`running`/`succeeded`/`failed`), `progress`
(0-100), `result JSONB`, `error JSONB`, `created_at`/`updated_at`.

## Dispatch: Celery vs local

The production path is Celery + a Redis broker (`redis://localhost:6379/0`),
with the three tasks in `app/workers/tasks/*` declared with
`autoretry_for=(OSError,), retry_backoff=True, max_retries=2`. Start a worker
with `celery -A app.workers.celery_app:celery_app worker -l info`.

**This development machine has no Redis broker and no Docker**, so
`app/workers/dispatch.py` pings Redis (30s cache) and, when unavailable, runs
the **same task bodies** on an in-process `ThreadPoolExecutor(max_workers=2)`.
Each created job carries `dispatch: "celery" | "local"` in the response so the
mode is always visible. Local mode attempts the work once; the Celery path
applies the declared autoretry. Both modes persist through the same
`job_service.run_job` (running -> succeeded/failed, structured `error`
records).

Run the real worker when a broker is present; the API layer is identical in
both modes, so a `GET /api/v1/jobs/{id}` poll is unchanged.

## Frontend

After each upload the app tracks the returned `job_id`, polls
`GET /api/v1/jobs/{id}` every **1 second**, and renders the ASYNC JOBS panel
(progress bar + status; green READY, red error message). Terminal jobs are
removed from the panel 15s after completion.

## Tests

`tests/test_jobs_flow.py` exercises the full lifecycle through the API:
upload -> job created -> poll to `succeeded` (result contains cog/vision),
task failure surface (rag ingest of a missing file -> `failed` + `error`),
owner isolation, and delete.