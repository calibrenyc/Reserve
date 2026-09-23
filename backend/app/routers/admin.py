from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.app.database import get_db, initialize_tenant_database, tenant_database_path
from backend.app.models import User, Location, UserLocation, Role, RolePermission, UserPermissionOverride, Organization
from backend.app.security import ALL_PERMISSIONS, hash_password, require, user_permissions, location_ids
import re

router = APIRouter(prefix="/api/admin", tags=["Administration"])

def serialize_user(user, db):
    return {"id": user.id, "first_name": user.first_name, "last_name": user.last_name, "full_name": user.full_name,
      "email": user.email, "role": user.role.upper(), "active": user.is_active, "is_platform_owner": user.is_platform_owner, "last_login_at": user.last_login_at,
      "location_ids": list(location_ids(user, db)), "permissions": sorted(user_permissions(user, db))}

@router.get("/me")
def me(user=Depends(require("dashboard.view")), db: Session = Depends(get_db)):
    assigned = location_ids(user, db)
    return {**serialize_user(user, db), "locations": [{"id": x.id, "name": x.name, "timezone": x.timezone} for x in db.query(Location).filter(Location.organization_id == user.organization_id, Location.is_active == True) if x.id in assigned], "organization": db.get(Organization, user.organization_id).name}

@router.get("/users")
def users(user=Depends(require("users.view")), db: Session = Depends(get_db)):
    return [serialize_user(x, db) for x in db.query(User).filter(User.organization_id == user.organization_id).order_by(User.created_at)]

class UserInput(BaseModel):
    first_name: str
    last_name: str
    email: str
    role: str = "MANAGER"
    password: Optional[str] = None
    active: bool = True
    location_ids: list[str] = []

@router.post("/users")
def create_user(payload: UserInput, actor=Depends(require("users.create")), db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email.lower()).first(): raise HTTPException(409, "Email is already in use")
    user = User(organization_id=actor.organization_id, first_name=payload.first_name, last_name=payload.last_name, full_name=f"{payload.first_name} {payload.last_name}", username=payload.email.lower(), email=payload.email.lower(), role=payload.role.upper(), password_hash=hash_password(payload.password or "ChangeMeNow!"), is_active=payload.active)
    db.add(user); db.flush(); update_assignments(user, payload.location_ids, db); db.commit(); return serialize_user(user, db)

def update_assignments(user, ids, db):
    valid = {x.id for x in db.query(Location).filter(Location.organization_id == user.organization_id)}
    if not set(ids).issubset(valid): raise HTTPException(400, "One or more locations are outside this organization")
    db.query(UserLocation).filter(UserLocation.user_id == user.id).delete()
    db.add_all([UserLocation(user_id=user.id, location_id=x) for x in ids])

@router.put("/users/{user_id}")
def update_user(user_id: str, payload: UserInput, actor=Depends(require("users.edit")), db: Session = Depends(get_db)):
    target = db.query(User).filter(User.id == user_id, User.organization_id == actor.organization_id).first()
    if not target: raise HTTPException(404, "User not found")
    for key in ("first_name", "last_name", "email", "role", "is_active"): setattr(target, key, getattr(payload, key) if key != "role" else payload.role.upper())
    target.full_name = f"{payload.first_name} {payload.last_name}"; target.username = payload.email.lower()
    if payload.password: target.password_hash = hash_password(payload.password)
    update_assignments(target, payload.location_ids, db); db.commit(); return serialize_user(target, db)

@router.put("/users/{user_id}/permissions")
def set_overrides(user_id: str, overrides: dict[str, bool], actor=Depends(require("users.manage_permissions")), db: Session = Depends(get_db)):
    target = db.query(User).filter(User.id == user_id, User.organization_id == actor.organization_id).first()
    if not target: raise HTTPException(404, "User not found")
    db.query(UserPermissionOverride).filter(UserPermissionOverride.user_id == user_id).delete()
    db.add_all([UserPermissionOverride(user_id=user_id, permission=k, allowed=v) for k,v in overrides.items() if k in ALL_PERMISSIONS]); db.commit()
    return serialize_user(target, db)

@router.get("/roles")
def roles(user=Depends(require("users.view")), db: Session = Depends(get_db)):
    return [{"id": r.id, "name": r.name, "description": r.description, "permissions": [p.permission for p in db.query(RolePermission).filter(RolePermission.role_id == r.id, RolePermission.allowed == True)]} for r in db.query(Role).filter(Role.organization_id == user.organization_id)]

@router.get("/locations")
def locations(user=Depends(require("locations.view")), db: Session = Depends(get_db)):
    return db.query(Location).filter(Location.organization_id == user.organization_id).all()

class LocationInput(BaseModel):
    name: str
    code: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    phone: Optional[str] = None
    timezone: str = "America/New_York"
    is_active: bool = True

@router.post("/locations")
def create_location(payload: LocationInput, actor=Depends(require("locations.create")), db: Session = Depends(get_db)):
    if not payload.name.strip(): raise HTTPException(400, "Location name is required")
    location = Location(organization_id=actor.organization_id, **payload.dict(exclude={"name"}), name=payload.name.strip())
    db.add(location); db.flush()
    # The person creating a restaurant needs immediate access to operate it.
    db.add(UserLocation(user_id=actor.id, location_id=location.id))
    db.commit(); db.refresh(location)
    return location

@router.put("/locations/{location_id}")
def update_location(location_id: str, payload: LocationInput, actor=Depends(require("locations.edit")), db: Session = Depends(get_db)):
    location = db.query(Location).filter(Location.id == location_id, Location.organization_id == actor.organization_id).first()
    if not location: raise HTTPException(404, "Location not found")
    for key, value in payload.dict().items(): setattr(location, key, value.strip() if key == "name" else value)
    if not location.name: raise HTTPException(400, "Location name is required")
    db.commit(); db.refresh(location)
    return location

@router.delete("/locations/{location_id}", status_code=204)
def archive_location(location_id: str, actor=Depends(require("locations.manage")), db: Session = Depends(get_db)):
    location = db.query(Location).filter(Location.id == location_id, Location.organization_id == actor.organization_id).first()
    if not location: raise HTTPException(404, "Location not found")
    location.is_active = False
    db.commit()

class OrganizationProvision(BaseModel):
    organization_name: str
    location_name: str
    admin_first_name: str
    admin_last_name: str
    admin_email: str
    admin_password: str

@router.post("/platform/organizations")
def provision_organization(payload: OrganizationProvision, actor=Depends(require("organization.manage")), db: Session = Depends(get_db)):
    """Reserve-only license provisioning. Each new organization receives its own DB."""
    if not actor.is_platform_owner:
        raise HTTPException(403, "Only the Reserve platform owner can provision organizations")
    if db.query(Organization).filter(Organization.name == payload.organization_name).first():
        raise HTTPException(409, "Organization already exists")
    database_key = re.sub(r"[^a-z0-9]+", "-", payload.organization_name.lower()).strip("-")
    if not database_key: raise HTTPException(400, "Organization name must include letters or numbers")
    suffix, base = 2, database_key
    while db.query(Organization).filter(Organization.database_key == database_key).first():
        database_key = f"{base}-{suffix}"; suffix += 1
    if db.query(User).filter(User.email == payload.admin_email.lower()).first(): raise HTTPException(409, "Admin email is already in use")
    organization = Organization(name=payload.organization_name, database_key=database_key)
    db.add(organization); db.flush()
    location = Location(organization_id=organization.id, name=payload.location_name)
    db.add(location); db.flush()
    owner_role = Role(organization_id=organization.id, name="OWNER", description="Organization administrator", is_system=True)
    manager_role = Role(organization_id=organization.id, name="MANAGER", description="Location manager", is_system=True)
    db.add_all([owner_role, manager_role]); db.flush()
    db.add_all([RolePermission(role_id=owner_role.id, permission=p, allowed=True) for p in ALL_PERMISSIONS])
    from backend.app.security import MANAGER_PERMISSIONS
    db.add_all([RolePermission(role_id=manager_role.id, permission=p, allowed=True) for p in MANAGER_PERMISSIONS])
    admin = User(organization_id=organization.id, first_name=payload.admin_first_name, last_name=payload.admin_last_name, full_name=f"{payload.admin_first_name} {payload.admin_last_name}", username=payload.admin_email.lower(), email=payload.admin_email.lower(), password_hash=hash_password(payload.admin_password), role="OWNER", is_active=True)
    db.add(admin); db.flush(); db.add(UserLocation(user_id=admin.id, location_id=location.id))
    db.commit()
    initialize_tenant_database(database_key)
    return {"organization_id": organization.id, "organization_name": organization.name, "database": tenant_database_path(database_key), "location_id": location.id, "admin_email": admin.email}
