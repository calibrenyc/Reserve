import React, { useState, useEffect } from 'react';
import { Package, Plus, TrendingUp, History, Trash2, RotateCcw, RefreshCw } from 'lucide-react';
import { InventoryItem } from '../types';
import { apiFetch } from '../api';

interface CountTemplate { id: string; name: string; line_count: number; }

export const InventoryItemsView: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedCostHistory, setSelectedCostHistory] = useState<any>(null);
  const [pendingArchive, setPendingArchive] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [countTemplates, setCountTemplates] = useState<CountTemplate[]>([]);
  const [showCountSheetSync, setShowCountSheetSync] = useState(false);
  const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Food');
  const [baseUom, setBaseUom] = useState('LB');
  const [purchaseUom, setPurchaseUom] = useState('Case');
  const [currentCost, setCurrentCost] = useState('2.00');

  const fetchItems = () => {
    fetch(`/api/items${showArchived ? '?include_archived=true' : ''}`)
      .then(res => res.json())
      .then(data => setItems(Array.isArray(data) ? data.map((item: InventoryItem) => ({
        ...item,
        current_cost: Number(item.current_cost) || 0,
        previous_cost: Number(item.previous_cost) || 0,
        average_cost: Number(item.average_cost) || 0,
        last_purchase_cost: Number(item.last_purchase_cost) || 0
      })) : []))
      .catch(err => {
        console.error(err);
        setItems([]);
      });
  };

  useEffect(() => {
    fetchItems();
  }, [showArchived]);

  useEffect(() => {
    apiFetch('/api/inventory/count-templates').then(res => res.ok ? res.json() : []).then(data => setCountTemplates(Array.isArray(data) ? data : [])).catch(() => setCountTemplates([]));
  }, []);

  const syncToCountSheet = async (template: CountTemplate) => {
    setSyncingTemplateId(template.id);
    setSyncMessage('');
    try {
      const response = await apiFetch(`/api/inventory/count-templates/${template.id}/sync-items`, { method: 'POST' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.detail || 'Unable to sync the count sheet.');
      setCountTemplates(current => current.map(row => row.id === template.id ? { ...row, line_count: result.line_count } : row));
      setSyncMessage(`${result.line_count} active items are now on ${template.name}.`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Unable to sync the count sheet.');
    } finally { setSyncingTemplateId(null); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        base_uom: baseUom,
        purchase_uom: purchaseUom,
        current_cost: parseFloat(currentCost) || 0.0,
        conversions: [
          { from_uom: purchaseUom, to_uom: baseUom, factor: 20.0 }
        ]
      })
    });
    setName('');
    fetchItems();
  };

  const loadCostHistory = async (itemId: string) => {
    const res = await fetch(`/api/items/${itemId}/cost-history`);
    const data = await res.json();
    setSelectedCostHistory(data);
  };

  const archiveItem = async (item: InventoryItem) => {
    const action = item.is_active ? 'archive' : 'restore';
    const response = item.is_active
      ? await fetch(`/api/items/${item.id}/archive`, { method: 'POST' })
      : await fetch(`/api/items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true }) });
    if (!response.ok) { setPendingArchive(null); return; }
    setPendingArchive(null);
    fetchItems();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100">Items</h2>
        <p className="text-zinc-400 text-sm">The central item master for counts, invoices, vendors, recipes, transfers, waste, purchasing, and reporting.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items or categories" className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"/><label className="text-sm text-zinc-400 flex items-center gap-2"><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Show archived</label><button onClick={() => { setSyncMessage(''); setShowCountSheetSync(true); }} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20"><RefreshCw className="h-4 w-4" />Sync with Count Sheet</button></div>

      {/* Add Item Form */}
      <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl flex items-center gap-3">
        <input
          type="text"
          placeholder="Item Name (e.g. Chicken Breast)"
          value={name}
          onChange={e => setName(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 flex-1 focus:border-emerald-500 focus:outline-none"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
        >
          <option value="Food">Food</option>
          <option value="Meat">Meat</option>
          <option value="Produce">Produce</option>
          <option value="Dairy">Dairy</option>
          <option value="Dry Goods">Dry Goods</option>
          <option value="Beverage">Beverage</option>
          <option value="Packaging">Packaging</option>
        </select>
        <input
          type="text"
          placeholder="Base UOM (LB, OZ, GAL)"
          value={baseUom}
          onChange={e => setBaseUom(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 w-28 focus:border-emerald-500 focus:outline-none"
        />
        <input
          type="number"
          step="0.01"
          placeholder="Current Cost"
          value={currentCost}
          onChange={e => setCurrentCost(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 w-28 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-emerald-950/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Item</span>
        </button>
      </form>

      {/* Items Table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-700">
            <tr>
              <th className="p-4">Item Name</th>
              <th className="p-4">Category</th>
              <th className="p-4">Storage</th>
              <th className="p-4">Base UOM</th>
              <th className="p-4">Current Cost</th>
              <th className="p-4">Previous Cost</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {(items || []).filter(item => item.name.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase())).map(item => (
              <tr key={item.id} className="hover:bg-zinc-800/60 transition-colors">
                <td className="p-4 font-semibold text-zinc-100 flex items-center space-x-2">
                  <Package className="w-4 h-4 text-emerald-400" />
                  <span>{item.name}</span>
                </td>
                <td className="p-4 text-zinc-400">{item.category}</td>
                <td className="p-4 text-zinc-400">{item.storage_location}</td>
                <td className="p-4 text-zinc-300 font-mono text-xs">{item.base_uom}</td>
                <td className="p-4 font-bold text-emerald-400">${item.current_cost.toFixed(2)}</td>
                <td className="p-4 text-zinc-400">${item.previous_cost.toFixed(2)}</td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => loadCostHistory(item.id)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded text-zinc-200 inline-flex items-center gap-1 border border-zinc-700 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Price History</span>
                  </button>
                  <button
                    onClick={() => setPendingArchive(item)}
                    title={item.is_active ? 'Archive item' : 'Restore item'}
                    aria-label={item.is_active ? `Archive ${item.name}` : `Restore ${item.name}`}
                    className={item.is_active ? 'ml-2 inline-grid h-8 w-8 place-items-center rounded-md text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors' : 'ml-2 inline-grid h-8 w-8 place-items-center rounded-md text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors'}
                  >
                    {item.is_active ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendingArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="archive-item-title">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 id="archive-item-title" className="text-lg font-bold text-zinc-100">{pendingArchive.is_active ? 'Archive item?' : 'Restore item?'}</h3>
            <p className="mt-2 text-sm text-zinc-400">{pendingArchive.is_active ? <>“{pendingArchive.name}” will be removed from active item lists. Historical counts, invoices, recipes, and cost records are preserved.</> : <>“{pendingArchive.name}” will return to active item lists.</>}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setPendingArchive(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800">Cancel</button>
              <button onClick={() => archiveItem(pendingArchive)} className={pendingArchive.is_active ? 'rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500' : 'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500'}>{pendingArchive.is_active ? 'Archive item' : 'Restore item'}</button>
            </div>
          </div>
        </div>
      )}

      {showCountSheetSync && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="sync-count-sheet-title"><div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"><h3 id="sync-count-sheet-title" className="text-lg font-bold text-zinc-100">Sync with Count Sheet</h3><p className="mt-2 text-sm text-zinc-400">Choose a count sheet to include every active item. Item storage areas determine where each item appears on the sheet.</p>{countTemplates.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-400">Create or import a count sheet first.</p> : <div className="mt-4 space-y-2">{countTemplates.map(template => <button key={template.id} disabled={Boolean(syncingTemplateId)} onClick={() => syncToCountSheet(template)} className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-left hover:border-emerald-500/60 disabled:opacity-50"><span><span className="block text-sm font-semibold text-zinc-100">{template.name}</span><span className="text-xs text-zinc-400">{template.line_count} items</span></span><span className="text-xs font-semibold text-emerald-400">{syncingTemplateId === template.id ? 'Syncing…' : 'Sync'}</span></button>)}</div>}{syncMessage && <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{syncMessage}</p>}<div className="mt-5 flex justify-end"><button onClick={() => setShowCountSheetSync(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800">Close</button></div></div></div>}

      {/* Cost History Modal */}
      {selectedCostHistory && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
              <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Price History: {selectedCostHistory.item_name}
              </h3>
              <button onClick={() => setSelectedCostHistory(null)} className="text-zinc-400 hover:text-zinc-100 cursor-pointer">✕</button>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {selectedCostHistory.history.length === 0 ? (
                <p className="text-zinc-400 text-sm italic">No recorded invoice price changes yet.</p>
              ) : (
                selectedCostHistory.history.map((h: any, idx: number) => (
                  <div key={idx} className="flex justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-xs">
                    <div>
                      <p className="text-zinc-300 font-semibold">{h.date}</p>
                      <p className="text-zinc-500">Previous: ${h.previous_cost.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-400">${h.unit_cost.toFixed(2)}</p>
                      <p className={h.percent_change >= 0 ? "text-rose-400 font-semibold" : "text-emerald-400"}>
                        {h.percent_change >= 0 ? `+${h.percent_change}%` : `${h.percent_change}%`}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
