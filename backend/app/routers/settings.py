from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.global_settings import GlobalSetting
from app.schemas.settings import SettingsRead, SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])

SETTING_KEYS = ["auth_token", "default_audio_format", "default_name_format"]


async def _get_all_settings(db: AsyncSession) -> dict[str, str | None]:
    result = await db.execute(select(GlobalSetting))
    rows = result.scalars().all()
    return {r.key: r.value for r in rows}


@router.get("", response_model=SettingsRead)
async def get_settings(db: AsyncSession = Depends(get_db)):
    settings = await _get_all_settings(db)
    return SettingsRead(
        auth_token=settings.get("auth_token"),
        default_audio_format=settings.get("default_audio_format", "mp3"),
        default_name_format=settings.get("default_name_format"),
    )


@router.put("", response_model=SettingsRead)
async def update_settings(payload: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    for key, value in payload.model_dump(exclude_unset=True).items():
        existing = await db.get(GlobalSetting, key)
        if existing:
            existing.value = value
        else:
            db.add(GlobalSetting(key=key, value=value))
    await db.commit()
    settings = await _get_all_settings(db)
    return SettingsRead(
        auth_token=settings.get("auth_token"),
        default_audio_format=settings.get("default_audio_format", "mp3"),
        default_name_format=settings.get("default_name_format"),
    )
