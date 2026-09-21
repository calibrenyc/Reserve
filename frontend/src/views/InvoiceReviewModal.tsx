import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, HelpCircle, Eye } from 'lucide-react';
import { Invoice, InventoryItem, InvoiceLine } from '../types';

interface InvoiceReviewModalProps {
  invoiceId: string;
  onClose: () => void;
  onApproved: () => void;
}

export const InvoiceReviewModal: React.FC<InvoiceReviewModalProps> = ({ invoiceId, onClose, onApproved }) => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/invoices/${invoiceId}`).then(res => res.json()),
      fetch('/api/items').then(res => res.json())
    ]).then(([invData, itemsData]) => {
      setInvoice({
        ...invData,
        lines: Array.isArray(invData.lines) ? invData.lines : []
      });
      setInventoryItems(Array.isArray(itemsData) ? itemsData : []);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [invoiceId]);

  const handleLineChange = (index: number, field: keyof InvoiceLine, value: any) => {
    if (!invoice) return;
    const updatedLines = [...(invoice.lines || [])];
    const currentLine = { ...updatedLines[index], [field]: value };

    if (field === 'quantity' || field === 'unit_cost') {
      const q = field === 'quantity' ? parseFloat(value) || 0 : Number(currentLine.quantity || 0);
      const c = field === 'unit_cost' ? parseFloat(value) || 0 : Number(currentLine.unit_cost || 0);
      currentLine.extended_cost = q * c;
    }

    updatedLines[index] = currentLine;
    const newSubtotal = updatedLines.reduce((acc, l) => acc + (Number(l.extended_cost) || 0), 0);

    setInvoice({
      ...invoice,
      lines: updatedLines,
      subtotal: newSubtotal,
      total_amount: newSubtotal + Number(invoice.tax || 0) + Number(invoice.delivery_fees || 0)
    });
  };

  const handleApprove = async () => {
    if (!invoice) return;
    setApproving(true);
    try {
      await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoice)
      });
      const res = await fetch(`/api/invoices/${invoice.id}/approve`, { method: 'POST' });
      if (res.ok) {
        onApproved();
        onClose();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setApproving(false);
    }
  };

  const getConfidenceBadge = (confidence: number = 100) => {
    const conf = Number(confidence || 0);
    if (conf >= 90) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="w-3 h-3 mr-1" /> {conf}%
        </span>
      );
    } else if (conf >= 75) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <HelpCircle className="w-3 h-3 mr-1" /> {conf}% Review
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" /> {conf}% Attention
        </span>
      );
    }
  };

  if (loading || !invoice) {
    return (
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="text-slate-200 font-semibold">Loading Invoice & OCR Data...</div>
      </div>
    );
  }

  const lines = invoice.lines || [];

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center space-x-3">
            <h3 className="font-bold text-lg text-slate-100">
              Invoice Review: <span className="text-sky-400">{invoice.vendor_name_raw || 'Vendor'}</span>
            </h3>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              {invoice.status}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg flex items-center space-x-2 transition-colors shadow-lg shadow-emerald-900/20"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{approving ? 'Approving...' : 'Approve & Post to Ledger'}</span>
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Split Screen Container */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* Left: Original File Preview / Text */}
          <div className="bg-slate-950 p-4 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-sky-400" /> Original Invoice Document Preview
              </h4>
              <span className="text-xs text-slate-500">Local OCR Extracted</span>
            </div>
            
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-y-auto text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
              {invoice.raw_ocr_text || "No OCR raw text extracted."}
            </div>
          </div>

          {/* Right: Extracted OCR Data & Interactive Review Form */}
          <div className="p-4 overflow-y-auto space-y-5 bg-slate-900">
            {/* Header Fields with Confidence Scores */}
            <div className="grid grid-cols-3 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Vendor Name {getConfidenceBadge(invoice.vendor_confidence)}
                </label>
                <input
                  type="text"
                  value={invoice.vendor_name_raw || ''}
                  onChange={e => setInvoice({ ...invoice, vendor_name_raw: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Invoice Number {getConfidenceBadge(invoice.invoice_number_confidence)}
                </label>
                <input
                  type="text"
                  value={invoice.invoice_number || ''}
                  onChange={e => setInvoice({ ...invoice, invoice_number: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Total Amount {getConfidenceBadge(invoice.total_confidence)}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={Number(invoice.total_amount || 0)}
                  onChange={e => setInvoice({ ...invoice, total_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-900 border border-slate-700 font-bold text-sky-400 rounded px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            {/* Line Items Table with Vendor SKU Mapping */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Extracted Line Items ({lines.length})
              </h4>

              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs text-slate-200">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                    <tr>
                      <th className="p-2.5">SKU / Description</th>
                      <th className="p-2.5 w-20">Qty</th>
                      <th className="p-2.5 w-24">Unit Cost</th>
                      <th className="p-2.5 w-24">Ext Cost</th>
                      <th className="p-2.5">Mapped Inventory Item</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900">
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-2.5 space-y-1">
                          <input
                            type="text"
                            value={line.vendor_sku || ''}
                            placeholder="Vendor SKU"
                            onChange={e => handleLineChange(idx, 'vendor_sku', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-amber-300"
                          />
                          <input
                            type="text"
                            value={line.description || ''}
                            onChange={e => handleLineChange(idx, 'description', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100"
                          />
                        </td>
                        <td className="p-2.5 align-top">
                          <input
                            type="number"
                            step="0.1"
                            value={Number(line.quantity || 0)}
                            onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100"
                          />
                        </td>
                        <td className="p-2.5 align-top">
                          <input
                            type="number"
                            step="0.01"
                            value={Number(line.unit_cost || 0)}
                            onChange={e => handleLineChange(idx, 'unit_cost', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-emerald-400 font-semibold"
                          />
                        </td>
                        <td className="p-2.5 align-top font-bold text-slate-100 pt-3">
                          ${Number(line.extended_cost || 0).toFixed(2)}
                        </td>
                        <td className="p-2.5 align-top">
                          <select
                            value={line.mapped_inventory_item_id || ''}
                            onChange={e => handleLineChange(idx, 'mapped_inventory_item_id', e.target.value)}
                            className={`w-full border rounded px-2 py-1.5 text-xs font-medium ${
                              line.mapped_inventory_item_id
                                ? 'bg-sky-950/60 border-sky-600/50 text-sky-200'
                                : 'bg-slate-950 border-amber-500/40 text-amber-300'
                            }`}
                          >
                            <option value="">-- Select Internal Item --</option>
                            {inventoryItems.map(item => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.category})
                              </option>
                            ))}
                          </select>
                          {!line.mapped_inventory_item_id && (
                            <span className="text-[10px] text-amber-400 mt-1 block">Unmapped item SKU</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
