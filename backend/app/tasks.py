from celery import Celery

from app.settings import Settings


def enqueue_task(settings: Settings, task_id: str) -> None:
    if settings.disable_celery:
        return
    celery_app = Celery("backend", broker=settings.broker_url)
    celery_app.send_task("app.tasks.execute_task", args=[task_id])


def cancel_task(settings: Settings, task_id: str) -> None:
    """Cancel a running Celery task"""
    if settings.disable_celery:
        return
    celery_app = Celery("backend", broker=settings.broker_url)
    # Revoke the task - terminate=True will kill the worker process if it's running
    celery_app.control.revoke(task_id, terminate=True, signal='SIGKILL')
