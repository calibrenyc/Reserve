import React, { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { InventoryItem } from '../types';
import { apiFetch } from '../api';

export const WasteView: React.FC = () => {
  const [wasteLogs, setWasteLogs] = useState<any[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [selectedItem, setSelectedItem] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('Spoiled');
  const [pendingDelete, setPendingDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');

  const fetchWaste = () => {
    fetch('/api/inventory/waste')
      .then(res => res.json())
      .then(data => setWasteLogs(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchWaste();
    fetch('/api/items')
      .then(res => res.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  const enabledUnits = (item?: InventoryItem) => {
    if (!item) return [];
    if (item.enabled_count_units?.length) return item.enabled_count_units.map(unit => unit.toUpperCase());
    const units = new Set([item.base_uom?.toUpperCase()]);
    item.conversions?.forEach(conversion => { units.add(conversion.from_uom.toUpperCase()); units.add(conversion.to_uom.toUpperCase()); });
    return ['CS', 'SLV', 'PK', 'BTL', 'EA'].filter(unit => units.has(unit));
  };
  const selectedInventoryItem = items.find(item => item.id === selectedItem);

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
        uom: selectedUnit || item?.base_uom || 'CS',
        reason
      })
    });

    setQty('');
    fetchWaste();
  };

  const deleteWaste = async () => {
    if (!pendingDelete) return;
    setDeleting(true); setMessage('');
    try {
      const response = await apiFetch(`/api/inventory/waste/${pendingDelete.id}`, { method: 'DELETE' });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.detail || 'Unable to delete waste entry.'); }
      setPendingDelete(null); fetchWaste();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to delete waste entry.'); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100">Waste Management Log</h2>
        <p className="text-zinc-400 text-sm">Log ingredient waste, spoilage, or prep loss to track unexplained variance</p>
      </div>

      <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_9rem_7rem_11rem_auto]">
        <select
          value={selectedItem}
          onChange={e => { const item = items.find(row => row.id === e.target.value); setSelectedItem(e.target.value); setSelectedUnit(enabledUnits(item)[0] || ''); }}
          className="min-w-0 bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
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
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
        />

        <select value={selectedUnit} disabled={!selectedItem} onChange={e => setSelectedUnit(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none">
          <option value="">Unit</option>
          {enabledUnits(selectedInventoryItem).map(unit => <option key={unit} value={unit}>{unit}</option>)}
        </select>

        <select
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
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
          className="justify-center whitespace-nowrap px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-rose-950/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Log Waste</span>
        </button>
      </form>

      {/* Waste Logs Table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-700">
            <tr>
              <th className="p-4">Date</th>
              <th className="p-4">Item Name</th>
              <th className="p-4">Quantity Wasted</th>
              <th className="p-4">Unit Cost</th>
              <th className="p-4">Total Cost Loss</th>
              <th className="p-4">Reason</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {wasteLogs.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-400 italic">No waste logs recorded yet.</td>
              </tr>
            ) : (
              wasteLogs.map(w => (
                <tr key={w.id} className="hover:bg-zinc-800/60 transition-colors">
                  <td className="p-4 text-zinc-300">{new Date(w.timestamp).toLocaleDateString()}</td>
                  <td className="p-4 font-semibold text-zinc-100 flex items-center space-x-2">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>{w.item_name}</span>
                  </td>
                  <td className="p-4 font-mono text-zinc-200">{w.quantity} {w.uom}</td>
                  <td className="p-4 text-zinc-400">${Number(w.unit_cost || 0).toFixed(2)}</td>
                  <td className="p-4 font-bold text-rose-400">${Number(w.total_cost || 0).toFixed(2)}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                      {w.reason}
                    </span>
                  </td>
                  <td className="p-4 text-right"><button onClick={() => { setMessage(''); setPendingDelete(w); }} className="rounded border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10">Delete</button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pendingDelete && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5"><h3 className="text-lg font-bold">Delete waste entry?</h3><p className="mt-2 text-sm text-zinc-400">This removes the waste log and its related inventory transaction.</p>{message && <p className="mt-3 rounded bg-rose-500/10 p-3 text-sm text-rose-200">{message}</p>}<div className="mt-5 flex justify-end gap-3"><button disabled={deleting} onClick={() => setPendingDelete(null)} className="px-3 py-2 text-sm text-zinc-300">Cancel</button><button disabled={deleting} onClick={deleteWaste} className="rounded bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete entry'}</button></div></div></div>}
    </div>
  );
};
