import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, RefreshCw, Trash2, Plus, FileText, Save, Unlock } from 'lucide-react';
import { Invoice, InventoryItem, InvoiceLine } from '../types';

interface InvoiceReviewModalProps {
  invoiceId: string;
  onClose: () => void;
  onApproved: () => void;
  standalone?: boolean;
  isAdmin?: boolean;
}

export const InvoiceReviewModal: React.FC<InvoiceReviewModalProps> = ({ invoiceId, onClose, onApproved, standalone = false, isAdmin = true }) => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [mappingLineIndex, setMappingLineIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reparsing, setReparsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [debug, setDebug] = useState<any>(null);
  const [selectedRowDebugId, setSelectedRowDebugId] = useState<string | null>(null);

  const cleanInvoiceLines = (rawLines: InvoiceLine[]): InvoiceLine[] => {
    return (Array.isArray(rawLines) ? rawLines : []).map(line => {
      let q: number | null = null;
      if (line.quantity != null && String(line.quantity).trim() !== '') {
        const numQ = Number(line.quantity);
        if (!Number.isNaN(numQ)) {
          q = Number.isInteger(numQ) ? numQ : parseFloat(numQ.toFixed(4));
        }
      }
      let c: string | null = null;
      if (line.unit_cost != null && String(line.unit_cost).trim() !== '') {
        const numC = Number(line.unit_cost);
        if (!Number.isNaN(numC)) {
          c = numC.toFixed(2);
        }
      }
      const qNum = q != null ? Number(q) : null;
      const cNum = c != null ? parseFloat(c) : null;
      const ext = qNum != null && cNum != null ? Math.round(qNum * cNum * 100) / 100 : (line.extended_cost != null ? Math.round(Number(line.extended_cost) * 100) / 100 : null);
      return {
        ...line,
        quantity: q,
        unit_cost: c as any,
        extended_cost: ext
      };
    });
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/invoices/${invoiceId}`).then(res => res.json()),
      fetch('/api/items').then(res => res.json())
    ]).then(([invData, itemsData]) => {
      setInvoice({
        ...invData,
        subtotal: invData.subtotal != null ? Number(invData.subtotal).toFixed(2) : '0.00',
        tax: invData.tax != null ? Number(invData.tax).toFixed(2) : '0.00',
        delivery_fees: invData.delivery_fees != null ? Number(invData.delivery_fees).toFixed(2) : '0.00',
        total_amount: invData.total_amount != null ? Number(invData.total_amount).toFixed(2) : '0.00',
        lines: cleanInvoiceLines(invData.lines)
      });
      setInventoryItems(Array.isArray(itemsData) ? itemsData : []);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [invoiceId]);

  const loadDiagnostics = async () => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/debug`);
      setDebug(response.ok ? await response.json() : null);
    } catch (error) {
      console.error('Unable to load invoice diagnostics', error);
    }
  };

  const handleLineChange = (index: number, field: keyof InvoiceLine, value: any) => {
    if (!invoice) return;
    const updatedLines = [...(invoice.lines || [])];
    const currentLine = { ...updatedLines[index] };

    (currentLine as any)[field] = value;
    currentLine.validation_status = 'Verified';
    currentLine.confidence = 100;

    const qVal = currentLine.quantity;
    const cVal = currentLine.unit_cost;

    const qNum = qVal != null && String(qVal).trim() !== '' ? parseFloat(String(qVal)) : null;
    const cNum = cVal != null && String(cVal).trim() !== '' ? parseFloat(String(cVal)) : null;

    if (qNum != null && cNum != null && !Number.isNaN(qNum) && !Number.isNaN(cNum)) {
      currentLine.extended_cost = Math.round(qNum * cNum * 100) / 100;
    }

    updatedLines[index] = currentLine;
    const newSubtotal = updatedLines.reduce((acc, l) => acc + (Number(l.extended_cost) || 0), 0);
    const subFixed = (Math.round(newSubtotal * 100) / 100).toFixed(2);
    const taxNum = parseFloat(String(invoice.tax || 0)) || 0;
    const delNum = parseFloat(String(invoice.delivery_fees || 0)) || 0;
    const totalFixed = (Math.round((newSubtotal + taxNum + delNum) * 100) / 100).toFixed(2);

    setInvoice({
      ...invoice,
      lines: updatedLines,
      subtotal: subFixed as any,
      total_amount: totalFixed as any
    });
  };

  const handleUnitCostBlur = (index: number) => {
    if (!invoice) return;
    const lines = [...(invoice.lines || [])];
    const line = lines[index];
    if (line && line.unit_cost != null && String(line.unit_cost).trim() !== '') {
      const num = parseFloat(String(line.unit_cost));
      if (!Number.isNaN(num)) {
        handleLineChange(index, 'unit_cost', num.toFixed(2));
      }
    }
  };

  const handleQuantityBlur = (index: number) => {
    if (!invoice) return;
    const lines = [...(invoice.lines || [])];
    const line = lines[index];
    if (line && line.quantity != null && String(line.quantity).trim() !== '') {
      const num = parseFloat(String(line.quantity));
      if (!Number.isNaN(num)) {
        handleLineChange(index, 'quantity', Number.isInteger(num) ? num : parseFloat(num.toFixed(4)));
      }
    }
  };

  const handleAddLineItem = () => {
    if (!invoice) return;
    const currentLines = invoice.lines || [];
    const newLine: InvoiceLine = {
      line_number: currentLines.length + 1,
      description: 'NEW ITEM',
      quantity: 1,
      unit_cost: '0.00' as any,
      extended_cost: 0,
      confidence: 100,
      validation_status: 'Verified'
    };
    const updatedLines = [...currentLines, newLine];
    const newSubtotal = updatedLines.reduce((acc, l) => acc + (Number(l.extended_cost) || 0), 0);
    const subFixed = (Math.round(newSubtotal * 100) / 100).toFixed(2);
    const taxNum = parseFloat(String(invoice.tax || 0)) || 0;
    const delNum = parseFloat(String(invoice.delivery_fees || 0)) || 0;
    const totalFixed = (Math.round((newSubtotal + taxNum + delNum) * 100) / 100).toFixed(2);

    setInvoice({
      ...invoice,
      lines: updatedLines,
      subtotal: subFixed as any,
      total_amount: totalFixed as any
    });
  };

  const handleRemoveLineItem = (index: number) => {
    if (!invoice) return;
    const updatedLines = (invoice.lines || []).filter((_, i) => i !== index);
    const renumbered = updatedLines.map((l, i) => ({ ...l, line_number: i + 1 }));
    const newSubtotal = renumbered.reduce((acc, l) => acc + (Number(l.extended_cost) || 0), 0);
    const subFixed = (Math.round(newSubtotal * 100) / 100).toFixed(2);
    const taxNum = parseFloat(String(invoice.tax || 0)) || 0;
    const delNum = parseFloat(String(invoice.delivery_fees || 0)) || 0;
    const totalFixed = (Math.round((newSubtotal + taxNum + delNum) * 100) / 100).toFixed(2);

    setInvoice({
      ...invoice,
      lines: renumbered,
      subtotal: subFixed as any,
      total_amount: totalFixed as any
    });
  };

  const handleFeeChange = (field: 'subtotal' | 'tax' | 'delivery_fees' | 'total_amount', rawValue: string) => {
    if (!invoice) return;
    const updated = { ...invoice, [field]: rawValue as any, total_confidence: 100 };

    const subNum = parseFloat(String(field === 'subtotal' ? rawValue : updated.subtotal || 0)) || 0;
    const taxNum = parseFloat(String(field === 'tax' ? rawValue : updated.tax || 0)) || 0;
    const delNum = parseFloat(String(field === 'delivery_fees' ? rawValue : updated.delivery_fees || 0)) || 0;

    if (field !== 'total_amount') {
      updated.total_amount = (Math.round((subNum + taxNum + delNum) * 100) / 100).toFixed(2) as any;
    }

    setInvoice(updated);
  };

  const handleFeeBlur = (field: 'subtotal' | 'tax' | 'delivery_fees' | 'total_amount') => {
    if (!invoice) return;
    const val = (invoice as any)[field];
    if (val != null && String(val) !== '') {
      const num = parseFloat(String(val));
      if (!Number.isNaN(num)) {
        setInvoice(prev => prev ? { ...prev, [field]: num.toFixed(2) } : prev);
      }
    }
  };

  const handleSave = async (): Promise<boolean> => {
    if (!invoice) return false;
    setSaving(true);
    try {
      const payload = {
        ...invoice,
        invoice_date: invoice.invoice_date || null,
        due_date: invoice.due_date || null,
        vendor_id: invoice.vendor_id || null,
        po_number: invoice.po_number || null,
        vendor_confidence: invoice.vendor_confidence ?? 100,
        invoice_number_confidence: invoice.invoice_number_confidence ?? 100,
        total_confidence: invoice.total_confidence ?? 100,
        subtotal: parseFloat(String(invoice.subtotal || 0)) || 0,
        tax: parseFloat(String(invoice.tax || 0)) || 0,
        delivery_fees: parseFloat(String(invoice.delivery_fees || 0)) || 0,
        total_amount: parseFloat(String(invoice.total_amount || 0)) || 0,
        lines: (invoice.lines || []).map(l => ({
          ...l,
          description: l.description || '(missing description)',
          quantity: l.quantity != null && String(l.quantity) !== '' && !Number.isNaN(Number(l.quantity)) ? Number(l.quantity) : null,
          unit_cost: l.unit_cost != null && String(l.unit_cost) !== '' && !Number.isNaN(Number(l.unit_cost)) ? parseFloat(String(l.unit_cost)) : null,
          extended_cost: l.extended_cost != null && String(l.extended_cost) !== '' && !Number.isNaN(Number(l.extended_cost)) ? parseFloat(String(l.extended_cost)) : null,
          validation_status: l.validation_status || 'Verified',
          confidence: l.confidence ?? 100
        }))
      };

      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = await res.json();
        setInvoice({
          ...updated,
          subtotal: updated.subtotal != null ? Number(updated.subtotal).toFixed(2) : '0.00',
          tax: updated.tax != null ? Number(updated.tax).toFixed(2) : '0.00',
          delivery_fees: updated.delivery_fees != null ? Number(updated.delivery_fees).toFixed(2) : '0.00',
          total_amount: updated.total_amount != null ? Number(updated.total_amount).toFixed(2) : '0.00',
          lines: cleanInvoiceLines(updated.lines)
        });
        return true;
      } else {
        const err = await res.json();
        alert(`Error saving invoice: ${typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || err)}`);
        return false;
      }
    } catch (e) {
      console.error(e);
      alert('Failed to connect to backend server when saving.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleReparse = async () => {
    if (!invoice) return;
    setReparsing(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/reparse`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setInvoice({
          ...updated,
          subtotal: updated.subtotal != null ? Number(updated.subtotal).toFixed(2) : '0.00',
          tax: updated.tax != null ? Number(updated.tax).toFixed(2) : '0.00',
          delivery_fees: updated.delivery_fees != null ? Number(updated.delivery_fees).toFixed(2) : '0.00',
          total_amount: updated.total_amount != null ? Number(updated.total_amount).toFixed(2) : '0.00',
          lines: cleanInvoiceLines(updated.lines)
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReparsing(false);
    }
  };

  const handleDelete = async () => {
    if (!invoice) return;
    if (!window.confirm(`Are you sure you want to delete this invoice (${invoice.vendor_name_raw || 'Vendor'})? This action cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
      if (res.ok) {
        onApproved();
        onClose();
      } else {
        alert('Failed to delete invoice.');
      }
    } catch (e) {
      console.error(e);
      alert('Error deleting invoice.');
    } finally {
      setDeleting(false);
    }
  };

  const handleUnlock = async () => {
    if (!invoice) return;
    setIsUnlocked(true);
    setUnlocking(true);
    setInvoice(prev => prev ? { ...prev, status: 'Needs Review' } : prev);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/unlock`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setInvoice({
          ...updated,
          status: 'Needs Review',
          subtotal: updated.subtotal != null ? Number(updated.subtotal).toFixed(2) : '0.00',
          tax: updated.tax != null ? Number(updated.tax).toFixed(2) : '0.00',
          delivery_fees: updated.delivery_fees != null ? Number(updated.delivery_fees).toFixed(2) : '0.00',
          total_amount: updated.total_amount != null ? Number(updated.total_amount).toFixed(2) : '0.00',
          lines: cleanInvoiceLines(updated.lines)
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUnlocking(false);
    }
  };

  const handleApprove = async () => {
    if (!invoice) return;
    setApproving(true);
    try {
      const saved = await handleSave();
      if (!saved) {
        setApproving(false);
        return;
      }

      const res = await fetch(`/api/invoices/${invoice.id}/approve`, {
        method: 'POST'
      });
      if (res.ok) {
        setIsUnlocked(false);
        onApproved();
        onClose();
      } else {
        const err = await res.json();
        alert(`Error approving invoice: ${err.detail || 'Unknown error'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to connect to backend server.');
    } finally {
      setApproving(false);
    }
  };

  const getConfidenceBadge = (conf?: number) => {
    if (conf === undefined || conf === null) return null;
    if (conf >= 80) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 ml-1.5">
          <CheckCircle className="w-3.5 h-3.5 mr-1" /> {conf}%
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 ml-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> {conf}% Attention
        </span>
      );
    }
  };

  if (loading || !invoice) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center">
        <div className="text-zinc-200 font-bold text-lg">Loading Invoice & OCR Data...</div>
      </div>
    );
  }

  const lines = invoice.lines || [];
  const validation = debug?.validation;
  const selectedRowDebug = debug?.grouped_line_item_rows?.find((row: any) => row.debug_id === selectedRowDebugId);
  const isApproved = invoice.status === 'Approved' && !isUnlocked;

  return (
    <div className={standalone ? "h-full" : "fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6"}>
      {/* Outer Box: Styled in Zinc-800 Gray like the Sidebar */}
      <div className={standalone ? "bg-zinc-800 border border-zinc-700 rounded-xl w-full h-full flex flex-col shadow-2xl overflow-hidden" : "bg-zinc-800 border border-zinc-700 rounded-xl w-full max-w-7xl h-[94vh] flex flex-col shadow-2xl overflow-hidden"}>
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-700 flex items-center justify-between bg-zinc-900 shrink-0">
          <div className="flex items-center space-x-3">
            <h3 className="font-bold text-xl text-zinc-100">
              Invoice Review: <span className="text-emerald-400 font-extrabold">{invoice.vendor_name_raw || 'Vendor'}</span>
            </h3>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${isApproved ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/15 text-amber-300 border border-amber-500/40'}`}>
              {invoice.status}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            {isApproved ? (
              <>
                <span className="px-3.5 py-2 bg-emerald-950/60 text-emerald-400 font-bold text-xs sm:text-sm rounded-lg border border-emerald-500/40 flex items-center space-x-1.5 shadow-md">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>Approved (Read-Only)</span>
                </span>
                {isAdmin && (
                  <button
                    onClick={handleUnlock}
                    disabled={unlocking}
                    className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs sm:text-sm rounded-lg flex items-center space-x-2 transition-colors border border-amber-500/40 cursor-pointer shadow-md"
                    title="Unlock this approved invoice for editing (Admin Test Mode)"
                  >
                    <Unlock className={`w-4 h-4 text-amber-400 ${unlocking ? 'animate-spin' : ''}`} />
                    <span>{unlocking ? 'Unlocking...' : 'Unlock Invoice (Admin)'}</span>
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleReparse}
                  disabled={reparsing}
                  className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs sm:text-sm rounded-lg flex items-center space-x-2 transition-colors border border-zinc-700 cursor-pointer"
                  title="Re-run Local OCR extraction on original invoice file"
                >
                  <RefreshCw className={`w-4 h-4 text-emerald-400 ${reparsing ? 'animate-spin' : ''}`} />
                  <span>{reparsing ? 'Running OCR…' : 'Re-run OCR'}</span>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-semibold text-xs sm:text-sm rounded-lg flex items-center space-x-2 transition-colors border border-rose-500/30 cursor-pointer"
                  title="Delete this invoice"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{deleting ? 'Deleting...' : 'Delete'}</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-semibold text-xs sm:text-sm rounded-lg flex items-center space-x-2 transition-colors border border-zinc-700 cursor-pointer shadow-md"
                  title="Save changes to invoice"
                >
                  <Save className={`w-4 h-4 text-emerald-400 ${saving ? 'animate-spin' : ''}`} />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base rounded-lg flex items-center space-x-2 transition-colors shadow-lg shadow-emerald-950/40 cursor-pointer"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span>{approving ? 'Approving...' : 'Approve & Post to Ledger'}</span>
                </button>
              </>
            )}
            <button
              onClick={loadDiagnostics}
              className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs sm:text-sm rounded-lg flex items-center space-x-2 transition-colors border border-zinc-700 cursor-pointer"
              title="Load the full OCR token and spatial-grouping diagnostics only when needed"
            >
              <FileText className="w-4 h-4 text-zinc-400" />
              <span>{debug ? 'Reload Diagnostics' : 'Load Diagnostics'}</span>
            </button>
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-100 cursor-pointer">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 bg-zinc-800">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3.5 text-xs sm:text-sm text-zinc-300 flex flex-wrap gap-x-5 gap-y-1.5">
            <span className="font-bold text-emerald-400">
              {lines.filter(l => l.validation_status === 'Verified').length}/{lines.length} line items verified
            </span>
            <span className={lines.filter(l => l.validation_status !== 'Verified').length > 0 ? 'text-amber-300 font-semibold' : 'text-zinc-400'}>
              {lines.filter(l => l.validation_status !== 'Verified').length} require review
            </span>
            <span>{validation?.line_totals_match_subtotal !== false ? 'Line totals match subtotal ✓' : 'Line totals need review'}</span>
            <span>{validation?.grand_total_matches !== false ? 'Grand total calculation matches ✓' : 'Grand total needs review'}</span>
          </div>

          {debug?.diagnostics && <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-3.5 text-xs sm:text-sm text-zinc-300 flex flex-wrap gap-x-5 gap-y-1.5"><span>{debug.diagnostics.ocr_token_count} OCR tokens</span><span>Avg confidence {debug.diagnostics.average_ocr_confidence}</span><span>{debug.diagnostics.candidate_table_regions_found} candidate tables</span><span>{debug.diagnostics.detected_columns} columns / {debug.diagnostics.rows_detected} table rows</span><span>{debug.diagnostics.tokens_assigned_to_invoice_fields} assigned</span><span>{debug.diagnostics.unassigned_tokens} unassigned</span>{debug.diagnostics.failure_reason && <span className="text-amber-300">Grouping: {debug.diagnostics.failure_reason}</span>}</div>}
          {selectedRowDebug && <div className="rounded-xl border border-fuchsia-500/30 bg-zinc-900 p-3.5 text-xs font-mono text-zinc-300"><div className="text-fuchsia-300 font-bold mb-2">Row trace: {selectedRowDebug.debug_id}</div>{['description', 'quantity', 'unit_price', 'line_total'].map(field => <div key={field} className="mb-1"><span className="text-zinc-500 uppercase">{field}:</span> {(selectedRowDebug.source_boxes?.[field] || []).map((source: any) => `${source.text} @ x:${source.box[0]} y:${source.box[1]} (${source.assigned_column})`).join(' | ') || 'no source token'}</div>)}</div>}

          {/* Top Header Fields: Uniform Lighter Gray Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-zinc-900 p-4 sm:p-5 rounded-xl border border-zinc-700 shadow-inner">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
                Vendor Name {getConfidenceBadge(invoice.vendor_confidence)}
              </label>
              <input
                type="text"
                readOnly={isApproved}
                value={invoice.vendor_name_raw || ''}
                onChange={e => !isApproved && setInvoice({ ...invoice, vendor_name_raw: e.target.value, vendor_confidence: 100 })}
                className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm sm:text-base font-semibold text-zinc-100 focus:outline-none ${isApproved ? 'cursor-default opacity-90' : 'focus:border-emerald-500'}`}
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
                Invoice Number {getConfidenceBadge(invoice.invoice_number_confidence)}
              </label>
              <input
                type="text"
                readOnly={isApproved}
                value={invoice.invoice_number || ''}
                onChange={e => !isApproved && setInvoice({ ...invoice, invoice_number: e.target.value, invoice_number_confidence: 100 })}
                className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm sm:text-base font-semibold text-zinc-100 focus:outline-none ${isApproved ? 'cursor-default opacity-90' : 'focus:border-emerald-500'}`}
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
                Order Number (PO#)
              </label>
              <input
                type="text"
                readOnly={isApproved}
                placeholder="e.g. PO-9872"
                value={invoice.po_number || ''}
                onChange={e => !isApproved && setInvoice({ ...invoice, po_number: e.target.value })}
                className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm sm:text-base font-semibold text-amber-300 focus:outline-none ${isApproved ? 'cursor-default opacity-90' : 'focus:border-emerald-500'}`}
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">
                Invoice Date
              </label>
              <input
                type="date"
                readOnly={isApproved}
                value={invoice.invoice_date || ''}
                onChange={e => !isApproved && setInvoice({ ...invoice, invoice_date: e.target.value })}
                className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm sm:text-base font-semibold text-zinc-100 focus:outline-none ${isApproved ? 'cursor-default opacity-90' : 'focus:border-emerald-500'}`}
              />
            </div>
          </div>

          {/* Line Items Table Section: Uniform Lighter Gray Card */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300">
                Extracted Line Items ({lines.length})
              </h4>
              {!isApproved && (
                <button
                  onClick={handleAddLineItem}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-700 text-emerald-400 border border-zinc-700 font-bold text-xs sm:text-sm rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Line Item</span>
                </button>
              )}
            </div>

            <div className="border border-zinc-700 rounded-xl overflow-hidden shadow-xl bg-zinc-900">
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full text-left text-sm text-zinc-200">
                  <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-bold tracking-wider sticky top-0 z-10 border-b border-zinc-700">
                    <tr>
                      <th className="p-3.5 min-w-[280px]">SKU / Item Name</th>
                      <th className="p-3.5 min-w-[130px] text-center">Quantity</th>
                      <th className="p-3.5 min-w-[150px] text-right">Price / Unit</th>
                      <th className="p-3.5 min-w-[130px] text-right">Line Total</th>
                      <th className="p-3.5 min-w-[220px]">Inventory Item</th>
                      <th className="p-3.5 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 bg-zinc-900">
                    {lines.map((line, idx) => (
                      <tr key={idx} className={`hover:bg-zinc-800/60 transition-colors ${line.validation_status !== 'Verified' ? 'bg-amber-950/15' : ''}`} title={line.validation_status || 'Verified'}>
                        <td className="p-3.5 space-y-2">
                          <button onClick={() => setSelectedRowDebugId(line.debug_id || null)} className="text-xs font-mono text-fuchsia-400 hover:text-fuchsia-300 block">{line.debug_id || `row_${String(idx + 1).padStart(3, '0')}`}</button>
                          <input
                            type="text"
                            readOnly={isApproved}
                            value={line.vendor_sku || ''}
                            placeholder="Vendor SKU"
                            onChange={e => !isApproved && handleLineChange(idx, 'vendor_sku', e.target.value)}
                            className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-amber-300 focus:outline-none ${isApproved ? 'cursor-default opacity-90' : 'focus:border-emerald-500'}`}
                          />
                          <input
                            type="text"
                            readOnly={isApproved}
                            value={line.description || ''}
                            placeholder="Item Name / Description"
                            onChange={e => !isApproved && handleLineChange(idx, 'description', e.target.value)}
                            className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm sm:text-base font-semibold text-zinc-100 focus:outline-none ${isApproved ? 'cursor-default opacity-90' : 'focus:border-emerald-500'}`}
                          />
                        </td>
                        <td className="p-3.5 align-middle">
                          <input
                            type="text"
                            inputMode="numeric"
                            readOnly={isApproved}
                            value={line.quantity != null ? String(line.quantity) : ''}
                            onChange={e => !isApproved && handleLineChange(idx, 'quantity', e.target.value)}
                            onBlur={() => !isApproved && handleQuantityBlur(idx)}
                            className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 text-lg sm:text-xl font-extrabold text-center text-zinc-100 focus:outline-none h-14 shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isApproved ? 'cursor-default opacity-90' : 'hover:border-zinc-600 focus:border-emerald-500'}`}
                          />
                        </td>
                        <td className="p-3.5 align-middle">
                          <input
                            type="text"
                            inputMode="decimal"
                            readOnly={isApproved}
                            value={line.unit_cost != null ? String(line.unit_cost) : ''}
                            onChange={e => !isApproved && handleLineChange(idx, 'unit_cost', e.target.value)}
                            onBlur={() => !isApproved && handleUnitCostBlur(idx)}
                            className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 text-lg sm:text-xl font-extrabold text-right text-emerald-400 focus:outline-none h-14 shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isApproved ? 'cursor-default opacity-90' : 'hover:border-zinc-600 focus:border-emerald-500'}`}
                          />
                        </td>
                        <td className="p-3.5 align-middle text-right font-extrabold text-base sm:text-lg text-zinc-100">
                          {line.extended_cost == null ? '—' : `$${Number(line.extended_cost).toFixed(2)}`}
                          {line.validation_status !== 'Verified' && <span className="block text-xs font-normal text-amber-400 mt-1">{line.validation_status}</span>}
                        </td>
                        <td className="p-3.5 align-middle">
                          {isApproved ? (
                            <div className="w-full rounded-lg border border-emerald-500/50 bg-emerald-950/20 px-3 text-left text-xs sm:text-sm font-semibold text-emerald-300 h-14 flex items-center">
                              <span className="truncate">{line.mapped_inventory_item_id ? inventoryItems.find(item => item.id === line.mapped_inventory_item_id)?.name || 'Mapped item' : 'Unmapped'}</span>
                            </div>
                          ) : mappingLineIndex === idx ? (
                            <select
                              autoFocus
                              value={line.mapped_inventory_item_id || ''}
                              onChange={e => {
                                handleLineChange(idx, 'mapped_inventory_item_id', e.target.value);
                                setMappingLineIndex(null);
                              }}
                              onBlur={() => setMappingLineIndex(null)}
                              className="w-full bg-zinc-950 border border-emerald-500 rounded-lg px-3 text-xs sm:text-sm font-semibold text-emerald-300 focus:outline-none h-14"
                            >
                              <option value="">-- Select Internal Item --</option>
                              {inventoryItems.map(item => <option key={item.id} value={item.id}>{item.name} ({item.category})</option>)}
                            </select>
                          ) : (
                            <button onClick={() => setMappingLineIndex(idx)} className={`w-full rounded-lg border px-3 text-left text-xs sm:text-sm font-semibold transition-colors cursor-pointer h-14 flex items-center ${line.mapped_inventory_item_id ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-300' : 'border-amber-500/40 bg-zinc-950 text-amber-300 hover:bg-zinc-800'}`}>
                              <span className="truncate">{line.mapped_inventory_item_id ? inventoryItems.find(item => item.id === line.mapped_inventory_item_id)?.name || 'Mapped item' : 'Map inventory item'}</span>
                            </button>
                          )}
                        </td>
                        <td className="p-3.5 align-middle text-center">
                          {!isApproved && (
                            <button
                              onClick={() => handleRemoveLineItem(idx)}
                              className="text-zinc-500 hover:text-rose-400 transition-colors p-2.5 rounded-lg hover:bg-rose-500/10 cursor-pointer"
                              title="Delete Line Item"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Financial Totals Breakdown & Grand Total */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4 shadow-inner">
            <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300 border-b border-zinc-700 pb-2">
              Invoice Financial Summary & Grand Total
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">Subtotal</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-base sm:text-lg font-bold text-zinc-500 pointer-events-none">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    readOnly={isApproved}
                    value={invoice.subtotal ?? ''}
                    onChange={e => !isApproved && handleFeeChange('subtotal', e.target.value)}
                    onBlur={() => !isApproved && handleFeeBlur('subtotal')}
                    className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-8 pr-3 text-base sm:text-lg font-extrabold text-zinc-100 focus:outline-none h-14 shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isApproved ? 'cursor-default opacity-90' : 'hover:border-zinc-600 focus:border-emerald-500'}`}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">Tax</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-base sm:text-lg font-bold text-zinc-500 pointer-events-none">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    readOnly={isApproved}
                    value={invoice.tax ?? ''}
                    onChange={e => !isApproved && handleFeeChange('tax', e.target.value)}
                    onBlur={() => !isApproved && handleFeeBlur('tax')}
                    className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-8 pr-3 text-base sm:text-lg font-extrabold text-zinc-100 focus:outline-none h-14 shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isApproved ? 'cursor-default opacity-90' : 'hover:border-zinc-600 focus:border-emerald-500'}`}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-1.5">Delivery / Freight Fees</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-base sm:text-lg font-bold text-zinc-500 pointer-events-none">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    readOnly={isApproved}
                    value={invoice.delivery_fees ?? ''}
                    onChange={e => !isApproved && handleFeeChange('delivery_fees', e.target.value)}
                    onBlur={() => !isApproved && handleFeeBlur('delivery_fees')}
                    className={`w-full bg-zinc-950 border border-zinc-700 rounded-lg pl-8 pr-3 text-base sm:text-lg font-extrabold text-zinc-100 focus:outline-none h-14 shadow-inner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isApproved ? 'cursor-default opacity-90' : 'hover:border-zinc-600 focus:border-emerald-500'}`}
                  />
                </div>
              </div>

              {/* Grand Total: Green Highlight */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 block mb-1.5">
                  Grand Total {getConfidenceBadge(invoice.total_confidence)}
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-lg sm:text-xl font-extrabold text-emerald-400 pointer-events-none">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    readOnly={isApproved}
                    value={invoice.total_amount ?? ''}
                    onChange={e => !isApproved && handleFeeChange('total_amount', e.target.value)}
                    onBlur={() => !isApproved && handleFeeBlur('total_amount')}
                    className="w-full bg-zinc-950 border-2 border-emerald-500 font-extrabold text-emerald-400 text-lg sm:text-xl rounded-lg pl-9 pr-3 h-14 shadow-lg shadow-emerald-950/60 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-default opacity-90"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
