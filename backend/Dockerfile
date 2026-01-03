FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv==0.9.9

COPY pyproject.toml uv.lock /app/
RUN uv sync --frozen --no-install-project

COPY app /app/app
COPY alembic.ini /app/alembic.ini
COPY migrations /app/migrations

ENV PYTHONPATH=/app
ENV PATH="/app/.venv/bin:$PATH"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
