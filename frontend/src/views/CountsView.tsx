import React, { useState, useEffect } from 'react';
import { Boxes, Plus, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { InventoryItem } from '../types';

export const CountsView: React.FC = () => {
  const [counts, setCounts] = useState<any[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [countLines, setCountLines] = useState<{ [itemId: string]: number }>({});

  const fetchCounts = () => {
    fetch('/api/inventory/counts')
      .then(res => res.json())
      .then(data => setCounts(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchCounts();
    fetch('/api/items')
      .then(res => res.json())
      .then(data => setItems(data));
  }, []);

  const handleSaveCount = async () => {
    const lines = Object.entries(countLines).map(([itemId, qty]) => {
      const item = items.find(i => i.id === itemId);
      return {
        inventory_item_id: itemId,
        counted_quantity: qty,
        counted_uom: item?.base_uom || 'LB'
      };
    });

    const res = await fetch('/api/inventory/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Count Sheet - ${new Date().toLocaleDateString()}`,
        lines
      })
    });

    if (res.ok) {
      setShowCreateModal(false);
      setCountLines({});
      fetchCounts();
    }
  };

  const handleApprove = async (countId: string) => {
    await fetch(`/api/inventory/counts/${countId}/approve`, { method: 'POST' });
    fetchCounts();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Inventory Count Sheets</h2>
          <p className="text-slate-400 text-sm">Perform stock counts, calculate valuation, and post approved counts to ledger</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Count Sheet</span>
        </button>
      </div>

      {/* Counts List */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs font-semibold tracking-wider border-b border-slate-700/80">
            <tr>
              <th className="p-4">Count Sheet Name</th>
              <th className="p-4">Date</th>
              <th className="p-4">Total Valuation</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {counts.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400 italic">No inventory counts recorded yet.</td>
              </tr>
            ) : (
              counts.map(c => (
                <tr key={c.id} className="hover:bg-slate-700/30">
                  <td className="p-4 font-bold text-slate-100 flex items-center space-x-2">
                    <Boxes className="w-4 h-4 text-sky-400" />
                    <span>{c.name}</span>
                  </td>
                  <td className="p-4 text-slate-300">{new Date(c.count_date).toLocaleDateString()}</td>
                  <td className="p-4 font-bold text-emerald-400">${parseFloat(c.total_valuation || 0).toFixed(2)}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      c.status === 'Approved'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {c.status !== 'Approved' && (
                      <button
                        onClick={() => handleApprove(c.id)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded"
                      >
                        Approve Count
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Count Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-5 space-y-4 max-h-[85vh] flex flex-col">
            <h3 className="font-bold text-slate-100 text-lg">Enter Inventory Stock Count</h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-slate-950 p-3 rounded border border-slate-800">
                  <div>
                    <p className="font-semibold text-slate-200">{item.name}</p>
                    <p className="text-xs text-slate-400">Base Unit: {item.base_uom} | Cost: ${item.current_cost.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      onChange={e => setCountLines({ ...countLines, [item.id]: parseFloat(e.target.value) || 0 })}
                      className="w-24 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-sm font-semibold text-slate-100 text-right"
                    />
                    <span className="text-xs text-slate-400 font-mono">{item.base_uom}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-slate-400 hover:text-slate-100 text-sm">Cancel</button>
              <button onClick={handleSaveCount} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-lg">Save Count Sheet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

