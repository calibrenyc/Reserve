import React, { useEffect, useState } from 'react';
import { ClipboardList, CalendarDays, Package, Building2, ArrowLeftRight, BarChart3, Trash2, UploadCloud, Home, MapPin, ChevronDown, CloudSun, Plus, TrendingUp } from 'lucide-react';

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface DashboardViewProps {
  onNavigate?: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = () => {
    fetch('/api/dashboard/summary')
      .then(res => res.json())
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleActionClick = (targetTab: string) => {
    if (onNavigate) {
      onNavigate(targetTab);
    }
  };

  const actions = [
    { label: 'Invoices', icon: ClipboardList, badge: summary?.invoices_needing_review || 0, color: 'text-amber-300', tab: 'invoices' },
    { label: 'Schedule', icon: CalendarDays, badge: 0, color: 'text-sky-300', tab: 'schedule' },
    { label: 'Inventory', icon: Package, badge: 0, color: 'text-emerald-300', tab: 'items' },
    { label: 'Vendors', icon: Building2, badge: 0, color: 'text-violet-300', tab: 'vendors' },
    { label: 'Transfers', icon: ArrowLeftRight, badge: 0, color: 'text-cyan-300', tab: 'transfers' },
    { label: 'Reports', icon: BarChart3, badge: 0, color: 'text-blue-300', tab: 'avt' },
    { label: 'Waste Log', icon: Trash2, badge: 0, color: 'text-rose-300', tab: 'waste' },
    { label: 'Upload Documents', icon: UploadCloud, badge: 0, color: 'text-teal-300', tab: 'documents' },
  ] as const;

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return <div className="-m-8 min-h-screen bg-black">
    <header className="h-14 bg-[#075c3b] px-8 flex items-center justify-between shadow-lg shadow-emerald-950/30">
      <div className="flex items-center gap-3 text-white"><Home className="w-5 h-5 fill-white" /><span className="font-black tracking-[0.18em] text-sm">RESERVE OPERATIONS</span></div>
      <div className="flex items-center gap-3 text-sm font-semibold text-emerald-50"><CloudSun className="w-5 h-5" /><span>Local Back-Office</span></div>
    </header>
    <div className="max-w-6xl mx-auto px-8 py-7">
      <div className="flex justify-between items-start border-b border-zinc-800 pb-6 mb-7">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Location</p>
            <button className="flex items-center gap-2 text-lg font-bold text-white hover:text-amber-300 transition-colors">
              Your Restaurant <ChevronDown className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>
        <div className="hidden sm:block rounded-md border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm text-zinc-300">
          <CloudSun className="inline w-4 h-4 mr-2 text-amber-300" /> Operations ready
        </div>
      </div>
      <div className="flex items-center gap-3 mb-5"><Home className="w-5 h-5 text-amber-400" /><h1 className="text-xl font-medium text-zinc-200">Today is {today}. Let’s get started!</h1></div>
      <section className="grid grid-cols-2 lg:grid-cols-4 border-l border-t border-zinc-800">
        {actions.map(({ label, icon: Icon, badge, color, tab }) => (
          <button
            key={label}
            onClick={() => handleActionClick(tab)}
            className="relative min-h-44 border-r border-b border-zinc-800 bg-zinc-950 p-5 transition-colors hover:bg-zinc-900 active:bg-zinc-800 group text-left cursor-pointer"
          >
            {badge > 0 && <span className="absolute right-4 top-4 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{badge}</span>}
            <Icon className={`mx-auto mt-2 h-11 w-11 ${color} transition-transform group-hover:scale-110`} strokeWidth={1.7} />
            <span className="mt-4 block text-base font-semibold text-zinc-100 text-center">{label}</span>
            <span className="absolute bottom-4 right-4 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 group-hover:bg-amber-500 group-hover:text-black transition-colors"><Plus className="w-3 h-3" /></span>
          </button>
        ))}
      </section>
      <section className="mt-7 grid grid-cols-1 lg:grid-cols-3 border border-zinc-800 bg-zinc-950">
        <div className="p-5 border-b lg:border-b-0 lg:border-r border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">A look at yesterday</p>
          <div className="mt-4 space-y-3 text-sm">
            <Metric label="Purchases this week" value={`$${money(summary?.purchases_this_week || 0)}`} tone="text-amber-300" />
            <Metric label="Inventory value" value={`$${money(summary?.inventory_valuation || 0)}`} tone="text-emerald-300" />
            <Metric label="Logged waste" value={`$${money(summary?.waste_this_week || 0)}`} tone="text-rose-300" />
          </div>
        </div>
        <div className="p-5 border-b lg:border-b-0 lg:border-r border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Week to date</p>
          <p className="mt-3 text-3xl font-bold text-white">$ {money(summary?.purchases_this_week || 0)}</p>
          <p className="mt-1 text-sm text-zinc-400">Purchase activity in the last 7 days</p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-2/3 rounded-full bg-amber-400" />
          </div>
        </div>
        <div className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-zinc-200">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              <span className="font-semibold">Operations Dashboard</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">Review invoices, inventory performance, costs, and operational activity from one place.</p>
          </div>
          <span className="mt-5 text-sm font-semibold text-amber-300">{loading ? 'Updating metrics…' : 'Metrics are up to date'}</span>
        </div>
      </section>
    </div>
  </div>;
};

const Metric: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => <div className="flex items-center justify-between gap-3"><span className="text-zinc-400">{label}</span><span className={`font-semibold ${tone}`}>{value}</span></div>;
