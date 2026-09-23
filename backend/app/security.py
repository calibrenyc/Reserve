"""Authentication and authorization primitives shared by every API surface."""
import base64, hashlib, hmac, json, os, secrets
from typing import Optional
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import User, Role, RolePermission, UserPermissionOverride, UserLocation

ALL_PERMISSIONS = [
    "dashboard.view", "invoices.view", "invoices.create", "invoices.edit", "invoices.delete", "invoices.approve",
    "inventory.view", "inventory.manage", "inventory.count", "inventory.adjust", "inventory.approve_adjustments",
    "transfers.view", "transfers.create", "transfers.approve", "waste.view", "waste.create", "waste.edit", "waste.approve", "waste.delete",
    "recipes.view", "recipes.manage", "recipes.view_costs", "sales.view", "sales.import", "sales.manage",
    "deposits.view", "deposits.create", "deposits.edit", "deposits.approve", "financials.view", "financials.view_costs",
    "financials.view_vendor_spend", "financials.view_food_cost", "financials.view_avt", "financials.view_deposits", "financials.export",
    "reports.view", "reports.financial", "reports.export", "vendors.view", "vendors.manage", "users.view", "users.create",
    "users.edit", "users.deactivate", "users.manage_permissions", "locations.view", "locations.create", "locations.edit",
    "locations.manage", "organization.view", "organization.manage", "audit.view", "settings.view", "settings.manage",
    "backups.create", "backups.restore"
    , "items.view", "items.lookup", "items.create", "items.edit", "items.archive", "items.manage_categories", "items.manage_units", "items.manage_conversions", "items.import"
]
MANAGER_PERMISSIONS = {
    "dashboard.view", "invoices.view", "invoices.create", "invoices.edit", "inventory.view", "inventory.manage",
    "inventory.count", "inventory.adjust", "transfers.view", "transfers.create", "waste.view", "waste.create", "waste.edit",
    "recipes.view", "recipes.manage", "recipes.view_costs", "sales.view", "sales.import", "sales.manage", "deposits.view",
    "deposits.create", "deposits.edit", "vendors.view", "vendors.manage", "reports.view", "financials.view_costs",
    "financials.view_food_cost", "financials.view_deposits", "items.lookup"
}
# Reserve is a local-first app.  A stable development fallback keeps active
# browser sessions valid across ordinary local server restarts; deployments can
# and should provide RESERVE_AUTH_SECRET explicitly.
SECRET = os.environ.get("RESERVE_AUTH_SECRET") or "reserve-local-development-secret"

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return "pbkdf2_sha256$310000$%s$%s" % (base64.b64encode(salt).decode(), base64.b64encode(digest).decode())

def verify_password(password: str, encoded: Optional[str]) -> bool:
    try:
        _, rounds, salt, digest = encoded.split("$")
        result = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(rounds))
        return hmac.compare_digest(result, base64.b64decode(digest))
    except (ValueError, AttributeError): return False

def make_token(user: User) -> str:
    payload = {"sub": user.id, "exp": int((datetime.utcnow() + timedelta(hours=12)).timestamp())}
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).rstrip(b"=")
    sig = hmac.new(SECRET.encode(), body, hashlib.sha256).digest()
    return (body + b"." + base64.urlsafe_b64encode(sig).rstrip(b"=")).decode()

def token_user(token: str, db: Session) -> User:
    try:
        body, signature = token.encode().split(b".")
        expected = hmac.new(SECRET.encode(), body, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, base64.urlsafe_b64decode(signature + b"=" * (-len(signature) % 4))): raise ValueError()
        payload = json.loads(base64.urlsafe_b64decode(body + b"=" * (-len(body) % 4)))
        if payload["exp"] < datetime.utcnow().timestamp(): raise ValueError()
        user = db.get(User, payload["sub"])
        if not user or not user.is_active: raise ValueError()
        return user
    except Exception: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

def user_permissions(user: User, db: Session) -> set[str]:
    role = db.query(Role).filter(Role.organization_id == user.organization_id, Role.name == user.role.upper()).first()
    permissions = {x.permission for x in db.query(RolePermission).filter(RolePermission.role_id == role.id, RolePermission.allowed == True)} if role else set()
    for override in db.query(UserPermissionOverride).filter(UserPermissionOverride.user_id == user.id):
        if override.allowed: permissions.add(override.permission)
        else: permissions.discard(override.permission)
    return permissions

def location_ids(user: User, db: Session) -> set[str]:
    return {row.location_id for row in db.query(UserLocation).filter(UserLocation.user_id == user.id)}

def require(permission: str):
    def checker(request: Request, db: Session = Depends(get_db)):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        user = token_user(token, db)
        if permission not in user_permissions(user, db):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
        return user
    return checker
