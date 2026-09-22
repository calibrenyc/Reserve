import React, { useState } from 'react';
import { ArrowLeftRight, Plus, Building2, Package, Search } from 'lucide-react';

interface TransferRecord {
  id: string;
  date: string;
  fromLocation: string;
  toLocation: string;
  itemCount: number;
  totalValue: number;
  status: 'Completed' | 'Pending' | 'Draft';
}

export const TransfersView: React.FC = () => {
  const [transfers] = useState<TransferRecord[]>([
    { id: 'TRF-1001', date: '2026-09-21', fromLocation: 'Main Kitchen', toLocation: 'Bar Lounge', itemCount: 4, totalValue: 245.50, status: 'Completed' },
    { id: 'TRF-1002', date: '2026-09-20', fromLocation: 'Dry Storage', toLocation: 'Prep Station 2', itemCount: 7, totalValue: 512.10, status: 'Completed' },
    { id: 'TRF-1003', date: '2026-09-19', fromLocation: 'Walk-in Freezer', toLocation: 'Main Kitchen', itemCount: 3, totalValue: 180.00, status: 'Pending' },
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-cyan-400" />
            Inventory Transfers
          </h2>
          <p className="text-slate-400 text-sm">Transfer stock items between locations, bars, prep stations, and dry storage</p>
        </div>
        <button className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-lg shadow-cyan-950/40">
          <Plus className="w-4 h-4" />
          New Transfer
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search transfers..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>Filter Status:</span>
          <span className="bg-zinc-800 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 font-semibold cursor-pointer">All</span>
          <span className="hover:bg-zinc-800 text-zinc-400 px-3 py-1.5 rounded-lg font-semibold cursor-pointer">Completed</span>
          <span className="hover:bg-zinc-800 text-zinc-400 px-3 py-1.5 rounded-lg font-semibold cursor-pointer">Pending</span>
        </div>
      </div>

      {/* Transfers List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-800">
            <tr>
              <th className="p-4">Transfer Ref</th>
              <th className="p-4">Date</th>
              <th className="p-4">From Location</th>
              <th className="p-4">To Location</th>
              <th className="p-4 text-center">Items</th>
              <th className="p-4 text-right">Value</th>
              <th className="p-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {transfers.map((trf) => (
              <tr key={trf.id} className="hover:bg-zinc-800/50 transition-colors">
                <td className="p-4 font-mono font-semibold text-cyan-400">{trf.id}</td>
                <td className="p-4 text-zinc-400">{trf.date}</td>
                <td className="p-4 text-zinc-300 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-zinc-500" />
                  {trf.fromLocation}
                </td>
                <td className="p-4 text-zinc-300">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                    {trf.toLocation}
                  </div>
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 text-xs px-2.5 py-1 rounded-md border border-zinc-700 font-medium">
                    <Package className="w-3.5 h-3.5 text-zinc-400" />
                    {trf.itemCount} items
                  </span>
                </td>
                <td className="p-4 text-right font-bold text-slate-100">
                  ${trf.totalValue.toFixed(2)}
                </td>
                <td className="p-4 text-center">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                    trf.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {trf.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

