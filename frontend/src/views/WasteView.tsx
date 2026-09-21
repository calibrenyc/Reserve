import React, { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { InventoryItem } from '../types';

export const WasteView: React.FC = () => {
  const [wasteLogs, setWasteLogs] = useState<any[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [selectedItem, setSelectedItem] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('Spoiled');

  const fetchWaste = () => {
    fetch('/api/inventory/waste')
      .then(res => res.json())
      .then(data => setWasteLogs(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchWaste();
    fetch('/api/items')
      .then(res => res.json())
      .then(data => setItems(data));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !qty) return;

    const item = items.find(i => i.id === selectedItem);
    await fetch('/api/inventory/waste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inventory_item_id: selectedItem,
        quantity: parseFloat(qty),
        uom: item?.base_uom || 'LB',
        reason
      })
    });

    setQty('');
    fetchWaste();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Waste Management Log</h2>
        <p className="text-slate-400 text-sm">Log ingredient waste, spoilage, or prep loss to track unexplained variance</p>
      </div>

      <form onSubmit={handleCreate} className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-xl flex items-center gap-3">
        <select
          value={selectedItem}
          onChange={e => setSelectedItem(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 flex-1"
        >
          <option value="">-- Select Inventory Item --</option>
          {items.map(i => (
            <option key={i.id} value={i.id}>{i.name} ({i.base_uom})</option>
          ))}
        </select>

        <input
          type="number"
          step="0.1"
          placeholder="Quantity Wasted"
          value={qty}
          onChange={e => setQty(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 w-36"
        />

        <select
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 w-44"
        >
          <option value="Expired">Expired</option>
          <option value="Spoiled">Spoiled</option>
          <option value="Overproduction">Overproduction</option>
          <option value="Prep Waste">Prep Waste</option>
          <option value="Dropped">Dropped</option>
          <option value="Customer Return">Customer Return</option>
          <option value="Quality">Quality Issue</option>
        </select>

        <button
          type="submit"
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm rounded-lg flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Log Waste</span>
        </button>
      </form>

      {/* Waste Logs Table */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs font-semibold tracking-wider border-b border-slate-700/80">
            <tr>
              <th className="p-4">Item Name</th>
              <th className="p-4">Quantity Wasted</th>
              <th className="p-4">Reason</th>
              <th className="p-4">Total Cost</th>
              <th className="p-4">Date & Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {wasteLogs.map(w => (
              <tr key={w.id} className="hover:bg-slate-700/30">
                <td className="p-4 font-bold text-slate-100 flex items-center space-x-2">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>{w.item_name}</span>
                </td>
                <td className="p-4 text-slate-200 font-semibold">{w.quantity} {w.uom}</td>
                <td className="p-4">
                  <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-300 text-xs font-medium border border-slate-800">
                    {w.reason}
                  </span>
                </td>
                <td className="p-4 font-bold text-rose-400">${w.total_cost.toFixed(2)}</td>
                <td className="p-4 text-slate-400 text-xs">{new Date(w.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

