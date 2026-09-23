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
  CalendarDays,
  ArrowLeftRight,
  FolderOpen, ShieldCheck, Rocket
} from 'lucide-react';
import reserveLogo from '../assets/reserve-logo.png';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  canAdmin?: boolean;
  canManageItems?: boolean;
  canBusinessStart?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, canAdmin = false, canManageItems = false, canBusinessStart = false }) => {
  const navGroups = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'schedule', label: 'Team Schedule', icon: CalendarDays }
      ]
    },
    {
      title: 'PURCHASING',
      items: [
        { id: 'invoices', label: 'Invoices', icon: FileText },
        { id: 'documents', label: 'Documents', icon: FolderOpen },
        { id: 'vendors', label: 'Vendors', icon: Building2 },
        ...(canManageItems ? [{ id: 'items', label: 'Items', icon: Package }] : [])
      ]
    },
    {
      title: 'INVENTORY',
      items: [
        { id: 'counts', label: 'Count Sheets', icon: Boxes },
        { id: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
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
    },
    ...(canAdmin ? [{
      title: 'ADMIN',
      items: [
        ...(canBusinessStart ? [{ id: 'business-start', label: 'Business Start', icon: Rocket }] : []),
        { id: 'admin', label: 'Administration', icon: ShieldCheck }
      ]
    }] : [])
  ];

  return (
    <aside className="w-64 bg-zinc-800 border-r border-zinc-700 flex flex-col h-full select-none">
      <div className="px-4 py-5 border-b border-zinc-700 bg-black">
        <img
          src={reserveLogo}
          alt="Reserve"
          className="w-full h-auto object-contain"
        />
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
                        ? 'bg-zinc-700 text-white border border-zinc-600'
                        : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-zinc-700 bg-zinc-800 text-xs text-zinc-400">
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
