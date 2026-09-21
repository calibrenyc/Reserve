import React, { useState, useEffect } from 'react';
import { UtensilsCrossed, Plus, DollarSign } from 'lucide-react';
import { InventoryItem } from '../types';

export const RecipesView: React.FC = () => {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showModal, setShowModal] = useState(false);

  // New Recipe Form
  const [name, setName] = useState('');
  const [menuPrice, setMenuPrice] = useState('12.00');
  const [ingredients, setIngredients] = useState<{ inventory_item_id: string; quantity: number; uom: string }[]>([]);

  const fetchRecipes = () => {
    fetch('/api/recipes')
      .then(res => res.json())
      .then(data => setRecipes(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchRecipes();
    fetch('/api/items')
      .then(res => res.json())
      .then(data => setItems(data));
  }, []);

  const handleAddIngredient = () => {
    if (items.length === 0) return;
    setIngredients([...ingredients, { inventory_item_id: items[0].id, quantity: 1, uom: items[0].base_uom }]);
  };

  const handleSaveRecipe = async () => {
    if (!name.trim()) return;
    await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        menu_price: parseFloat(menuPrice) || 0,
        ingredients
      })
    });
    setShowModal(false);
    setName('');
    setIngredients([]);
    fetchRecipes();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Recipes & Costing</h2>
          <p className="text-slate-400 text-sm">Build recipe ingredient matrices and track live food cost %</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Recipe</span>
        </button>
      </div>

      {/* Recipe Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.map(r => (
          <div key={r.id} className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-xl space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-lg flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5 text-sky-400" />
                  {r.name}
                </h3>
                <p className="text-xs text-slate-400">Category: {r.category}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Menu Price</p>
                <p className="text-lg font-extrabold text-emerald-400">${r.menu_price.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-3 rounded-lg text-xs">
              <div>
                <p className="text-slate-400">Recipe Cost</p>
                <p className="font-bold text-slate-200">${r.recipe_cost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-slate-400">Food Cost %</p>
                <p className={`font-bold ${r.food_cost_pct > 32 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {r.food_cost_pct}%
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <p className="text-xs font-bold uppercase text-slate-400">Ingredients ({r.ingredients.length})</p>
              {r.ingredients.map((ing: any) => (
                <div key={ing.id} className="flex justify-between text-xs text-slate-300">
                  <span>{ing.item_name}</span>
                  <span className="font-mono text-slate-400">{ing.quantity} {ing.uom} (${ing.extended_cost.toFixed(2)})</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* New Recipe Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4">
            <h3 className="font-bold text-slate-100 text-lg">Create New Recipe</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Recipe Name (e.g. Chicken Bowl)"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Menu Price ($)"
                value={menuPrice}
                onChange={e => setMenuPrice(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-emerald-400 font-bold"
              />

              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase text-slate-400">Ingredients</span>
                  <button onClick={handleAddIngredient} className="text-xs text-sky-400 hover:underline">+ Add Ingredient</button>
                </div>
                <div className="space-y-2">
                  {ingredients.map((ing, idx) => (
                    <div key={idx} className="flex space-x-2">
                      <select
                        value={ing.inventory_item_id}
                        onChange={e => {
                          const updated = [...ingredients];
                          updated[idx].inventory_item_id = e.target.value;
                          setIngredients(updated);
                        }}
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 flex-1"
                      >
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.1"
                        value={ing.quantity}
                        onChange={e => {
                          const updated = [...ingredients];
                          updated[idx].quantity = parseFloat(e.target.value) || 0;
                          setIngredients(updated);
                        }}
                        className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-slate-100 text-sm">Cancel</button>
              <button onClick={handleSaveRecipe} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-lg">Save Recipe</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

