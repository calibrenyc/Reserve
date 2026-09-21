import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './views/DashboardView';
import { InvoicesView } from './views/InvoicesView';
import { VendorsView } from './views/VendorsView';
import { InventoryItemsView } from './views/InventoryItemsView';
import { CountsView } from './views/CountsView';
import { WasteView } from './views/WasteView';
import { RecipesView } from './views/RecipesView';
import { SalesImportView } from './views/SalesImportView';
import { AvTReportView } from './views/AvTReportView';
import { DepositsView } from './views/DepositsView';
import { BackupsView } from './views/BackupsView';
import { AuditLogView } from './views/AuditLogView';

export function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'invoices':
        return <InvoicesView />;
      case 'vendors':
        return <VendorsView />;
      case 'items':
        return <InventoryItemsView />;
      case 'counts':
        return <CountsView />;
      case 'waste':
        return <WasteView />;
      case 'recipes':
        return <RecipesView />;
      case 'sales':
        return <SalesImportView />;
      case 'deposits':
        return <DepositsView />;
      case 'avt':
        return <AvTReportView />;
      case 'backups':
        return <BackupsView />;
      case 'audit':
        return <AuditLogView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default App;

