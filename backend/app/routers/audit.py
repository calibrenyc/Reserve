from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import AuditLog

router = APIRouter(prefix="/api/audit-log", tags=["Audit Log"])

@router.get("")
def list_audit_logs(db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).all()
    return [
        {
            "id": l.id,
            "timestamp": l.timestamp.isoformat(),
            "user": l.user,
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "original_value": l.original_value,
            "new_value": l.new_value,
            "details": l.details
        } for l in logs
    ]

