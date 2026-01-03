import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings
from app.models import Base


@pytest.fixture()
def app():
    settings = Settings(
        database_url="sqlite+pysqlite://",
        broker_url="redis://localhost:6379/0",
        object_store_path="/tmp/object_store",
        protein_library_path="/tmp/protein_library",
        disable_celery=True,
        seed_proteins_on_startup=False,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.engine)
    return app


@pytest.fixture()
def client(app):
    with TestClient(app) as client:
        yield client


@pytest.fixture()
def db_session(app):
    session_factory = app.state.session_factory
    with session_factory() as session:
        yield session
        session.commit()
