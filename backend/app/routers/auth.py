from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.database import get_db
from backend.app.models import User, Location
from backend.app.security import verify_password, make_token, user_permissions, location_ids

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
class Credentials(BaseModel):
    email: str
    password: str

@router.post("/login")
def login(credentials: Credentials, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == credentials.email.lower(), User.is_active == True).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    user.last_login_at = datetime.utcnow(); db.commit()
    locations = db.query(Location).filter(Location.organization_id == user.organization_id, Location.is_active == True).all()
    assigned = location_ids(user, db)
    return {"access_token": make_token(user), "token_type": "bearer", "user": {"id": user.id, "name": user.full_name, "email": user.email, "role": user.role.upper(), "permissions": sorted(user_permissions(user, db)), "locations": [{"id": l.id, "name": l.name, "timezone": l.timezone} for l in locations if l.id in assigned]}}
