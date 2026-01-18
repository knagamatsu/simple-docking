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

## Parallel Development (git worktree)
- Use `git worktree` for parallel work; branch from `origin/develop`.
- Before starting work, run `git fetch origin --prune`.
- If work maps to a roadmap item, move it to "In Progress" and add a short owner/branch/worktree/started note.
- Each worktree must have its own `.env`; set a unique `EXTERNAL_PORT` and `COMPOSE_PROJECT_NAME`.
- Do not expose DB/Redis ports unless needed; if you do, set unique `DEV_DB_PORT` and `DEV_REDIS_PORT`.
- If running the Vite dev server outside Docker, choose a unique port (for example, `npm run dev -- --port 3002`).

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
- Use concise, imperative messages (e.g., "Add run status endpoint").
- Commit message format: Title + body explaining "why" rather than "what".
- PRs should include: summary, key changes, test results, and UI screenshots when UI changes are made.

## Branch Strategy

### Branch Structure
- `main`: Production-ready code (stable, deployable at any time)
- `develop`: Integration branch for development (latest features)
- `feature/*`: Feature development branches
- `fix/*`: Bug fix branches
- `docs/*`: Documentation-only changes

### Workflow

#### Starting New Work
```bash
# For new features
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

# For bug fixes
git checkout develop
git checkout -b fix/bug-description
```

#### Merging to develop
```bash
# When feature is complete
git checkout develop
git merge feature/your-feature-name --no-ff
git push origin develop
```

#### Releasing to main
```bash
# When develop is stable and ready for release
git checkout main
git merge develop --no-ff
git tag -a v0.x.0 -m "Release v0.x.0"
git push origin main --tags
```

### Branch Naming Conventions
- `feature/ketcher-editor` - New features
- `fix/worker-segfault` - Bug fixes
- `docs/deploy-demo` - Documentation improvements
- `refactor/api-structure` - Code refactoring

### Rules
- Never commit directly to `main`
- `develop` is the default branch for development
- Feature branches branch off from `develop`
- Merge to `develop` first, then to `main` when ready for release
- Delete feature branches after merging
- Tag releases on `main` branch

### GitHub Actions Integration
- Push to `develop`: Runs tests only
- Push to `main`: Runs tests + builds release
- Tag `v*`: Triggers full release workflow (Docker images + installer)

## Configuration & Security Notes
- Use `.env.example` as a template for runtime config.
- Object store and protein library are mounted paths; do not accept arbitrary file paths from clients.
