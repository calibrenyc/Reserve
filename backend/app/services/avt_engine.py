from decimal import Decimal
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
import datetime

from backend.app.database import current_location_id
from backend.app.models import (
    InventoryItem, UnitConversion, InventoryTransaction, WasteLog,
    Recipe, RecipeIngredient, SalesLine, InventoryCount, InventoryCountLine
)

class AvTEngine:
    _UOM_ALIASES = {
        "EACH": "EA", "EACHES": "EA", "UNIT": "EA", "UNITS": "EA",
        "CASE": "CS", "CASES": "CS", "CARTON": "BTL", "BOTTLE": "BTL",
        "BOTTLES": "BTL", "POUCH": "PK", "POUCHES": "PK", "PACK": "PK",
        "PACKS": "PK", "PACKET": "PK", "PACKETS": "PK", "SLEEVE": "SLV",
        "SLEEVES": "SLV", "POUND": "LB", "POUNDS": "LB", "OUNCE": "OZ",
        "OUNCES": "OZ", "FLUID OUNCE": "FL_OZ", "FLUID OUNCES": "FL_OZ",
        "FL OZ": "FL_OZ", "FLOZ": "FL_OZ", "GALLON": "GAL", "GALLONS": "GAL",
    }

    @staticmethod
    def normalize_uom(uom: str) -> str:
        value = (uom or "").strip().upper().replace("-", "_")
        return AvTEngine._UOM_ALIASES.get(value, value)

    @staticmethod
    def get_safe_unit_conversion_factor(db: Session, item_id: str, from_uom: str, to_uom: str) -> Optional[Decimal]:
        """Return a proven conversion factor, or None when no safe path exists.

        This is deliberately separate from the historic helper below: inventory
        transaction callers retain their legacy behavior while recipes never get
        to price an unknown conversion as one-to-one.
        """
        source, target = AvTEngine.normalize_uom(from_uom), AvTEngine.normalize_uom(to_uom)
        if not source or not target:
            return None
        if source == target:
            return Decimal("1")

        conversions = db.query(UnitConversion).filter(UnitConversion.inventory_item_id == item_id).all()
        graph = {}
        for row in conversions:
            start, end = AvTEngine.normalize_uom(row.from_uom), AvTEngine.normalize_uom(row.to_uom)
            factor = Decimal(str(row.factor))
            if not start or not end or factor <= 0:
                continue
            graph.setdefault(start, []).append((end, factor))
            graph.setdefault(end, []).append((start, Decimal("1") / factor))

        # Mathematical conversions are valid only inside the same dimension.
        standard = {
            "LB": ("weight", Decimal("453.59237")), "OZ": ("weight", Decimal("28.349523125")),
            "G": ("weight", Decimal("1")), "KG": ("weight", Decimal("1000")),
            "GAL": ("volume", Decimal("3785.411784")), "QT": ("volume", Decimal("946.352946")),
            "PT": ("volume", Decimal("473.176473")), "FL_OZ": ("volume", Decimal("29.5735295625")),
            "ML": ("volume", Decimal("1")), "L": ("volume", Decimal("1000")),
        }
        if source in standard and target in standard and standard[source][0] == standard[target][0]:
            return standard[source][1] / standard[target][1]

        pending, visited = [(source, Decimal("1"))], set()
        while pending:
            unit, factor = pending.pop(0)
            if unit in visited:
                continue
            if unit == target:
                return factor
            visited.add(unit)
            pending.extend((next_unit, factor * next_factor) for next_unit, next_factor in graph.get(unit, []) if next_unit not in visited)
        return None

    @staticmethod
    def get_unit_conversion_factor(db: Session, item_id: str, from_uom: str, to_uom: str) -> Decimal:
        """Finds conversion factor to convert from_uom quantity to to_uom quantity."""
        if not from_uom or not to_uom or from_uom.upper() == to_uom.upper():
            return Decimal("1.0")

        safe_factor = AvTEngine.get_safe_unit_conversion_factor(db, item_id, from_uom, to_uom)
        if safe_factor is not None:
            return safe_factor

        # Check direct conversion
        conv = db.query(UnitConversion).filter(
            UnitConversion.inventory_item_id == item_id,
            func.upper(UnitConversion.from_uom) == from_uom.upper(),
            func.upper(UnitConversion.to_uom) == to_uom.upper()
        ).first()

        if conv:
            return Decimal(str(conv.factor))

        # Check inverse conversion
        conv_inv = db.query(UnitConversion).filter(
            UnitConversion.inventory_item_id == item_id,
            func.upper(UnitConversion.from_uom) == to_uom.upper(),
            func.upper(UnitConversion.to_uom) == from_uom.upper()
        ).first()

        if conv_inv and conv_inv.factor != 0:
            return Decimal("1.0") / Decimal(str(conv_inv.factor))

        # Follow a product's packaging chain, e.g. CS -> SLV -> EA.  Packaging
        # differs by item, so conversions are never hard-coded globally.
        conversions = db.query(UnitConversion).filter(UnitConversion.inventory_item_id == item_id).all()
        graph = {}
        for row in conversions:
            source, target, factor = row.from_uom.upper(), row.to_uom.upper(), Decimal(str(row.factor))
            graph.setdefault(source, []).append((target, factor))
            if factor: graph.setdefault(target, []).append((source, Decimal("1") / factor))
        pending, visited = [(from_uom.upper(), Decimal("1"))], set()
        while pending:
            unit, factor = pending.pop(0)
            if unit in visited: continue
            if unit == to_uom.upper(): return factor
            visited.add(unit)
            pending.extend((next_unit, factor * next_factor) for next_unit, next_factor in graph.get(unit, []) if next_unit not in visited)

        # Special common units fallback
        f_u = from_uom.upper()
        t_u = to_uom.upper()
        if f_u == "OZ" and t_u == "LB":
            return Decimal("0.0625")  # 1 oz = 1/16 lb
        elif f_u == "LB" and t_u == "OZ":
            return Decimal("16.0")

        return Decimal("1.0")

    @staticmethod
    def calculate_avt(db: Session, start_date: datetime.date, end_date: datetime.date, category_filter: Optional[str] = None, location_id: Optional[str] = None):
        location_id = location_id if location_id is not None else current_location_id.get()
        transaction_ids = {row[0] for row in db.query(InventoryTransaction.inventory_item_id).execution_options(skip_tenant_scope=True).filter(
            InventoryTransaction.location_id == location_id
        ).distinct().all()}
        count_ids = {row[0] for row in db.query(InventoryCountLine.inventory_item_id).execution_options(skip_tenant_scope=True).join(InventoryCount).filter(
            InventoryCount.location_id == location_id
        ).distinct().all()}
        # Catalog records may originate at another restaurant.  Include only
        # records that have inventory activity at the selected location.
        items_query = db.query(InventoryItem).execution_options(skip_tenant_scope=True).filter(
            InventoryItem.is_active == True, InventoryItem.id.in_(transaction_ids | count_ids)
        )
        if category_filter:
            items_query = items_query.filter(InventoryItem.category == category_filter)
            
        items = items_query.all()
        results = []

        total_actual_cost = Decimal("0.00")
        total_theo_cost = Decimal("0.00")
        total_dollar_var = Decimal("0.00")

        for item in items:
            unit_cost = Decimal(str(item.current_cost or 0.0))
            
            # 1. Beginning Inventory (Last count prior or at start_date)
            beg_count_line = db.query(InventoryCountLine).execution_options(skip_tenant_scope=True).join(InventoryCount).filter(
                InventoryCountLine.inventory_item_id == item.id,
                InventoryCount.location_id == location_id,
                func.date(InventoryCount.count_date) <= start_date,
                InventoryCount.status == "Approved"
            ).order_by(InventoryCount.count_date.desc()).first()

            beg_qty = Decimal(str(beg_count_line.base_quantity)) if beg_count_line else Decimal("0.0")

            # 2. Purchases during period
            purchases = db.query(func.coalesce(func.sum(InventoryTransaction.converted_base_quantity), 0.0)).execution_options(skip_tenant_scope=True).filter(
                InventoryTransaction.inventory_item_id == item.id,
                InventoryTransaction.location_id == location_id,
                InventoryTransaction.transaction_type == "Purchase",
                func.date(InventoryTransaction.timestamp) >= start_date,
                func.date(InventoryTransaction.timestamp) <= end_date
            ).scalar()
            purch_qty = Decimal(str(purchases))

            # 3. Transfers In / Out
            trans_in = Decimal(str(db.query(func.coalesce(func.sum(InventoryTransaction.converted_base_quantity), 0.0)).execution_options(skip_tenant_scope=True).filter(
                InventoryTransaction.inventory_item_id == item.id,
                InventoryTransaction.location_id == location_id,
                InventoryTransaction.transaction_type == "Transfer In",
                func.date(InventoryTransaction.timestamp) >= start_date,
                func.date(InventoryTransaction.timestamp) <= end_date
            ).scalar()))

            trans_out = Decimal(str(db.query(func.coalesce(func.sum(InventoryTransaction.converted_base_quantity), 0.0)).execution_options(skip_tenant_scope=True).filter(
                InventoryTransaction.inventory_item_id == item.id,
                InventoryTransaction.location_id == location_id,
                InventoryTransaction.transaction_type == "Transfer Out",
                func.date(InventoryTransaction.timestamp) >= start_date,
                func.date(InventoryTransaction.timestamp) <= end_date
            ).scalar()))

            # 4. Waste
            waste_qty = Decimal(str(db.query(func.coalesce(func.sum(WasteLog.base_quantity), 0.0)).execution_options(skip_tenant_scope=True).filter(
                WasteLog.inventory_item_id == item.id,
                WasteLog.location_id == location_id,
                func.date(WasteLog.timestamp) >= start_date,
                func.date(WasteLog.timestamp) <= end_date
            ).scalar()))

            # 5. Ending Inventory
            end_count_line = db.query(InventoryCountLine).execution_options(skip_tenant_scope=True).join(InventoryCount).filter(
                InventoryCountLine.inventory_item_id == item.id,
                InventoryCount.location_id == location_id,
                func.date(InventoryCount.count_date) <= end_date,
                InventoryCount.status == "Approved"
            ).order_by(InventoryCount.count_date.desc()).first()

            end_qty = Decimal(str(end_count_line.base_quantity)) if end_count_line else Decimal("0.0")

            # Actual Usage = Beg + Purchases + TransIn - TransOut - Ending
            actual_usage = beg_qty + purch_qty + trans_in - trans_out - end_qty
            if actual_usage < Decimal("0.0"):
                actual_usage = Decimal("0.0")

            # 6. Theoretical Usage from Sales PMIX
            sales = db.query(SalesLine).filter(
                SalesLine.business_date >= start_date,
                SalesLine.business_date <= end_date
            ).all()

            theo_usage = Decimal("0.00")
            for sale in sales:
                if sale.recipe_id:
                    ingredients = db.query(RecipeIngredient).filter(
                        RecipeIngredient.recipe_id == sale.recipe_id,
                        RecipeIngredient.inventory_item_id == item.id
                    ).all()
                    for ing in ingredients:
                        factor = AvTEngine.get_unit_conversion_factor(db, item.id, ing.uom, item.base_uom)
                        ing_qty_base = Decimal(str(ing.quantity)) * factor
                        theo_usage += ing_qty_base * Decimal(str(sale.quantity_sold))

            # Variances
            qty_variance = actual_usage - theo_usage
            dollar_variance = qty_variance * unit_cost
            actual_dollar = actual_usage * unit_cost
            theo_dollar = theo_usage * unit_cost
            
            unexplained_variance = qty_variance - waste_qty
            unexplained_dollar = unexplained_variance * unit_cost

            variance_pct = float((dollar_variance / theo_dollar * 100)) if theo_dollar > 0 else 0.0

            total_actual_cost += actual_dollar
            total_theo_cost += theo_dollar
            total_dollar_var += dollar_variance

            results.append({
                "item_id": item.id,
                "item_name": item.name,
                "category": item.category,
                "base_uom": item.base_uom,
                "unit_cost": float(unit_cost),
                "beginning_inventory": float(beg_qty),
                "purchases": float(purch_qty),
                "transfers_in": float(trans_in),
                "transfers_out": float(trans_out),
                "waste": float(waste_qty),
                "ending_inventory": float(end_qty),
                "actual_usage": float(actual_usage),
                "theoretical_usage": float(theo_usage),
                "quantity_variance": float(qty_variance),
                "dollar_variance": float(dollar_variance),
                "actual_dollar": float(actual_dollar),
                "theoretical_dollar": float(theo_dollar),
                "variance_pct": round(variance_pct, 2),
                "unexplained_variance": float(unexplained_variance),
                "unexplained_dollar": float(unexplained_dollar)
            })

        return {
            "summary": {
                "total_actual_cost": float(total_actual_cost),
                "total_theoretical_cost": float(total_theo_cost),
                "total_dollar_variance": float(total_dollar_var),
                "total_variance_pct": round(float((total_dollar_var / total_theo_cost * 100)) if total_theo_cost > 0 else 0.0, 2)
            },
            "items": results
        }
