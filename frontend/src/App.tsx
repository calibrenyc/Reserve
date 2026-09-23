import React, { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
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
  const [booting, setBooting] = useState(true);
  const [switchingLocation, setSwitchingLocation] = useState(false);
  useEffect(() => { if (!localStorage.getItem('reserve_token')) { setBooting(false); return; } apiFetch('/api/admin/me').then(r=>r.ok?r.json():Promise.reject()).then(setSession).catch(()=>localStorage.removeItem('reserve_token')).finally(()=>setBooting(false)); }, []);
  useEffect(() => { const nativeFetch = window.fetch; window.fetch = apiFetch as typeof fetch; return () => { window.fetch = nativeFetch; }; }, []);
  const switchLocation = async (locationId: string) => {
    if (locationId === (localStorage.getItem('reserve_location_id') || '')) return;
    setSwitchingLocation(true);
    const transitionStartedAt = Date.now();
    localStorage.setItem('reserve_location_id', locationId);
    try {
      const response = await apiFetch('/api/admin/me');
      if (!response.ok) throw new Error();
      setSession(await response.json());
      setReviewInvoiceId(null);
      setCountEntry(null);
    } catch { localStorage.removeItem('reserve_token'); setSession(null); }
    finally {
      // Keep the handoff visible long enough to feel deliberate, even on a fast local response.
      const remaining = Math.max(0, 900 - (Date.now() - transitionStartedAt));
      window.setTimeout(() => setSwitchingLocation(false), remaining);
    }
  };
  if (booting) return <div className="grid h-screen place-items-center bg-black text-emerald-400"><Clock3 className="h-9 w-9 animate-spin" /></div>;
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
        return <DocumentsView onOpenInvoice={(invoiceId) => { setCurrentTab('invoices'); setReviewInvoiceId(invoiceId); }} />;
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
    <div className="flex h-screen flex-col bg-black text-slate-100 overflow-hidden font-sans">
      <header className="flex h-14 shrink-0 items-center justify-between bg-[#075c3b] px-6 shadow-lg shadow-emerald-950/30">
        <div className="text-sm font-black tracking-[0.16em] text-white">{session.organization || 'RESERVE DEMO'}</div>
        <div className="flex items-center gap-3 text-sm"><select aria-label="Selected location" value={localStorage.getItem('reserve_location_id') || ''} onChange={e=>switchLocation(e.target.value)} disabled={switchingLocation} className="rounded border border-emerald-200/30 bg-emerald-950/30 px-3 py-1.5 font-medium text-white outline-none disabled:opacity-60">{session.locations?.map((l:any)=><option key={l.id} value={l.id} className="bg-zinc-900">{l.name}</option>)}</select><button className="font-medium text-emerald-100 hover:text-white" onClick={()=>{localStorage.removeItem('reserve_token');localStorage.removeItem('reserve_location_id');setSession(null)}}>Sign out</button></div>
      </header>
      <div className="flex min-h-0 flex-1">
      <Sidebar canAdmin={session.permissions?.some((p:string) => ['users.view', 'locations.view', 'organization.view', 'audit.view'].includes(p))} canManageItems={session.permissions?.includes('items.view')} canBusinessStart={session.permissions?.includes('items.import')} currentTab={currentTab} setCurrentTab={(tab) => {
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
          ) : countEntry ? <CountsView key={localStorage.getItem('reserve_location_id') || ''} entryMode templateId={countEntry.startsWith('template:') ? countEntry.slice(9) : null} editCountId={countEntry === 'new' || countEntry.startsWith('template:') ? null : countEntry} onCloseEntry={() => setCountEntry(null)} /> : <div key={localStorage.getItem('reserve_location_id') || ''}>{renderContent()}</div>}
        </div>
      </main>
      </div>
      {switchingLocation && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 backdrop-blur-sm"><div className="flex flex-col items-center gap-4 text-center"><div className="grid h-20 w-20 place-items-center rounded-full border border-emerald-400/30 bg-emerald-500/10"><Clock3 className="h-10 w-10 animate-spin text-emerald-400" /></div><div><p className="font-semibold text-zinc-100">Switching restaurant</p><p className="mt-1 text-sm text-zinc-400">Loading this location’s workspace…</p></div></div></div>}
    </div>
  );
}

export default App;
