import os
import re
from contextvars import ContextVar
from typing import Optional
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, Session, with_loader_criteria

# Set by the authenticated HTTP middleware.  This keeps location isolation in
# the data layer so a missed filter in an operational router cannot leak data.
current_organization_id: ContextVar[Optional[str]] = ContextVar("current_organization_id", default=None)
current_location_id: ContextVar[Optional[str]] = ContextVar("current_location_id", default=None)
current_database_key: ContextVar[Optional[str]] = ContextVar("current_database_key", default=None)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
DB_DIR = os.path.join(DATA_DIR, "database")
os.makedirs(DB_DIR, exist_ok=True)

DB_PATH = os.path.join(DB_DIR, "reserve_app.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

TENANT_DB_DIR = os.path.join(DATA_DIR, "organizations")
os.makedirs(TENANT_DB_DIR, exist_ok=True)
_tenant_engines = {}

def tenant_database_path(database_key: str) -> str:
    if not re.fullmatch(r"[a-z0-9_-]+", database_key):
        raise ValueError("Invalid organization database key")
    return os.path.join(TENANT_DB_DIR, f"{database_key}.db")

def tenant_engine(database_key: str):
    """Return the isolated database engine for one licensed organization."""
    if database_key not in _tenant_engines:
        _tenant_engines[database_key] = create_engine(f"sqlite:///{tenant_database_path(database_key)}", connect_args={"check_same_thread": False})
    return _tenant_engines[database_key]

def initialize_tenant_database(database_key: str):
    engine_for_tenant = tenant_engine(database_key)
    Base.metadata.create_all(bind=engine_for_tenant, checkfirst=True)
    return engine_for_tenant

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

LOCATION_SCOPED_TABLES = {"invoices", "invoice_lines", "inventory_count_templates", "inventory_counts", "inventory_transactions", "waste_logs", "sales_imports", "deposits", "audit_logs"}
ORG_SCOPED_TABLES = LOCATION_SCOPED_TABLES | {"vendors", "inventory_items", "recipes"}

@event.listens_for(Session, "do_orm_execute")
def enforce_tenant_scope(execute_state):
    if not execute_state.is_select or execute_state.execution_options.get("skip_tenant_scope"):
        return
    org_id, location_id = current_organization_id.get(), current_location_id.get()
    if not org_id: return
    # Import lazily: models imports Base from this module.
    from backend.app import models
    options = []
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if getattr(cls, "__tablename__", None) in ORG_SCOPED_TABLES and hasattr(cls, "organization_id"):
            options.append(with_loader_criteria(cls, lambda c, value=org_id: c.organization_id == value, include_aliases=True))
        if location_id and getattr(cls, "__tablename__", None) in LOCATION_SCOPED_TABLES and hasattr(cls, "location_id"):
            options.append(with_loader_criteria(cls, lambda c, value=location_id: c.location_id == value, include_aliases=True))
    if options: execute_state.statement = execute_state.statement.options(*options)

@event.listens_for(Session, "before_flush")
def stamp_tenant_scope(session, flush_context, instances):
    org_id, location_id = current_organization_id.get(), current_location_id.get()
    if not org_id: return
    for obj in session.new:
        if getattr(obj, "__tablename__", None) in ORG_SCOPED_TABLES:
            if not getattr(obj, "organization_id", None): obj.organization_id = org_id
            if getattr(obj, "__tablename__", None) in LOCATION_SCOPED_TABLES and not getattr(obj, "location_id", None): obj.location_id = location_id

def get_db():
    database_key = current_database_key.get()
    db = sessionmaker(autocommit=False, autoflush=False, bind=tenant_engine(database_key))() if database_key else SessionLocal()
    try:
        yield db
    finally:
        db.close()
