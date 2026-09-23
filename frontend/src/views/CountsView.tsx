import React, { useState, useEffect, useRef } from 'react';
import { Boxes, Plus, FileSpreadsheet, Minus, Plus as PlusIcon, Trash2 } from 'lucide-react';
import { InventoryItem } from '../types';
import { apiFetch } from '../api';

interface CountsViewProps { onNewCount?: (templateId?: string) => void; onEditCount?: (countId: string) => void; entryMode?: boolean; editCountId?: string | null; templateId?: string | null; onCloseEntry?: () => void; }
interface CountTemplate { id: string; name: string; line_count: number; }
interface TemplateLine { inventory_item_id: string; item_name: string; storage_location: string; current_cost: number; }

export const CountsView: React.FC<CountsViewProps> = ({ onNewCount, onEditCount, entryMode = false, editCountId, templateId, onCloseEntry }) => {
  const [counts, setCounts] = useState<any[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(entryMode);
  const [countLines, setCountLines] = useState<{ [itemId: string]: string }>({});
  const [unitCounts, setUnitCounts] = useState<Record<string, Record<string, string>>>({});
  const [activeArea, setActiveArea] = useState<string>('');
  const [itemsLoadFailed, setItemsLoadFailed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [templates, setTemplates] = useState<CountTemplate[]>([]);
  const [templateLines, setTemplateLines] = useState<TemplateLine[] | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<{ id: string; name: string; lines: TemplateLine[] } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaveError, setTemplateSaveError] = useState('');
  const [templatePendingDeletion, setTemplatePendingDeletion] = useState<CountTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [templateDeleteError, setTemplateDeleteError] = useState('');
  const [countSaveError, setCountSaveError] = useState('');
  const countInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchCounts = () => {
    apiFetch('/api/inventory/counts')
      .then(res => res.json())
      .then(data => setCounts(Array.isArray(data) ? data : []))
      .catch(err => { console.error(err); setCounts([]); });
  };

  useEffect(() => {
    fetchCounts();
    apiFetch('/api/items')
      .then(res => {
        if (!res.ok) throw new Error('Unable to load inventory items');
        return res.json();
      })
      .then(data => {
        setItems(Array.isArray(data) ? data : []);
        setItemsLoadFailed(!Array.isArray(data));
      })
      .catch(err => {
        console.error(err);
        setItems([]);
        setItemsLoadFailed(true);
      });
  }, []);

  const fetchTemplates = () => apiFetch('/api/inventory/count-templates')
    .then(res => res.ok ? res.json() : [])
    .then(data => setTemplates(Array.isArray(data) ? data : []))
    .catch(error => { console.error(error); setTemplates([]); });
  useEffect(() => { fetchTemplates(); }, []);
  useEffect(() => {
    if (!templateId) { setTemplateLines(null); return; }
    apiFetch(`/api/inventory/count-templates/${templateId}`).then(res => res.json()).then(template => setTemplateLines(template.lines)).catch(console.error);
  }, [templateId]);

  useEffect(() => {
    setShowCreateModal(entryMode);
  }, [entryMode]);

  useEffect(() => {
    if (!editCountId) return;
    apiFetch(`/api/inventory/counts/${editCountId}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Unable to load count sheet')))
      .then(count => setCountLines(Object.fromEntries(count.lines.map((line: { inventory_item_id: string; counted_quantity: number }) => [line.inventory_item_id, String(line.counted_quantity)]))))
      .catch(error => console.error(error));
  }, [editCountId]);

  const handleSaveCount = async () => {
    setCountSaveError('');
    const lines = countItems.filter(item => countLines[item.id] !== '' || Object.values(unitCounts[item.id] || {}).some(qty => qty !== '')).map(item => {
      const quantities = unitCounts[item.id] || {};
      const qty = quantities[item.base_uom] ?? countLines[item.id] ?? '0';
      return {
        inventory_item_id: item.id,
        counted_quantity: Number(qty),
        counted_uom: item.base_uom || 'CS',
        storage_location: item.storage_location || 'Unassigned',
        cs_qty: Number(quantities.CS || 0), slv_qty: Number(quantities.SLV || 0), pk_qty: Number(quantities.PK || 0), btl_qty: Number(quantities.BTL || 0), ea_qty: Number(quantities.EA || 0)
      };
    });

    try {
      const res = await apiFetch(editCountId ? `/api/inventory/counts/${editCountId}` : '/api/inventory/counts', {
        method: editCountId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Count Sheet - ${new Date().toLocaleDateString()}`, lines })
      });
      if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.detail || `Unable to save count sheet (${res.status}).`); }
      if (entryMode) onCloseEntry?.(); else setShowCreateModal(false);
      setCountLines({}); fetchCounts();
    } catch (error) { setCountSaveError(error instanceof Error ? error.message : 'Unable to save count sheet.'); }
  };

  const countItems = templateLines ? items.filter(item => templateLines.some(line => line.inventory_item_id === item.id)).map(item => ({ ...item, storage_location: templateLines.find(line => line.inventory_item_id === item.id)?.storage_location || item.storage_location })) : items;
  const areas = Array.from(new Set(countItems.map(item => item.storage_location || 'Unassigned'))).sort();
  const selectedArea = activeArea || areas[0] || 'Unassigned';
  const areaItems = countItems.filter(item => (item.storage_location || 'Unassigned') === selectedArea);
  const areaCompleted = areaItems.filter(item => Object.prototype.hasOwnProperty.call(countLines, item.id) && countLines[item.id] !== '').length;
  const totalCompleted = countItems.filter(item => Object.prototype.hasOwnProperty.call(countLines, item.id) && countLines[item.id] !== '').length;

  const updateQuantity = (itemId: string, value: string) => setCountLines(current => ({ ...current, [itemId]: value }));
  const enabledUnits = (item: InventoryItem) => {
    if (item.enabled_count_units?.length) return item.enabled_count_units.map(unit => unit.toUpperCase());
    const units = new Set([item.base_uom?.toUpperCase()]);
    item.conversions?.forEach(conversion => { units.add(conversion.from_uom.toUpperCase()); units.add(conversion.to_uom.toUpperCase()); });
    return ['CS', 'SLV', 'PK', 'BTL', 'EA'].filter(unit => units.has(unit));
  };
  const unitFactor = (item: InventoryItem, fromUnit: string) => {
    const target = item.base_uom.toUpperCase();
    const queue: [string, number][] = [[fromUnit, 1]], seen = new Set<string>();
    while (queue.length) {
      const [unit, factor] = queue.shift()!;
      if (unit === target) return factor;
      if (seen.has(unit)) continue; seen.add(unit);
      item.conversions?.forEach(conversion => {
        const from = conversion.from_uom.toUpperCase(), to = conversion.to_uom.toUpperCase(), amount = Number(conversion.factor);
        if (from === unit) queue.push([to, factor * amount]);
        if (to === unit && amount) queue.push([from, factor / amount]);
      });
    }
    return fromUnit === target ? 1 : 0;
  };
  const unitCost = (item: InventoryItem, unit: string) => Number(item.current_cost || 0) * unitFactor(item, unit);
  const itemValue = (item: InventoryItem) => enabledUnits(item).reduce((total, unit) => total + Number(unitCounts[item.id]?.[unit] || 0) * unitCost(item, unit), 0);
  const totalValue = countItems.reduce((total, item) => total + itemValue(item), 0);
  const updateUnitQuantity = (itemId: string, unit: string, value: string) => setUnitCounts(current => ({ ...current, [itemId]: { ...(current[itemId] || {}), [unit]: value } }));
  const adjustUnitQuantity = (itemId: string, unit: string, change: number) => updateUnitQuantity(itemId, unit, String(Math.max(0, Number(unitCounts[itemId]?.[unit] || 0) + change)));
  const adjustQuantity = (itemId: string, change: number) => {
    const currentValue = Number(countLines[itemId] || 0);
    updateQuantity(itemId, String(Math.max(0, Number((currentValue + change).toFixed(2)))));
    requestAnimationFrame(() => countInputRefs.current[itemId]?.focus());
  };
  const focusNextItem = (itemIndex: number) => {
    const nextItem = areaItems[itemIndex + 1];
    if (nextItem) {
      countInputRefs.current[nextItem.id]?.focus();
      countInputRefs.current[nextItem.id]?.select();
    } else {
      const nextArea = areas[areas.indexOf(selectedArea) + 1];
      if (nextArea) setActiveArea(nextArea);
    }
  };

  const handleApprove = async (countId: string) => {
    await apiFetch(`/api/inventory/counts/${countId}/approve`, { method: 'POST' });
    fetchCounts();
  };

  const handleTemplateImport = async (file?: File) => {
    if (!file) return;
    setImportMessage(null);
    setImporting(true);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await apiFetch('/api/inventory/count-sheet-template/import', { method: 'POST', body: form });
      const text = await response.text();
      let result: any;
      try { result = JSON.parse(text); }
      catch { throw new Error(response.ok ? 'The server returned an unreadable import result. Please refresh and try again.' : `Import failed (${response.status}).`); }
      if (!response.ok) throw new Error(result.detail || 'Import failed');
      setImportMessage({ type: 'success', text: `Imported ${result.template_name}: ${result.created} new items, ${result.updated} updated, across ${result.areas.length} count areas.` });
      const itemsResponse = await apiFetch('/api/items');
      setItems(await itemsResponse.json());
      fetchTemplates();
    } catch (error) {
      setImportMessage({ type: 'error', text: error instanceof Error ? error.message : 'Count sheet import failed.' });
    } finally { setImporting(false); }
  };

  const handleDeleteTemplate = async () => {
    if (!templatePendingDeletion) return;
    setDeletingTemplate(true);
    setTemplateDeleteError('');
    try {
      const response = await apiFetch(`/api/inventory/count-templates/${templatePendingDeletion.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || 'Unable to delete the spreadsheet template.');
      }
      if (editingTemplate?.id === templatePendingDeletion.id) setEditingTemplate(null);
      setTemplatePendingDeletion(null);
      fetchTemplates();
    } catch (error) {
      setTemplateDeleteError(error instanceof Error ? error.message : 'Unable to delete the spreadsheet template.');
    } finally { setDeletingTemplate(false); }
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    setSavingTemplate(true);
    setTemplateSaveError('');
    try {
      const response = await apiFetch(`/api/inventory/count-templates/${editingTemplate.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingTemplate)
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || 'Unable to save the count sheet.');
      }
      const itemsResponse = await apiFetch('/api/items');
      if (!itemsResponse.ok) throw new Error('The count sheet saved, but the item list could not be refreshed.');
      setItems(await itemsResponse.json());
      setEditingTemplate(null);
      fetchTemplates();
    } catch (error) {
      setTemplateSaveError(error instanceof Error ? error.message : 'Unable to save the count sheet.');
    } finally { setSavingTemplate(false); }
  };

  return (
    <div className="space-y-6">
      {!entryMode && <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">Inventory Count Sheets</h2>
          <p className="text-zinc-400 text-sm">Perform stock counts, calculate valuation, and post approved counts to ledger</p>
        </div>
        <div className="flex items-center gap-3">
        <label className="cursor-pointer px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-sm rounded-xl flex items-center space-x-2 border border-zinc-700">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>{importing ? 'Importing…' : 'Import Count Sheet'}</span>
          <input type="file" accept=".xlsx,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf" className="hidden" disabled={importing} onChange={e => { handleTemplateImport(e.target.files?.[0]); e.currentTarget.value = ''; }} />
        </label>
        <button
          onClick={() => { setActiveArea(''); onNewCount ? onNewCount() : setShowCreateModal(true); }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 cursor-pointer shadow-lg shadow-emerald-950/40"
        >
          <Plus className="w-4 h-4" />
          <span>New Count Sheet</span>
        </button>
        </div>
      </div>}

      {!entryMode && <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
        <div className="mb-3"><h3 className="font-bold text-zinc-100">Count templates</h3><p className="text-xs text-zinc-400">Import an Excel or text-based PDF sheet to save it as a reusable template. Use Edit template to move items between count areas.</p></div>
        {templates.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-400">No templates yet. Select <span className="font-semibold text-emerald-400">Import Count Sheet</span> above to create one.</p> : <div className="flex flex-wrap gap-3">{templates.map(template => <div key={template.id} className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><div><p className="text-sm font-semibold text-zinc-200">{template.name}</p><p className="text-xs text-zinc-400">{template.line_count} items</p></div><button onClick={() => onNewCount?.(template.id)} className="rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer">Start count</button><button onClick={() => { setTemplateSaveError(''); apiFetch(`/api/inventory/count-templates/${template.id}`).then(res => res.ok ? res.json() : Promise.reject(new Error('Unable to load the count sheet.'))).then(setEditingTemplate).catch(error => setTemplateSaveError(error.message)); }} className="rounded bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 cursor-pointer">Edit template</button><button aria-label={`Delete ${template.name} spreadsheet template`} title="Delete spreadsheet" onClick={() => { setTemplateDeleteError(''); setTemplatePendingDeletion(template); }} className="rounded border border-red-900/70 bg-red-950/40 p-1.5 text-red-400 hover:bg-red-900/60 hover:text-red-200 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
      </div>}

      {!entryMode && importMessage && <div role="status" className={`rounded-lg border p-3 text-sm ${importMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}><div className="flex items-center justify-between gap-3"><span>{importMessage.text}</span><button onClick={() => setImportMessage(null)} className="shrink-0 text-xs font-semibold opacity-80 hover:opacity-100">Dismiss</button></div></div>}

      {templatePendingDeletion && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="delete-template-title" className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"><h3 id="delete-template-title" className="text-lg font-bold text-zinc-100">Delete spreadsheet?</h3><p className="mt-2 text-sm text-zinc-300">Delete <span className="font-semibold text-zinc-100">{templatePendingDeletion.name}</span>? Its inventory items and completed count sheets will be kept.</p>{templateDeleteError && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{templateDeleteError}</p>}<div className="mt-5 flex justify-end gap-3"><button disabled={deletingTemplate} onClick={() => setTemplatePendingDeletion(null)} className="rounded px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">Cancel</button><button disabled={deletingTemplate} onClick={handleDeleteTemplate} className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">{deletingTemplate ? 'Deleting…' : 'Delete spreadsheet'}</button></div></div></div>}

      {/* Counts List */}
      {!entryMode && <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-700">
            <tr>
              <th className="p-4">Count Sheet Name</th>
              <th className="p-4">Date</th>
              <th className="p-4">Total Valuation</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {counts.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-400 italic">No inventory counts recorded yet.</td>
              </tr>
            ) : (
              counts.map(c => (
                <tr key={c.id} className="hover:bg-zinc-800/60 transition-colors">
                  <td className="p-4 font-bold text-zinc-100 flex items-center space-x-2">
                    <Boxes className="w-4 h-4 text-emerald-400" />
                    <span>{c.name}</span>
                  </td>
                  <td className="p-4 text-zinc-300">{new Date(c.count_date).toLocaleDateString()}</td>
                  <td className="p-4 font-bold text-emerald-400">${parseFloat(c.total_valuation || 0).toFixed(2)}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      c.status === 'Approved'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {c.status !== 'Approved' && (
                      <div className="flex justify-end gap-2"><button onClick={() => onEditCount ? onEditCount(c.id) : setShowCreateModal(true)} className="px-3 py-1 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold rounded cursor-pointer">Edit</button><button onClick={() => handleApprove(c.id)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded cursor-pointer">Approve Count</button></div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>}

      {!entryMode && editingTemplate && <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5"><div className="mb-4"><h3 className="text-lg font-bold text-zinc-100">Edit template: {editingTemplate.name}</h3><p className="text-xs text-zinc-400">Change count areas and unit dollars here. Dollar changes update the item cost used for all valuations.</p></div>{templateSaveError && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{templateSaveError}</p>}<div className="mb-2 flex items-center gap-3 px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400"><span className="min-w-0 flex-1">Item</span><span className="w-24">Unit cost ($)</span><span className="w-44">Count area</span></div><div className="max-h-[60vh] space-y-2 overflow-y-auto">{editingTemplate.lines.map((line, index) => <div key={line.inventory_item_id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-2"><span className="min-w-0 flex-1 text-sm font-semibold text-zinc-200">{line.item_name}</span><input aria-label={`${line.item_name} unit cost`} type="number" min="0" step="0.01" value={line.current_cost} onChange={e => setEditingTemplate(current => current ? { ...current, lines: current.lines.map((row, rowIndex) => rowIndex === index ? { ...row, current_cost: Number(e.target.value) } : row) } : current)} className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-emerald-400 font-bold" /><input aria-label={`${line.item_name} count area`} value={line.storage_location} onChange={e => setEditingTemplate(current => current ? { ...current, lines: current.lines.map((row, rowIndex) => rowIndex === index ? { ...row, storage_location: e.target.value } : row) } : current)} className="w-44 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100" /></div>)}</div><div className="mt-4 flex justify-end gap-3 border-t border-zinc-800 pt-4"><button disabled={savingTemplate} onClick={() => setEditingTemplate(null)} className="text-sm text-zinc-400 hover:text-zinc-100 cursor-pointer disabled:opacity-50">Cancel</button><button disabled={savingTemplate} onClick={handleSaveTemplate} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 cursor-pointer disabled:opacity-50">{savingTemplate ? 'Saving…' : 'Save template & dollars'}</button></div></div>}

      {/* Create Count Modal */}
      {showCreateModal && (
        <div className={entryMode ? "min-h-[calc(100vh-4rem)]" : "fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"}>
          <div className={entryMode ? "bg-zinc-900 border border-zinc-700 rounded-xl w-full min-h-[calc(100vh-4rem)] p-5 space-y-4 flex flex-col shadow-2xl" : "bg-zinc-900 border border-zinc-700 rounded-xl max-w-2xl w-full p-5 space-y-4 max-h-[85vh] flex flex-col shadow-2xl"}>
            <div className="flex items-center justify-between">
              <div><h3 className="font-bold text-zinc-100 text-lg">{editCountId ? 'Edit Inventory Count' : 'Enter Inventory Stock Count'}</h3><p className="text-xs text-zinc-400">Count by operational area, then verify every item is entered.</p></div>
              <div className="text-right"><p className="text-xs text-zinc-400">Whole sheet</p><p className="font-bold text-emerald-400">{totalCompleted}/{countItems.length}</p><p className="mt-1 text-sm font-bold text-emerald-400">${totalValue.toFixed(2)}</p></div>
            </div>
            {countSaveError && <div className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{countSaveError}</div>}
            <div className="h-2 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${countItems.length ? totalCompleted / countItems.length * 100 : 0}%` }} /></div>
            <div className="flex min-h-0 flex-1 gap-4">
              <aside className="w-48 shrink-0 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Count areas</p>
                <div className="space-y-1">
                  {areas.map(area => {
                    const areaCount = countItems.filter(i => (i.storage_location || 'Unassigned') === area);
                    const completed = areaCount.filter(i => Object.prototype.hasOwnProperty.call(countLines, i.id) && countLines[i.id] !== '').length;
                    return <button key={area} onClick={() => setActiveArea(area)} className={`flex w-full items-center justify-between rounded-md px-3 py-3 text-left text-xs font-semibold transition-colors cursor-pointer ${selectedArea === area ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-300 hover:bg-zinc-800'}`}><span className="pr-2">{area}</span><span className={`rounded px-1.5 py-0.5 text-[10px] ${selectedArea === area ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>{completed}/{areaCount.length}</span></button>;
                  })}
                </div>
              </aside>
              <section className="min-w-0 flex-1 overflow-y-auto pr-2">
                <div className="sticky top-0 z-10 mb-3 bg-zinc-900 pb-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400"><span className="font-semibold text-zinc-200">{selectedArea}</span><span>{areaCompleted}/{areaItems.length} entered</span></div>
                  <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${areaItems.length ? areaCompleted / areaItems.length * 100 : 0}%` }} /></div>
                </div>
                <div className="space-y-2">
              {itemsLoadFailed ? (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Inventory items could not be loaded. Close this sheet and refresh the page.</div>
              ) : areaItems.length === 0 ? (
                <div className="rounded border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">No inventory items are assigned to this area yet.</div>
              ) : areaItems.map((item, index) => (
                <div key={item.id} className="flex items-center justify-between gap-3 bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <div>
                    <p className="font-semibold text-zinc-200">{item.name}</p>
                    <p className="text-xs text-zinc-400">{enabledUnits(item).map(unit => `${unit}: $${unitCost(item, unit).toFixed(2)}`).join(' | ')} | <span className="font-semibold text-emerald-400">Value: ${itemValue(item).toFixed(2)}</span></p>
                  </div>
                  <><div className="flex max-w-[60%] shrink-0 flex-wrap justify-end gap-2">{enabledUnits(item).map(unit => <div key={unit} className="flex items-center gap-1"><button type="button" onClick={() => adjustUnitQuantity(item.id, unit, -1)} className="grid h-10 w-10 place-items-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300"><Minus className="h-4 w-4" /></button><input type="number" min="0" step="0.1" value={unitCounts[item.id]?.[unit] ?? ''} onFocus={e => e.currentTarget.select()} onChange={e => updateUnitQuantity(item.id, unit, e.target.value)} className="h-10 w-20 rounded border border-zinc-700 bg-zinc-900 px-2 text-center font-bold text-zinc-100"/><button type="button" onClick={() => adjustUnitQuantity(item.id, unit, 1)} className="grid h-10 w-10 place-items-center rounded-md border border-emerald-700/70 bg-emerald-950 text-emerald-300"><PlusIcon className="h-4 w-4" /></button><span className="w-7 text-xs font-mono text-zinc-400">{unit}</span></div>)}</div><div className="hidden">
                    <button type="button" aria-label={`Subtract one ${item.base_uom} from ${item.name}`} onClick={() => adjustQuantity(item.id, -1)} className="grid h-10 w-10 place-items-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 cursor-pointer"><Minus className="h-4 w-4" /></button>
                    <input
                      ref={element => { countInputRefs.current[item.id] = element; }}
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      placeholder="—"
                      value={countLines[item.id] ?? ''}
                      onFocus={e => e.currentTarget.select()}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNextItem(index); } }}
                      onChange={e => updateQuantity(item.id, e.target.value)}
                      className="h-10 w-24 bg-zinc-900 border border-zinc-700 rounded px-2.5 text-base font-bold text-zinc-100 text-center focus:border-emerald-500 focus:outline-none"
                    />
                    <button type="button" aria-label={`Add one ${item.base_uom} to ${item.name}`} onClick={() => adjustQuantity(item.id, 1)} className="grid h-10 w-10 place-items-center rounded-md border border-emerald-700/70 bg-emerald-950 text-emerald-300 hover:bg-emerald-900 cursor-pointer"><PlusIcon className="h-4 w-4" /></button>
                    <span className="text-xs text-zinc-400 font-mono">{item.base_uom}</span>
                  </div></>
                </div>
              ))}
                </div>
              </section>
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t border-zinc-800">
              <button onClick={() => entryMode ? onCloseEntry?.() : setShowCreateModal(false)} className="px-4 py-2 text-zinc-400 hover:text-zinc-100 text-sm cursor-pointer">Cancel</button>
              <button onClick={handleSaveCount} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg cursor-pointer">{editCountId ? 'Save Changes' : 'Save Count Sheet'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
