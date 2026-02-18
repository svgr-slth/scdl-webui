from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[str] = mapped_column(String, nullable=False)  # playlist, artist_tracks, artist_all, likes, user_reposts
    local_folder: Mapped[str] = mapped_column(String, nullable=False)
    audio_format: Mapped[str] = mapped_column(String, default="mp3")
    name_format: Mapped[str | None] = mapped_column(String, nullable=True)
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    original_art: Mapped[bool] = mapped_column(Boolean, default=True)
    extract_artist: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    sync_runs: Mapped[list["SyncRun"]] = relationship(back_populates="source", cascade="all, delete-orphan")
