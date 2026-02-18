from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models.source import Source
from app.models.sync_run import SyncRun
from app.models.global_settings import GlobalSetting

__all__ = ["Base", "Source", "SyncRun", "GlobalSetting"]
