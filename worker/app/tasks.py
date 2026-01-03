from celery import Celery

from app.db import create_engine_from_settings, create_session_factory
from app.models import Task
from app.pipeline import execute_task as pipeline_execute_task
from app.settings import Settings

settings = Settings()
celery_app = Celery("worker", broker=settings.broker_url)
celery_app.conf.update(
    task_soft_time_limit=settings.task_timeout_seconds,
    task_time_limit=settings.task_timeout_seconds + 30,
    task_acks_late=True,
    broker_connection_retry_on_startup=True,
)


def _get_task(session_factory, task_id: str):
    with session_factory() as session:
        return session.get(Task, task_id)


@celery_app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": settings.max_retries},
    retry_backoff=True,
)
def execute_task(self, task_id: str):
    engine = create_engine_from_settings(settings)
    session_factory = create_session_factory(engine)

    task = _get_task(session_factory, task_id)
    if not task:
        return

    with session_factory() as session:
        task = session.get(Task, task_id)
        if not task:
            return
        pipeline_execute_task(settings, session, task)
