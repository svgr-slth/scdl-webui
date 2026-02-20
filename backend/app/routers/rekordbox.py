from fastapi import APIRouter, HTTPException

from app.schemas.rekordbox import RekordboxExportResult, RekordboxStatus
from app.services import rekordbox_exporter

router = APIRouter(prefix="/api/rekordbox", tags=["rekordbox"])


@router.post("/{source_id}/collection", response_model=RekordboxExportResult)
async def export_to_collection(source_id: int):
    try:
        return await rekordbox_exporter.export_to_collection(source_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.post("/{source_id}/playlist", response_model=RekordboxExportResult)
async def export_as_playlist(source_id: int):
    try:
        return await rekordbox_exporter.export_as_playlist(source_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@router.get("/discover")
async def discover_xml():
    """Scan default OS paths for existing Rekordbox XML files."""
    paths = rekordbox_exporter.discover_xml_paths()
    return {"detected_paths": paths}


@router.get("/status", response_model=RekordboxStatus)
async def get_status():
    return await rekordbox_exporter.get_status()
