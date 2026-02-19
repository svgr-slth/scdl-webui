import asyncio
import json
import logging
import os
import shutil
from pathlib import Path

from sqlalchemy import select

from app.database import async_session
from app.models.global_settings import GlobalSetting
from app.models.source import Source

logger = logging.getLogger(__name__)


class LibraryMover:
    def __init__(self):
        self._ws_manager = None
        self._task: asyncio.Task | None = None
        self.total_files: int = 0
        self.moved_files: int = 0
        self.current_file: str = ""
        self.status: str = "idle"
        self.error: str | None = None
        self.log_lines: list[str] = []

    @property
    def is_moving(self) -> bool:
        return self._task is not None and not self._task.done()

    def set_ws_manager(self, ws_manager):
        self._ws_manager = ws_manager

    async def _broadcast(self, message: dict):
        if self._ws_manager:
            await self._ws_manager.broadcast(0, message)

    async def _log(self, line: str):
        self.log_lines.append(line)
        await self._broadcast({"type": "log", "line": line})

    async def pre_check(self, old_root: Path, new_root: Path) -> dict:
        """Check what would be moved. Returns counts for the confirmation dialog."""
        async with async_session() as db:
            result = await db.execute(select(Source))
            sources = result.scalars().all()

        total_files = 0
        total_size = 0
        source_count = 0

        for source in sources:
            folder = old_root / source.local_folder
            if folder.exists():
                file_count = 0
                folder_size = 0
                for f in folder.rglob("*"):
                    if f.is_file():
                        file_count += 1
                        folder_size += f.stat().st_size
                if file_count > 0:
                    source_count += 1
                    total_files += file_count
                    total_size += folder_size

        return {
            "source_count": source_count,
            "total_files": total_files,
            "total_size": total_size,
            "needs_move": total_files > 0,
        }

    def start_move(self, old_root: Path, new_root: Path, archives_root: Path):
        if self.is_moving:
            raise RuntimeError("A move is already in progress")
        # Reset state
        self.total_files = 0
        self.moved_files = 0
        self.current_file = ""
        self.status = "idle"
        self.error = None
        self.log_lines = []
        self._task = asyncio.create_task(self._run_move(old_root, new_root, archives_root))

    async def _run_move(self, old_root: Path, new_root: Path, archives_root: Path):
        try:
            # Phase 1: Scan
            self.status = "scanning"
            await self._broadcast({"type": "status", "status": "scanning"})
            await self._log(f"Scanning files in {old_root}...")

            async with async_session() as db:
                result = await db.execute(select(Source))
                sources = list(result.scalars().all())

            move_plan: list[tuple[Source, Path, Path]] = []
            all_files: list[tuple[Path, Path]] = []

            for source in sources:
                old_folder = old_root / source.local_folder
                new_folder = new_root / source.local_folder
                if old_folder.exists():
                    has_files = False
                    for f in old_folder.rglob("*"):
                        if f.is_file():
                            rel = f.relative_to(old_folder)
                            all_files.append((f, new_folder / rel))
                            has_files = True
                    if has_files:
                        move_plan.append((source, old_folder, new_folder))

            self.total_files = len(all_files)
            await self._log(f"Found {len(all_files)} files across {len(move_plan)} sources")
            await self._broadcast({
                "type": "progress", "current": 0, "total": len(all_files),
            })

            if len(all_files) == 0:
                await self._update_setting(new_root)
                self.status = "completed"
                await self._log("No files to move. Setting updated.")
                await self._broadcast({"type": "status", "status": "completed"})
                return

            # Phase 2: Move
            self.status = "moving"
            await self._broadcast({"type": "status", "status": "moving"})

            same_fs = self._is_same_filesystem(old_root, new_root)

            for source, old_folder, new_folder in move_plan:
                await self._log(f"Moving {source.name}...")

                if same_fs:
                    new_folder.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        await asyncio.to_thread(old_folder.rename, new_folder)
                        # Count files for this source
                        count = sum(
                            1 for f, _ in all_files
                            if str(f).startswith(str(old_folder) + os.sep)
                            or str(f).startswith(str(old_folder))
                            and f.parent == old_folder
                        )
                        self.moved_files += count
                        await self._broadcast({
                            "type": "progress",
                            "current": self.moved_files,
                            "total": self.total_files,
                        })
                        continue
                    except OSError:
                        await self._log("  Rename failed, falling back to copy...")

                # Slow path: copy file by file
                for old_file, new_file in all_files:
                    if not self._is_under(old_file, old_folder):
                        continue
                    self.current_file = old_file.name
                    new_file.parent.mkdir(parents=True, exist_ok=True)
                    await asyncio.to_thread(shutil.copy2, str(old_file), str(new_file))
                    # Verify
                    new_size = await asyncio.to_thread(lambda: new_file.stat().st_size)
                    old_size = await asyncio.to_thread(lambda: old_file.stat().st_size)
                    if new_size != old_size:
                        raise RuntimeError(f"Size mismatch after copy: {old_file}")
                    self.moved_files += 1
                    if self.moved_files % 10 == 0 or self.moved_files == self.total_files:
                        await self._broadcast({
                            "type": "progress",
                            "current": self.moved_files,
                            "total": self.total_files,
                        })

            # Phase 3: Rewrite filemaps
            self.status = "rewriting"
            await self._broadcast({"type": "status", "status": "rewriting"})
            await self._log("Rewriting filemaps...")

            old_root_str = str(old_root)
            new_root_str = str(new_root)

            for source, _, _ in move_plan:
                filemap_path = archives_root / f"source-{source.id}-filemap.json"
                if filemap_path.exists():
                    try:
                        raw = await asyncio.to_thread(filemap_path.read_text)
                        filemap: dict[str, str] = json.loads(raw)
                        rewritten = {
                            tid: fp.replace(old_root_str, new_root_str, 1)
                            for tid, fp in filemap.items()
                        }
                        await asyncio.to_thread(
                            filemap_path.write_text,
                            json.dumps(rewritten, indent=2),
                        )
                        await self._log(f"  Rewrote filemap for {source.name} ({len(rewritten)} entries)")
                    except (json.JSONDecodeError, OSError) as e:
                        await self._log(f"  WARNING: Failed to rewrite filemap for {source.name}: {e}")

            # Phase 4: Cleanup old folders (only for cross-device moves)
            if not same_fs:
                await self._log("Cleaning up old location...")
                for _, old_folder, _ in move_plan:
                    if old_folder.exists():
                        await asyncio.to_thread(shutil.rmtree, str(old_folder))

            # Phase 5: Update setting in DB
            await self._update_setting(new_root)

            self.status = "completed"
            await self._log(f"Library move completed: {self.moved_files} files moved")
            await self._broadcast({"type": "status", "status": "completed"})

        except Exception as e:
            self.status = "failed"
            self.error = str(e)
            await self._log(f"ERROR: {e}")
            await self._broadcast({
                "type": "status", "status": "failed", "error": str(e),
            })
            logger.exception("Library move failed")

    async def _update_setting(self, new_root: Path):
        async with async_session() as db:
            existing = await db.get(GlobalSetting, "music_root")
            if existing:
                existing.value = str(new_root)
            else:
                db.add(GlobalSetting(key="music_root", value=str(new_root)))
            await db.commit()

    @staticmethod
    def _is_same_filesystem(path1: Path, path2: Path) -> bool:
        try:
            path2.mkdir(parents=True, exist_ok=True)
            return os.stat(path1).st_dev == os.stat(path2).st_dev
        except OSError:
            return False

    @staticmethod
    def _is_under(child: Path, parent: Path) -> bool:
        try:
            child.relative_to(parent)
            return True
        except ValueError:
            return False


library_mover = LibraryMover()
