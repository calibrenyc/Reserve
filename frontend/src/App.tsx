import React, { useEffect, useState } from 'react';
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
import { LoginView } from './views/LoginView';
import { AdminView } from './views/AdminView';
import { BusinessStartView } from './views/BusinessStartView';
import { apiFetch } from './api';

export function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [reviewInvoiceId, setReviewInvoiceId] = useState<string | null>(null);
  const [countEntry, setCountEntry] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  useEffect(() => { if (!localStorage.getItem('reserve_token')) return; apiFetch('/api/admin/me').then(r=>r.ok?r.json():Promise.reject()).then(setSession).catch(()=>localStorage.removeItem('reserve_token')); }, []);
  useEffect(() => { const nativeFetch = window.fetch; window.fetch = apiFetch as typeof fetch; return () => { window.fetch = nativeFetch; }; }, []);
  if (!session) return <LoginView onLogin={setSession} />;

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
      case 'admin':
        return <AdminView />;
      case 'business-start':
        return <BusinessStartView />;
      default:
        return <DashboardView onNavigate={(tab) => setCurrentTab(tab)} />;
    }
  };

  return (
    <div className="flex h-screen bg-black text-slate-100 overflow-hidden font-sans">
      <Sidebar canAdmin={session.permissions?.some((p:string) => ['users.view', 'locations.view', 'organization.view', 'audit.view'].includes(p))} canManageItems={session.permissions?.includes('items.view')} canBusinessStart={session.permissions?.includes('items.import')} currentTab={currentTab} setCurrentTab={(tab) => {
        setCurrentTab(tab);
        setReviewInvoiceId(null);
        setCountEntry(null);
      }} />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex justify-end items-center gap-3 text-sm text-zinc-400"><span>{session.organization || 'Reserve Demo'}</span><select aria-label="Selected location" value={localStorage.getItem('reserve_location_id') || ''} onChange={e=>{localStorage.setItem('reserve_location_id', e.target.value); window.location.reload();}} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-100">{session.locations?.map((l:any)=><option key={l.id} value={l.id}>{l.name}</option>)}</select><button className="text-zinc-400 hover:text-white" onClick={()=>{localStorage.removeItem('reserve_token');localStorage.removeItem('reserve_location_id');setSession(null)}}>Sign out</button></div>
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
