from decimal import Decimal
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
import datetime

from backend.app.models import (
    InventoryItem, UnitConversion, InventoryTransaction, WasteLog,
    Recipe, RecipeIngredient, SalesLine, InventoryCount, InventoryCountLine
)

class AvTEngine:
    @staticmethod
    def get_unit_conversion_factor(db: Session, item_id: str, from_uom: str, to_uom: str) -> Decimal:
        """Finds conversion factor to convert from_uom quantity to to_uom quantity."""
        if not from_uom or not to_uom or from_uom.upper() == to_uom.upper():
            return Decimal("1.0")

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

        # Special common units fallback
        f_u = from_uom.upper()
        t_u = to_uom.upper()
        if f_u == "OZ" and t_u == "LB":
            return Decimal("0.0625")  # 1 oz = 1/16 lb
        elif f_u == "LB" and t_u == "OZ":
            return Decimal("16.0")

        return Decimal("1.0")

    @staticmethod
    def calculate_avt(db: Session, start_date: datetime.date, end_date: datetime.date, category_filter: Optional[str] = None):
        items_query = db.query(InventoryItem).filter(InventoryItem.is_active == True)
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
            beg_count_line = db.query(InventoryCountLine).join(InventoryCount).filter(
                InventoryCountLine.inventory_item_id == item.id,
                func.date(InventoryCount.count_date) <= start_date,
                InventoryCount.status == "Approved"
            ).order_by(InventoryCount.count_date.desc()).first()

            beg_qty = Decimal(str(beg_count_line.base_quantity)) if beg_count_line else Decimal("0.0")

            # 2. Purchases during period
            purchases = db.query(func.coalesce(func.sum(InventoryTransaction.converted_base_quantity), 0.0)).filter(
                InventoryTransaction.inventory_item_id == item.id,
                InventoryTransaction.transaction_type == "Purchase",
                func.date(InventoryTransaction.timestamp) >= start_date,
                func.date(InventoryTransaction.timestamp) <= end_date
            ).scalar()
            purch_qty = Decimal(str(purchases))

            # 3. Transfers In / Out
            trans_in = Decimal(str(db.query(func.coalesce(func.sum(InventoryTransaction.converted_base_quantity), 0.0)).filter(
                InventoryTransaction.inventory_item_id == item.id,
                InventoryTransaction.transaction_type == "Transfer In",
                func.date(InventoryTransaction.timestamp) >= start_date,
                func.date(InventoryTransaction.timestamp) <= end_date
            ).scalar()))

            trans_out = Decimal(str(db.query(func.coalesce(func.sum(InventoryTransaction.converted_base_quantity), 0.0)).filter(
                InventoryTransaction.inventory_item_id == item.id,
                InventoryTransaction.transaction_type == "Transfer Out",
                func.date(InventoryTransaction.timestamp) >= start_date,
                func.date(InventoryTransaction.timestamp) <= end_date
            ).scalar()))

            # 4. Waste
            waste_qty = Decimal(str(db.query(func.coalesce(func.sum(WasteLog.base_quantity), 0.0)).filter(
                WasteLog.inventory_item_id == item.id,
                func.date(WasteLog.timestamp) >= start_date,
                func.date(WasteLog.timestamp) <= end_date
            ).scalar()))

            # 5. Ending Inventory
            end_count_line = db.query(InventoryCountLine).join(InventoryCount).filter(
                InventoryCountLine.inventory_item_id == item.id,
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

