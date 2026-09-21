import React, { useState, useEffect } from 'react';
import { Package, Plus, TrendingUp, History } from 'lucide-react';
import { InventoryItem } from '../types';

export const InventoryItemsView: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedCostHistory, setSelectedCostHistory] = useState<any>(null);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Food');
  const [baseUom, setBaseUom] = useState('LB');
  const [purchaseUom, setPurchaseUom] = useState('Case');
  const [currentCost, setCurrentCost] = useState('2.00');

  const fetchItems = () => {
    fetch('/api/items')
      .then(res => res.json())
      .then(data => setItems(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchItems();
  }, []);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Inventory Items & Price History</h2>
        <p className="text-slate-400 text-sm">Internal ingredient item master, unit conversions, and purchase price history</p>
      </div>

      {/* Add Item Form */}
      <form onSubmit={handleCreate} className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-xl flex items-center gap-3">
        <input
          type="text"
          placeholder="Item Name (e.g. Chicken Breast)"
          value={name}
          onChange={e => setName(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 flex-1"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
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
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 w-28"
        />
        <input
          type="number"
          step="0.01"
          placeholder="Current Cost"
          value={currentCost}
          onChange={e => setCurrentCost(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 w-28"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-lg flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Add Item</span>
        </button>
      </form>

      {/* Items Table */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs font-semibold tracking-wider border-b border-slate-700/80">
            <tr>
              <th className="p-4">Item Name</th>
              <th className="p-4">Category</th>
              <th className="p-4">Base UOM</th>
              <th className="p-4">Current Cost</th>
              <th className="p-4">Previous Cost</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-slate-700/30">
                <td className="p-4 font-semibold text-slate-100 flex items-center space-x-2">
                  <Package className="w-4 h-4 text-sky-400" />
                  <span>{item.name}</span>
                </td>
                <td className="p-4 text-slate-400">{item.category}</td>
                <td className="p-4 text-slate-300 font-mono text-xs">{item.base_uom}</td>
                <td className="p-4 font-bold text-emerald-400">${item.current_cost.toFixed(2)}</td>
                <td className="p-4 text-slate-400">${item.previous_cost.toFixed(2)}</td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => loadCostHistory(item.id)}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs font-semibold rounded text-slate-200 inline-flex items-center gap-1"
                  >
                    <History className="w-3.5 h-3.5 text-sky-400" />
                    <span>Price History</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cost History Drawer / Modal */}
      {selectedCostHistory && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-sky-400" />
                Price History: {selectedCostHistory.item_name}
              </h3>
              <button onClick={() => setSelectedCostHistory(null)} className="text-slate-400 hover:text-slate-100">✕</button>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {selectedCostHistory.history.length === 0 ? (
                <p className="text-slate-400 text-sm italic">No recorded invoice price changes yet.</p>
              ) : (
                selectedCostHistory.history.map((h: any, idx: number) => (
                  <div key={idx} className="flex justify-between bg-slate-950 p-3 rounded border border-slate-800 text-xs">
                    <div>
                      <p className="text-slate-300 font-semibold">{h.date}</p>
                      <p className="text-slate-500">Previous: ${h.previous_cost.toFixed(2)}</p>
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

