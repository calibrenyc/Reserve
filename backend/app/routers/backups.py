from fastapi import APIRouter, HTTPException
from typing import List, Optional
from backend.app.services.backup_service import BackupService

router = APIRouter(prefix="/api/backups", tags=["Backups"])

@router.get("")
def list_backups():
    return BackupService.list_backups()

@router.post("/create")
def create_backup(filename: Optional[str] = None):
    try:
        backup_path = BackupService.create_backup(filename)
        return {"message": "Backup created successfully", "backup_path": backup_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/restore")
def restore_backup(filename: str):
    try:
        BackupService.restore_backup(filename)
        return {"message": f"Successfully restored backup {filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

