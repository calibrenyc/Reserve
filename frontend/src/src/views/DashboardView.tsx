import React, { useEffect, useState } from 'react';
import { AlertCircle, TrendingUp, DollarSign, Package, FileText, Landmark, Trash2 } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/summary')
      .then(res => res.json())
      .then(data => {
        setSummary(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-400">Loading Dashboard Metrics...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Restaurant Operations Dashboard</h2>
        <p className="text-slate-400 text-sm">Real-time local operational performance overview</p>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoices Needing Review</p>
            <p className="text-3xl font-extrabold text-amber-400 mt-1">{summary?.invoices_needing_review || 0}</p>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Purchases (7 Days)</p>
            <p className="text-3xl font-extrabold text-sky-400 mt-1">${(summary?.purchases_this_week || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-3 bg-sky-500/10 rounded-xl text-sky-400">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inventory Valuation</p>
            <p className="text-3xl font-extrabold text-emerald-400 mt-1">${(summary?.inventory_valuation || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">7-Day Avg Over/Short</p>
            <p className={`text-3xl font-extrabold mt-1 ${(summary?.avg_over_short || 0) < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              ${(summary?.avg_over_short || 0).toFixed(2)}
            </p>
          </div>
          <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400">
            <Landmark className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Price History Increases & Waste Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Price Increases */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-200 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              Recent Price Increases Alert
            </h3>
            <span className="text-xs text-slate-400">Flagged Changes</span>
          </div>

          <div className="space-y-3">
            {summary?.recent_price_increases?.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No recent price increases detected.</p>
            ) : (
              summary?.recent_price_increases?.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{item.item_name}</p>
                    <p className="text-xs text-slate-400">Previous: ${item.previous_cost.toFixed(2)} / unit</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-rose-400">${item.unit_cost.toFixed(2)} (+{item.percent_change}%)</p>
                    <p className="text-xs text-rose-300/80">+${item.dollar_change.toFixed(2)} change</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Waste Summary Card */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-200 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-400" />
                Waste Summary (7 Days)
              </h3>
              <span className="text-xs text-slate-400">Recorded Activity</span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Total Logged Waste Cost</p>
                <p className="text-3xl font-extrabold text-rose-400 mt-1">
                  ${(summary?.waste_this_week || 0).toFixed(2)}
                </p>
              </div>
              <div className="text-xs text-slate-400 max-w-[200px] text-right">
                Waste feeds directly into the Actual vs. Theoretical food cost variance analysis.
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
            System status: SQLite Local WAL Mode Enabled & Ready.
          </div>
        </div>
      </div>
    </div>
  );
};

