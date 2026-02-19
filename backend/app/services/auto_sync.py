import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.database import async_session
from app.models.global_settings import GlobalSetting

logger = logging.getLogger(__name__)


class AutoSyncScheduler:
    def __init__(self):
        self._task: asyncio.Task | None = None
        self._enabled: bool = False
        self._interval_minutes: int = 60
        self.next_sync_at: datetime | None = None

    async def _load_settings(self) -> None:
        async with async_session() as db:
            enabled_row = await db.get(GlobalSetting, "auto_sync_enabled")
            interval_row = await db.get(GlobalSetting, "auto_sync_interval_minutes")
            self._enabled = enabled_row is not None and enabled_row.value == "true"
            self._interval_minutes = (
                int(interval_row.value)
                if interval_row and interval_row.value
                else 60
            )

    async def start(self) -> None:
        """Load settings from DB and start the loop if enabled."""
        await self._load_settings()
        if self._enabled:
            self._start_loop()
            logger.info(
                "Auto-sync started: every %d minutes", self._interval_minutes
            )

    async def update(self, enabled: bool, interval_minutes: int) -> None:
        """Called when settings change. Restarts the loop with new values."""
        self._enabled = enabled
        self._interval_minutes = interval_minutes

        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None
            self.next_sync_at = None

        if enabled:
            self._start_loop()
            logger.info(
                "Auto-sync updated: every %d minutes", interval_minutes
            )
        else:
            logger.info("Auto-sync disabled")

    def stop(self) -> None:
        """Cancel the background loop (called on app shutdown)."""
        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None
        self.next_sync_at = None

    def _start_loop(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def _loop(self) -> None:
        from app.services.sync_manager import sync_manager

        try:
            while True:
                self.next_sync_at = datetime.now(timezone.utc) + timedelta(
                    minutes=self._interval_minutes
                )
                await asyncio.sleep(self._interval_minutes * 60)

                # Re-check settings from DB
                await self._load_settings()
                if not self._enabled:
                    self.next_sync_at = None
                    break

                if sync_manager.is_syncing:
                    logger.info("Auto-sync skipped: a sync is already running")
                    continue

                logger.info("Auto-sync triggered")
                asyncio.create_task(sync_manager.start_sync_all())
        except asyncio.CancelledError:
            pass
        finally:
            self.next_sync_at = None


auto_sync_scheduler = AutoSyncScheduler()
