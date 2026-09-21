from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Recipe, RecipeIngredient, InventoryItem
from backend.app.schemas import RecipeCreate
from backend.app.services.avt_engine import AvTEngine

router = APIRouter(prefix="/api/recipes", tags=["Recipes"])

@router.get("")
def list_recipes(db: Session = Depends(get_db)):
    recipes = db.query(Recipe).filter(Recipe.is_active == True).all()
    results = []
    for r in recipes:
        total_cost = Decimal("0.00")
        ing_details = []
        for ing in r.ingredients:
            item = db.query(InventoryItem).filter(InventoryItem.id == ing.inventory_item_id).first()
            if item:
                unit_cost = item.current_cost or Decimal("0.00")
                factor = AvTEngine.get_unit_conversion_factor(db, item.id, ing.uom, item.base_uom)
                base_qty = ing.quantity * factor
                cost = base_qty * unit_cost
                total_cost += cost
                ing_details.append({
                    "id": ing.id,
                    "item_id": item.id,
                    "item_name": item.name,
                    "quantity": float(ing.quantity),
                    "uom": ing.uom,
                    "unit_cost": float(unit_cost),
                    "extended_cost": float(cost)
                })

        yield_val = r.serving_yield or Decimal("1.0")
        unit_recipe_cost = total_cost / yield_val if yield_val > 0 else total_cost
        menu_price = r.menu_price or Decimal("0.00")
        food_cost_pct = float((unit_recipe_cost / menu_price * 100)) if menu_price > 0 else 0.0
        contribution_margin = menu_price - unit_recipe_cost

        results.append({
            "id": r.id,
            "name": r.name,
            "pos_identifier": r.pos_identifier,
            "category": r.category,
            "serving_yield": float(r.serving_yield),
            "menu_price": float(r.menu_price),
            "recipe_cost": float(unit_recipe_cost),
            "food_cost_pct": round(food_cost_pct, 2),
            "contribution_margin": float(contribution_margin),
            "ingredients": ing_details
        })

    return results

@router.post("")
def create_recipe(recipe_in: RecipeCreate, db: Session = Depends(get_db)):
    existing = db.query(Recipe).filter(Recipe.name == recipe_in.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Recipe '{recipe_in.name}' already exists.")

    recipe = Recipe(
        name=recipe_in.name,
        pos_identifier=recipe_in.pos_identifier,
        category=recipe_in.category,
        serving_yield=recipe_in.serving_yield,
        menu_price=recipe_in.menu_price
    )
    db.add(recipe)
    db.flush()

    for ing in recipe_in.ingredients:
        r_ing = RecipeIngredient(
            recipe_id=recipe.id,
            inventory_item_id=ing.inventory_item_id,
            quantity=ing.quantity,
            uom=ing.uom
        )
        db.add(r_ing)

    db.commit()
    return {"message": "Recipe created successfully", "id": recipe.id}

