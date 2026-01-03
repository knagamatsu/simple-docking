# Repository Guidelines

## Project Structure & Module Organization
- `backend/`: FastAPI API, DB models, migrations, and tests (`backend/tests/`).
- `worker/`: Celery worker and docking pipeline (`worker/app/`).
- `frontend/`: React UI (Vite) in `frontend/src/` with pages/components.
- `protein_library/`: Protein assets and `manifest.json`.
- `data/object_store/`: Runtime outputs (poses/logs) mounted by Docker.
- `docs/`: Architecture and license notes.

## Build, Test, and Development Commands
- `docker compose up --build -d`: Build and start all services (UI on `http://localhost:3001`).
- `docker compose ps`: Check container status.
- `docker compose logs -f api`: Tail API logs for request errors.
- `cd backend && uv run --extra test pytest`: Run backend tests.
- `cd frontend && npm install && npm run dev`: Run UI locally (port `3000` inside container, `3001` on host via compose).

## Coding Style & Naming Conventions
- Python: 4 spaces, type hints where practical, snake_case for functions/vars, PascalCase for classes.
- JavaScript/React: 2 spaces, camelCase for variables, PascalCase for components.
- Keep API schemas in `backend/app/schemas.py` and DB models in `backend/app/models.py`.
- Avoid non-ASCII unless already present in a file.

## Testing Guidelines
- Framework: `pytest` for backend.
- Name tests as `test_*.py`; focus on API flows and error cases.
- Follow TDD: add/adjust tests before changing API behavior.
- Example: `backend/tests/test_runs.py` covers run creation and status.

## Commit & Pull Request Guidelines
- No established commit message convention yet (no commits in repo). Use concise, imperative messages (e.g., “Add run status endpoint”).
- PRs should include: summary, key changes, test results, and UI screenshots when UI changes are made.

## Configuration & Security Notes
- Use `.env.example` as a template for runtime config.
- Object store and protein library are mounted paths; do not accept arbitrary file paths from clients.
