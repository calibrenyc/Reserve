import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './views/DashboardView';
import { InvoicesView } from './views/InvoicesView';
import { DocumentsView } from './views/DocumentsView';
import { VendorsView } from './views/VendorsView';
import { InventoryItemsView } from './views/InventoryItemsView';
import { CountsView } from './views/CountsView';
import { TransfersView } from './views/TransfersView';
import { WasteView } from './views/WasteView';
import { RecipesView } from './views/RecipesView';
import { SalesImportView } from './views/SalesImportView';
import { AvTReportView } from './views/AvTReportView';
import { DepositsView } from './views/DepositsView';
import { BackupsView } from './views/BackupsView';
import { AuditLogView } from './views/AuditLogView';
import { ScheduleView } from './views/ScheduleView';
import { InvoiceReviewModal } from './views/InvoiceReviewModal';

export function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [reviewInvoiceId, setReviewInvoiceId] = useState<string | null>(null);
  const [countEntry, setCountEntry] = useState<string | null>(null);

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView onNavigate={(tab) => setCurrentTab(tab)} />;
      case 'schedule':
        return <ScheduleView />;
      case 'invoices':
        return <InvoicesView onReviewInvoice={setReviewInvoiceId} />;
      case 'documents':
        return <DocumentsView onReviewInvoice={setReviewInvoiceId} />;
      case 'vendors':
        return <VendorsView />;
      case 'items':
        return <InventoryItemsView />;
      case 'counts':
        return <CountsView onNewCount={templateId => setCountEntry(templateId ? `template:${templateId}` : 'new')} onEditCount={countId => setCountEntry(countId)} />;
      case 'transfers':
        return <TransfersView />;
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
        return <DashboardView onNavigate={(tab) => setCurrentTab(tab)} />;
    }
  };

  return (
    <div className="flex h-screen bg-black text-slate-100 overflow-hidden font-sans">
      <Sidebar currentTab={currentTab} setCurrentTab={(tab) => {
        setCurrentTab(tab);
        setReviewInvoiceId(null);
        setCountEntry(null);
      }} />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {reviewInvoiceId ? (
            <InvoiceReviewModal
              invoiceId={reviewInvoiceId}
              standalone
              onClose={() => setReviewInvoiceId(null)}
              onApproved={() => setReviewInvoiceId(null)}
            />
          ) : countEntry ? <CountsView entryMode templateId={countEntry.startsWith('template:') ? countEntry.slice(9) : null} editCountId={countEntry === 'new' || countEntry.startsWith('template:') ? null : countEntry} onCloseEntry={() => setCountEntry(null)} /> : renderContent()}
        </div>
      </main>
    </div>
  );
}

export default App;
