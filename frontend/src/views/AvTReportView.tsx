import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, Layers, Info } from 'lucide-react';
import { AvTReport, AvTItem } from '../types';

export const AvTReportView: React.FC = () => {
  const [report, setReport] = useState<AvTReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [drilldownItem, setDrilldownItem] = useState<AvTItem | null>(null);

  const fetchReport = () => {
    setLoading(true);
    let url = '/api/reports/avt';
    if (selectedCategory) {
      url += `?category=${encodeURIComponent(selectedCategory)}`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setReport(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchReport();
  }, [selectedCategory]);

  if (loading || !report) {
    return <div className="p-8 text-slate-400">Calculating Actual vs. Theoretical Food Cost...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Actual vs Theoretical (AvT) Food Cost Report</h2>
          <p className="text-slate-400 text-sm">Compare actual inventory usage against theoretical PMIX recipe sales requirements</p>
        </div>

        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-100"
        >
          <option value="">All Categories</option>
          <option value="Food">Food</option>
          <option value="Meat">Meat</option>
          <option value="Produce">Produce</option>
          <option value="Dairy">Dairy</option>
          <option value="Dry Goods">Dry Goods</option>
        </select>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl">
          <p className="text-xs font-semibold text-slate-400 uppercase">Actual Food Cost</p>
          <p className="text-2xl font-extrabold text-slate-100 mt-1">${report.summary.total_actual_cost.toFixed(2)}</p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl">
          <p className="text-xs font-semibold text-slate-400 uppercase">Theoretical Food Cost</p>
          <p className="text-2xl font-extrabold text-sky-400 mt-1">${report.summary.total_theoretical_cost.toFixed(2)}</p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl">
          <p className="text-xs font-semibold text-slate-400 uppercase">Dollar Variance</p>
          <p className={`text-2xl font-extrabold mt-1 ${report.summary.total_dollar_variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            ${report.summary.total_dollar_variance.toFixed(2)}
          </p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl">
          <p className="text-xs font-semibold text-slate-400 uppercase">Variance %</p>
          <p className={`text-2xl font-extrabold mt-1 ${report.summary.total_variance_pct > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {report.summary.total_variance_pct}%
          </p>
        </div>
      </div>

      {/* Item AvT Table */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs text-slate-200">
          <thead className="bg-slate-900 text-slate-400 uppercase font-semibold tracking-wider border-b border-slate-700/80">
            <tr>
              <th className="p-3">Item Name</th>
              <th className="p-3">Beg Inv</th>
              <th className="p-3">Purchases</th>
              <th className="p-3">Waste</th>
              <th className="p-3">End Inv</th>
              <th className="p-3">Actual Usage</th>
              <th className="p-3">Theo Usage</th>
              <th className="p-3">Qty Var</th>
              <th className="p-3">Dollar Var</th>
              <th className="p-3 text-right">Drill-Down</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {report.items.map(item => (
              <tr key={item.item_id} className="hover:bg-slate-700/30">
                <td className="p-3 font-bold text-slate-100">{item.item_name}</td>
                <td className="p-3 text-slate-400">{item.beginning_inventory} {item.base_uom}</td>
                <td className="p-3 text-slate-300 font-semibold">{item.purchases} {item.base_uom}</td>
                <td className="p-3 text-rose-400">{item.waste} {item.base_uom}</td>
                <td className="p-3 text-slate-400">{item.ending_inventory} {item.base_uom}</td>
                <td className="p-3 font-bold text-slate-100">{item.actual_usage} {item.base_uom}</td>
                <td className="p-3 font-bold text-sky-400">{item.theoretical_usage} {item.base_uom}</td>
                <td className={`p-3 font-bold ${item.quantity_variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {item.quantity_variance > 0 ? `+${item.quantity_variance}` : item.quantity_variance} {item.base_uom}
                </td>
                <td className={`p-3 font-bold ${item.dollar_variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ${item.dollar_variance.toFixed(2)}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => setDrilldownItem(item)}
                    className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 font-semibold text-[11px]"
                  >
                    Drill-Down
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drill-down Drawer */}
      {drilldownItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Info className="w-5 h-5 text-sky-400" />
                AvT Drill-Down: {drilldownItem.item_name}
              </h3>
              <button onClick={() => setDrilldownItem(null)} className="text-slate-400 hover:text-slate-100">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1.5">
                <p className="font-semibold text-slate-200">Actual Usage Breakdown Formula</p>
                <div className="flex justify-between text-slate-400"><span>Beginning Inventory:</span> <span>{drilldownItem.beginning_inventory} {drilldownItem.base_uom}</span></div>
                <div className="flex justify-between text-slate-400"><span>Approved Purchases:</span> <span className="text-emerald-400">+{drilldownItem.purchases} {drilldownItem.base_uom}</span></div>
                <div className="flex justify-between text-slate-400"><span>Logged Waste:</span> <span className="text-rose-400">-{drilldownItem.waste} {drilldownItem.base_uom}</span></div>
                <div className="flex justify-between text-slate-400"><span>Ending Inventory:</span> <span>-{drilldownItem.ending_inventory} {drilldownItem.base_uom}</span></div>
                <div className="flex justify-between font-bold text-slate-100 pt-1 border-t border-slate-800">
                  <span>Actual Usage:</span> <span>{drilldownItem.actual_usage} {drilldownItem.base_uom} (${drilldownItem.actual_dollar.toFixed(2)})</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1.5">
                <p className="font-semibold text-sky-400">Theoretical Recipe Sales Usage</p>
                <div className="flex justify-between text-slate-300">
                  <span>PMIX Sales Theoretical:</span> <span>{drilldownItem.theoretical_usage} {drilldownItem.base_uom} (${drilldownItem.theoretical_dollar.toFixed(2)})</span>
                </div>
                <div className="flex justify-between text-amber-400 font-semibold pt-1 border-t border-slate-800">
                  <span>Unexplained Variance:</span> <span>{drilldownItem.unexplained_variance} {drilldownItem.base_uom} (${drilldownItem.unexplained_dollar.toFixed(2)})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

