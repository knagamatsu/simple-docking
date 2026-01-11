# Architecture

This repository is a monorepo for a docking-evaluation dashboard.

## Components
- **gateway**: Nginx reverse proxy for unified external access (port 8090).
- **frontend**: React UI for the 4-step flow and dashboard (Ketcher 2D editor for ligand input).
- **backend**: FastAPI API for runs, tasks, ligands, and proteins.
- **worker**: Celery worker that executes docking pipelines and writes results.
- **broker**: Valkey/Redis for task queue.
- **db**: PostgreSQL for metadata and state.
- **object_store**: Local volume for docking inputs/outputs and logs.

## Flow
1. User submits ligand input.
2. Backend stores ligand and enqueues conformer/docking tasks in Celery.
3. Worker processes tasks and updates DB with results and logs.
4. Frontend polls run status and fetches results for visualization.

## Storage
- DB: structured metadata for ligands/runs/tasks/results.
- object_store: larger files (pdb/pose/logs).

## Configuration
- All services are configurable via `.env` file (see `docs/configuration.md`).
- Key settings: port numbers, database credentials, task timeouts, CORS, rate limits.
- Default configuration suitable for development; production requires security hardening.

## Extensibility
- Protein library is managed by `protein_library/manifest.json`.
- Advanced pipeline steps (pocket detection, Vina) are isolated in the worker.
- Environment-based configuration allows customization without code changes.
