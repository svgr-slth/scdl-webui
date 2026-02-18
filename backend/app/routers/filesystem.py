import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/filesystem", tags=["filesystem"])


@router.get("/browse")
async def browse_directory(path: str = Query("/")):
    """List directories at the given path for the folder picker."""
    target = Path(path).expanduser()

    if not target.is_absolute():
        raise HTTPException(400, "Path must be absolute")
    if not target.exists():
        raise HTTPException(404, f"Path does not exist: {path}")
    if not target.is_dir():
        raise HTTPException(400, f"Path is not a directory: {path}")

    dirs: list[dict] = []
    try:
        for entry in sorted(target.iterdir()):
            if entry.name.startswith("."):
                continue
            if entry.is_dir():
                try:
                    # Check if we can read the directory
                    os.listdir(entry)
                    dirs.append({"name": entry.name, "path": str(entry)})
                except PermissionError:
                    pass
    except PermissionError:
        raise HTTPException(403, f"Permission denied: {path}")

    parent = str(target.parent) if target != target.parent else None

    return {
        "current": str(target),
        "parent": parent,
        "directories": dirs,
    }
