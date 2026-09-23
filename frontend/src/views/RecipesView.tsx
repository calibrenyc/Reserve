import React, { useState, useEffect } from 'react';
import { UtensilsCrossed, Plus, Upload, CheckCircle, AlertTriangle, X, Loader2, LayoutGrid, List, Trash2, ChevronDown, ChevronRight, DollarSign } from 'lucide-react';
import { apiFetch } from '../api';
import { InventoryItem } from '../types';

export const RecipesView: React.FC = () => {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedRecipeIds, setExpandedRecipeIds] = useState<string[]>([]);
  
  const [showModal, setShowModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  
  // Import Review Preview Modal State
  const [previewData, setPreviewData] = useState<any>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState('');

  // Delete Confirm Modal State
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<'selected' | 'all' | null>(null);

  // New Recipe Form
  const [name, setName] = useState('');
  const [menuPrice, setMenuPrice] = useState('12.00');
  const [ingredients, setIngredients] = useState<{ inventory_item_id: string; quantity: number; uom: string }[]>([]);

  const fetchRecipes = () => {
    apiFetch('/api/recipes')
      .then(res => res.json())
      .then(data => {
        setRecipes(Array.isArray(data) ? data : []);
        setSelectedIds([]);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchRecipes();
    apiFetch('/api/items')
      .then(res => res.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(recipes.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleExpand = (id: string) => {
    setExpandedRecipeIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleAddIngredient = () => {
    if (items.length === 0) return;
    setIngredients([...ingredients, { inventory_item_id: items[0].id, quantity: 1, uom: items[0].base_uom }]);
  };

  const handleSaveRecipe = async () => {
    if (!name.trim()) return;
    await apiFetch('/api/recipes', {
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

  const handleCommitImport = async () => {
    if (!previewData?.import_id) return;
    setCommitting(true);
    setCommitError('');
    try {
      const response = await apiFetch(`/api/recipes/imports/${previewData.import_id}/commit`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to commit recipe import.');
      setImportMessage(data.message || `Successfully created ${data.recipes_committed} recipes.`);
      setPreviewData(null);
      fetchRecipes();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Unable to commit recipes.');
    } finally {
      setCommitting(false);
    }
  };

  const handleDeleteSingle = async (id: string) => {
    if (!window.confirm('Delete this recipe?')) return;
    try {
      await apiFetch(`/api/recipes/${id}`, { method: 'DELETE' });
      fetchRecipes();
    } catch (err) {
      console.error(err);
    }
  };

  const handleExecuteDelete = async () => {
    setDeleting(true);
    try {
      if (showDeleteConfirm === 'all') {
        await apiFetch('/api/recipes/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delete_all: true })
        });
      } else if (showDeleteConfirm === 'selected') {
        await apiFetch('/api/recipes/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedIds })
        });
      }
      setShowDeleteConfirm(null);
      fetchRecipes();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const totalSelected = selectedIds.length;
  const isAllSelected = recipes.length > 0 && selectedIds.length === recipes.length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6 text-emerald-400" />
            Recipes & Costing
          </h2>
          <p className="text-zinc-400 text-sm">Recipe cost calculations and ingredient cost matrices</p>
        </div>

        {/* Header Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${viewMode === 'list' ? 'bg-zinc-800 text-emerald-400 border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Table List View"
            >
              <List className="w-4 h-4" />
              <span>List View</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${viewMode === 'grid' ? 'bg-zinc-800 text-emerald-400 border border-zinc-700' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Grid View</span>
            </button>
          </div>

          {/* Bulk Selection Actions */}
          {totalSelected > 0 && (
            <button
              onClick={() => setShowDeleteConfirm('selected')}
              className="px-3.5 py-2 bg-red-950/80 hover:bg-red-900 border border-red-800/80 text-red-200 font-semibold text-xs rounded-xl flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>Delete Selected ({totalSelected})</span>
            </button>
          )}

          {recipes.length > 0 && (
            <button
              onClick={() => setShowDeleteConfirm('all')}
              className="px-3.5 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 text-red-300 font-medium text-xs rounded-xl flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>Delete All</span>
            </button>
          )}

          {/* Import Button */}
          <label className="cursor-pointer px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-sm rounded-xl flex items-center space-x-2 border border-zinc-700">
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>{importing ? 'Reading…' : 'Import Recipes'}</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={importing}
              onChange={async e => {
                const file = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!file) return;
                setImporting(true);
                setImportMessage('');
                setCommitError('');
                try {
                  const form = new FormData();
                  form.append('file', file);
                  const response = await apiFetch('/api/recipes/imports/preview', { method: 'POST', body: form });
                  const contentType = response.headers.get('content-type') || '';
                  const text = await response.text();
                  
                  if (!contentType.includes('application/json')) {
                    throw new Error(`The server returned non-JSON response (${response.status} ${response.statusText}).`);
                  }
                  
                  let body: any;
                  try {
                    body = JSON.parse(text);
                  } catch (err) {
                    throw new Error('The recipe server returned an unreadable response.');
                  }
                  
                  if (!response.ok || body.success === false) {
                    throw new Error(body?.error?.message || body?.detail || 'Unable to read recipe workbook.');
                  }
                  
                  setPreviewData(body);
                } catch (error) {
                  setImportMessage(error instanceof Error ? error.message : 'Unable to import recipe workbook.');
                } finally {
                  setImporting(false);
                }
              }}
            />
          </label>

          {/* New Recipe Button */}
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 cursor-pointer shadow-lg shadow-emerald-950/40"
          >
            <Plus className="w-4 h-4" />
            <span>New Recipe</span>
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{importMessage}</span>
          </div>
          <button onClick={() => setImportMessage('')} className="text-zinc-400 hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {recipes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-12 text-center">
          <UtensilsCrossed className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-zinc-300">No Recipes Created Yet</h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto mt-1 mb-4">
            Upload a recipe workbook using <span className="text-emerald-400 font-semibold">Import Recipes</span> above or click <span className="text-emerald-400 font-semibold">New Recipe</span> to build manually.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* TABLE LIST VIEW */
        <div className="border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-900 shadow-xl">
          <div className="p-4 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={e => handleSelectAll(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
              />
              <span className="text-xs font-semibold text-zinc-300">
                {totalSelected > 0 ? `Selected ${totalSelected} of ${recipes.length} recipes` : `All Recipes (${recipes.length})`}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] font-bold tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-3.5 w-10 text-center"></th>
                  <th className="p-3.5 w-8"></th>
                  <th className="p-3.5">Recipe Name</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 text-center">Ingredients</th>
                  <th className="p-3.5 text-right text-emerald-400 font-mono font-bold">Total Recipe Cost</th>
                  <th className="p-3.5 text-right">Food Cost %</th>
                  <th className="p-3.5 text-center w-16">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {recipes.map(r => {
                  const isSelected = selectedIds.includes(r.id);
                  const isExpanded = expandedRecipeIds.includes(r.id);
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={`hover:bg-zinc-800/40 transition ${isSelected ? 'bg-emerald-950/20' : ''}`}>
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(r.id)}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
                          />
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => handleToggleExpand(r.id)}
                            className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-emerald-400" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-zinc-100 text-sm flex items-center gap-2">
                            <span>{r.name}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-zinc-400 font-medium">{r.category || 'General'}</td>
                        <td className="p-3.5 text-center font-semibold text-zinc-300">
                          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                            {r.ingredients.length} items
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <span className="text-base font-extrabold text-emerald-400 font-mono">
                            ${Number(r.recipe_cost || 0).toFixed(2)}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-bold">
                          <span className={r.food_cost_pct > 32 ? 'text-amber-400' : 'text-emerald-400'}>
                            {r.food_cost_pct ? `${r.food_cost_pct}%` : '—'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => handleDeleteSingle(r.id)}
                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition cursor-pointer"
                            title="Delete recipe"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      
                      {/* Expanded Ingredient Cost Matrix */}
                      {isExpanded && (
                        <tr className="bg-zinc-950/80 border-b border-zinc-800">
                          <td colSpan={8} className="p-4 pl-12">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                                  Ingredient Cost Matrix ({r.ingredients.length} Items)
                                </span>
                                <span className="text-xs font-mono text-zinc-400">
                                  Yield: {r.serving_yield || 1} Serving(s)
                                </span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {r.ingredients.map((ing: any) => (
                                  <div key={ing.id} className="flex items-center justify-between bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80 text-xs">
                                    <div>
                                      <p className="font-semibold text-zinc-200">{ing.item_name}</p>
                                      <p className="text-[10px] text-zinc-400 font-mono">
                                        Unit Cost: ${Number(ing.unit_cost || 0).toFixed(2)} / {ing.uom}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-mono text-zinc-300">{ing.quantity} {ing.uom}</p>
                                      <p className="font-mono font-bold text-emerald-400">${Number(ing.extended_cost || 0).toFixed(2)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARD GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map(r => {
            const isSelected = selectedIds.includes(r.id);
            return (
              <div
                key={r.id}
                className={`bg-zinc-900 border p-5 rounded-xl space-y-4 shadow-xl transition ${isSelected ? 'border-emerald-500 bg-emerald-950/10' : 'border-zinc-700'}`}
              >
                <div className="flex items-start justify-between border-b border-zinc-700 pb-3">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(r.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-emerald-500 focus:ring-emerald-500/30 cursor-pointer"
                    />
                    <div>
                      <h3 className="font-bold text-zinc-100 text-lg flex items-center gap-2">
                        <UtensilsCrossed className="w-5 h-5 text-emerald-400" />
                        {r.name}
                      </h3>
                      <p className="text-xs text-zinc-400">Category: {r.category || 'General'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteSingle(r.id)}
                    className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg cursor-pointer"
                    title="Delete recipe"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Primary Metric: Total Recipe Cost */}
                <div className="bg-zinc-950 p-4 rounded-xl text-center border border-zinc-800/80 space-y-1">
                  <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Total Recipe Cost</p>
                  <p className="text-3xl font-black text-emerald-400 font-mono">
                    ${Number(r.recipe_cost || 0).toFixed(2)}
                  </p>
                </div>

                {/* Ingredient Cost Matrix */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-xs font-bold uppercase text-zinc-400">
                    <span>Ingredients ({r.ingredients.length})</span>
                    <span>Cost</span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {r.ingredients.map((ing: any) => (
                      <div key={ing.id} className="flex justify-between text-xs text-zinc-300 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/40">
                        <span>{ing.item_name}</span>
                        <span className="font-mono text-emerald-400 font-semibold">${Number(ing.extended_cost || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recipe Import Preview & Review Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-zinc-100 text-lg flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-400" />
                  Recipe Import Review
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Template: <span className="text-emerald-400 font-mono font-semibold">{previewData.detected_template === 'reserve_normalized_recipes' ? 'Reserve Normalized Recipe Workbook' : 'SolBol Recipe Costing Sheet'}</span>
                </p>
              </div>
              <button onClick={() => setPreviewData(null)} className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 bg-zinc-950/60 border-b border-zinc-800 grid grid-cols-3 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-center">
                <p className="text-xs text-zinc-400 font-medium">Recipes</p>
                <p className="text-xl font-bold text-emerald-400">{previewData.recipesDetected ?? previewData.recipes_detected ?? 0}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-center">
                <p className="text-xs text-zinc-400 font-medium">Variants</p>
                <p className="text-xl font-bold text-zinc-100">{previewData.variantsDetected ?? 0}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-center">
                <p className="text-xs text-zinc-400 font-medium">Ingredient Lines</p>
                <p className="text-xl font-bold text-zinc-100">{previewData.ingredientLinesDetected ?? previewData.ingredient_lines ?? 0}</p>
              </div>
            </div>

            {commitError && (
              <div className="mx-5 mt-4 p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{commitError}</span>
              </div>
            )}

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <p className="text-xs font-bold uppercase text-zinc-400">Parsed Recipe Rows Ready for Commit</p>
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-zinc-900 text-zinc-400 uppercase text-[10px] font-semibold tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="p-3">Recipe Name</th>
                      <th className="p-3">Variant</th>
                      <th className="p-3">Ingredient</th>
                      <th className="p-3 text-right">Quantity</th>
                      <th className="p-3">Unit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {(previewData.recipes || []).map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-zinc-900/50">
                        <td className="p-3 font-semibold text-zinc-100">{row.recipe_name}</td>
                        <td className="p-3 text-zinc-400">{row.variant || 'Standard'}</td>
                        <td className="p-3 font-medium text-emerald-200">{row.ingredient}</td>
                        <td className="p-3 text-right font-mono text-zinc-300">{row.quantity}</td>
                        <td className="p-3 text-zinc-400">{row.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between">
              <span className="text-xs text-zinc-400">Click Commit to create live recipes in Reserve.</span>
              <div className="flex gap-3">
                <button
                  onClick={() => setPreviewData(null)}
                  className="px-4 py-2 text-zinc-400 hover:text-zinc-100 text-sm font-medium cursor-pointer"
                  disabled={committing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommitImport}
                  disabled={committing}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 cursor-pointer shadow-lg shadow-emerald-950/40 disabled:opacity-50"
                >
                  {committing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Creating Recipes…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-200" />
                      <span>Commit & Create Recipes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-zinc-100 text-lg">
                {showDeleteConfirm === 'all' ? 'Delete All Recipes?' : `Delete ${totalSelected} Selected Recipes?`}
              </h3>
            </div>
            <p className="text-sm text-zinc-400">
              {showDeleteConfirm === 'all'
                ? `Are you sure you want to permanently delete ALL ${recipes.length} recipes? This action cannot be undone.`
                : `Are you sure you want to delete ${totalSelected} selected recipe(s)? This action cannot be undone.`}
            </p>
            <div className="flex justify-end space-x-3 pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-zinc-400 hover:text-zinc-100 text-sm cursor-pointer"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-xl cursor-pointer flex items-center space-x-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Trash2 className="w-4 h-4" />}
                <span>{showDeleteConfirm === 'all' ? 'Yes, Delete All' : 'Yes, Delete Selected'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Recipe Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <h3 className="font-bold text-zinc-100 text-lg">Create New Recipe</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Recipe Name (e.g. Chicken Bowl)"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />

              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase text-zinc-400">Ingredients</span>
                  <button onClick={handleAddIngredient} className="text-xs text-emerald-400 hover:underline cursor-pointer">+ Add Ingredient</button>
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
                        className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 flex-1 focus:border-emerald-500 focus:outline-none"
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
                        className="w-20 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 text-right focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t border-zinc-800">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-zinc-400 hover:text-zinc-100 text-sm cursor-pointer">Cancel</button>
              <button onClick={handleSaveRecipe} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg cursor-pointer">Save Recipe</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
