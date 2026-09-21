import React from 'react';
import {
  LayoutDashboard,
  FileText,
  Building2,
  Package,
  Boxes,
  Trash2,
  UtensilsCrossed,
  Upload,
  Landmark,
  BarChart3,
  Database,
  History,
  TrendingUp
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const navGroups = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }
      ]
    },
    {
      title: 'PURCHASING',
      items: [
        { id: 'invoices', label: 'Invoices', icon: FileText },
        { id: 'vendors', label: 'Vendors', icon: Building2 },
        { id: 'items', label: 'Items & Prices', icon: Package }
      ]
    },
    {
      title: 'INVENTORY',
      items: [
        { id: 'counts', label: 'Count Sheets', icon: Boxes },
        { id: 'waste', label: 'Waste Logs', icon: Trash2 }
      ]
    },
    {
      title: 'RECIPES & SALES',
      items: [
        { id: 'recipes', label: 'Recipes & Costing', icon: UtensilsCrossed },
        { id: 'sales', label: 'PMIX Sales Import', icon: Upload }
      ]
    },
    {
      title: 'FINANCE',
      items: [
        { id: 'deposits', label: 'Daily Deposits', icon: Landmark },
        { id: 'avt', label: 'Actual vs Theoretical', icon: BarChart3 }
      ]
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'backups', label: 'Backups & Recovery', icon: Database },
        { id: 'audit', label: 'Audit Trail', icon: History }
      ]
    }
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-screen select-none">
      <div className="p-4 border-b border-slate-800 flex items-center space-x-3">
        <div className="bg-sky-600 text-white p-2 rounded-lg font-black text-xl tracking-wider">R</div>
        <div>
          <h1 className="font-bold text-slate-100 text-lg tracking-tight">RESERVE</h1>
          <p className="text-xs text-sky-400 font-medium">Local-First Back-Office</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h2 className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              {group.title}
            </h2>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentTab(item.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800 bg-slate-950 text-xs text-slate-500">
        <div className="flex items-center justify-between">
          <span>Engine Status</span>
          <span className="flex items-center text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
            Local Active
          </span>
        </div>
      </div>
    </aside>
  );
};

