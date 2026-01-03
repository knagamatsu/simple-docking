FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv==0.9.9

COPY pyproject.toml uv.lock /app/
RUN uv sync --frozen --no-install-project

COPY app /app/app

ENV PYTHONPATH=/app
ENV PATH="/app/.venv/bin:$PATH"

CMD ["celery", "-A", "app.tasks", "worker", "--loglevel=INFO"]
