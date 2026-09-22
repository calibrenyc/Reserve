import React, { useState, useEffect } from 'react';
import { BarChart3, Info } from 'lucide-react';
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
    return <div className="p-8 text-zinc-400">Calculating Actual vs. Theoretical Food Cost...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">Actual vs Theoretical (AvT) Food Cost Report</h2>
          <p className="text-zinc-400 text-sm">Compare actual inventory usage against theoretical PMIX recipe sales requirements</p>
        </div>

        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
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
        <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl shadow-xl">
          <p className="text-xs font-semibold text-zinc-400 uppercase">Actual Food Cost</p>
          <p className="text-2xl font-extrabold text-zinc-100 mt-1">${report.summary.total_actual_cost.toFixed(2)}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl shadow-xl">
          <p className="text-xs font-semibold text-zinc-400 uppercase">Theoretical Food Cost</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">${report.summary.total_theoretical_cost.toFixed(2)}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl shadow-xl">
          <p className="text-xs font-semibold text-zinc-400 uppercase">Dollar Variance</p>
          <p className={`text-2xl font-extrabold mt-1 ${report.summary.total_dollar_variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            ${report.summary.total_dollar_variance.toFixed(2)}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl shadow-xl">
          <p className="text-xs font-semibold text-zinc-400 uppercase">Variance %</p>
          <p className={`text-2xl font-extrabold mt-1 ${report.summary.total_variance_pct > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {report.summary.total_variance_pct}%
          </p>
        </div>
      </div>

      {/* Item AvT Table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold tracking-wider border-b border-zinc-700">
            <tr>
              <th className="p-3.5">Item Name</th>
              <th className="p-3.5">Beg Inv</th>
              <th className="p-3.5">Purchases</th>
              <th className="p-3.5">Waste</th>
              <th className="p-3.5">End Inv</th>
              <th className="p-3.5">Actual Usage</th>
              <th className="p-3.5">Theo Usage</th>
              <th className="p-3.5">Qty Var</th>
              <th className="p-3.5">Dollar Var</th>
              <th className="p-3.5 text-right">Drill-Down</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {report.items.map(item => (
              <tr key={item.item_id} className="hover:bg-zinc-800/60 transition-colors">
                <td className="p-3.5 font-bold text-zinc-100">{item.item_name}</td>
                <td className="p-3.5 text-zinc-400">{item.beginning_inventory} {item.base_uom}</td>
                <td className="p-3.5 text-zinc-300 font-semibold">{item.purchases} {item.base_uom}</td>
                <td className="p-3.5 text-rose-400">{item.waste} {item.base_uom}</td>
                <td className="p-3.5 text-zinc-400">{item.ending_inventory} {item.base_uom}</td>
                <td className="p-3.5 font-bold text-zinc-100">{item.actual_usage} {item.base_uom}</td>
                <td className="p-3.5 font-bold text-emerald-400">{item.theoretical_usage} {item.base_uom}</td>
                <td className={`p-3.5 font-bold ${item.quantity_variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {item.quantity_variance > 0 ? `+${item.quantity_variance}` : item.quantity_variance} {item.base_uom}
                </td>
                <td className={`p-3.5 font-bold ${item.dollar_variance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ${item.dollar_variance.toFixed(2)}
                </td>
                <td className="p-3.5 text-right">
                  <button
                    onClick={() => setDrilldownItem(item)}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-200 font-semibold text-xs cursor-pointer"
                  >
                    Drill-Down
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drill-down Modal */}
      {drilldownItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
              <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                <Info className="w-5 h-5 text-emerald-400" />
                AvT Drill-Down: {drilldownItem.item_name}
              </h3>
              <button onClick={() => setDrilldownItem(null)} className="text-zinc-400 hover:text-zinc-100 cursor-pointer">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-1.5">
                <p className="font-semibold text-zinc-200">Actual Usage Breakdown Formula</p>
                <div className="flex justify-between text-zinc-400"><span>Beginning Inventory:</span> <span>{drilldownItem.beginning_inventory} {drilldownItem.base_uom}</span></div>
                <div className="flex justify-between text-zinc-400"><span>Approved Purchases:</span> <span className="text-emerald-400">+{drilldownItem.purchases} {drilldownItem.base_uom}</span></div>
                <div className="flex justify-between text-zinc-400"><span>Logged Waste:</span> <span className="text-rose-400">-{drilldownItem.waste} {drilldownItem.base_uom}</span></div>
                <div className="flex justify-between text-zinc-400"><span>Ending Inventory:</span> <span>-{drilldownItem.ending_inventory} {drilldownItem.base_uom}</span></div>
                <div className="flex justify-between font-bold text-zinc-100 pt-1 border-t border-zinc-800">
                  <span>Actual Usage:</span> <span>{drilldownItem.actual_usage} {drilldownItem.base_uom} (${drilldownItem.actual_dollar.toFixed(2)})</span>
                </div>
              </div>

              <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-1.5">
                <p className="font-semibold text-emerald-400">Theoretical Recipe Sales Usage</p>
                <div className="flex justify-between text-zinc-300">
                  <span>PMIX Sales Theoretical:</span> <span>{drilldownItem.theoretical_usage} {drilldownItem.base_uom} (${drilldownItem.theoretical_dollar.toFixed(2)})</span>
                </div>
                <div className="flex justify-between text-amber-400 font-semibold pt-1 border-t border-zinc-800">
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
