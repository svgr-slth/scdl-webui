from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class GlobalSetting(Base):
    __tablename__ = "global_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
