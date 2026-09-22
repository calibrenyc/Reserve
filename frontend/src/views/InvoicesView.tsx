import React, { useState, useEffect } from 'react';
import { Upload, FileText, Eye, Trash2 } from 'lucide-react';
import { Invoice } from '../types';

interface InvoicesViewProps {
  onReviewInvoice: (invoiceId: string) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({ onReviewInvoice }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);

  const fetchInvoices = () => {
    fetch('/api/invoices')
      .then(res => res.json())
      .then(data => {
        setInvoices(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setInvoices([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleDeleteInvoice = async () => {
    if (!pendingDelete) return;
    try {
      const res = await fetch(`/api/invoices/${pendingDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPendingDelete(null);
        fetchInvoices();
      } else {
        alert('Failed to delete invoice.');
      }
    } catch (e) {
      console.error(e);
      alert('Error deleting invoice.');
    }
  };

  const handleFileUpload = async (file: File, ocrTemplate = 'auto') => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('ocr_template', ocrTemplate);

    try {
      const res = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const createdInvoice = await res.json();
        fetchInvoices();
        if (createdInvoice && createdInvoice.id) {
          onReviewInvoice(createdInvoice.id);
        }
      } else {
        const detail = await res.json().catch(() => null);
        alert(detail?.detail || 'Invoice processing failed. Please try again.');
      }
    } catch (e) {
      console.error(e);
      alert('Invoice processing failed. Please check that the local server is running.');
    } finally {
      setUploading(false);
    }
  };

  const invoiceList = Array.isArray(invoices) ? invoices : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100">Invoice Management</h2>
          <p className="text-zinc-400 text-sm">Upload vendor invoice files, run local OCR, and review line mappings</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="cursor-pointer px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-950/40 transition-colors">
            <Upload className="w-4 h-4" />
            <span>{uploading ? 'Processing Local OCR...' : 'Upload Invoice File'}</span>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => { const file = e.target.files?.[0]; if (file) setPendingUpload(file); e.currentTarget.value = ''; }} className="hidden" disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-700">
            <tr>
              <th className="p-4">Vendor</th>
              <th className="p-4">Invoice #</th>
              <th className="p-4">Order / PO #</th>
              <th className="p-4">Date</th>
              <th className="p-4">Total Amount</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-400">Loading Invoices...</td>
              </tr>
            ) : invoiceList.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-400 italic">
                  No invoices uploaded yet. Click "Upload Invoice File" to upload a PDF or image.
                </td>
              </tr>
            ) : (
              invoiceList.map(inv => (
                <tr key={inv.id} className="hover:bg-zinc-800/60 transition-colors">
                  <td className="p-4 font-medium text-zinc-100 flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>{inv.vendor_name_raw || 'Unknown Vendor'}</span>
                  </td>
                  <td className="p-4 text-zinc-300 font-mono text-xs">{inv.invoice_number || 'N/A'}</td>
                  <td className="p-4 text-amber-300 font-mono text-xs">{inv.po_number || '—'}</td>
                  <td className="p-4 text-zinc-300">{inv.invoice_date || 'N/A'}</td>
                  <td className="p-4 font-bold text-emerald-400">${Number(inv.total_amount || 0).toFixed(2)}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      inv.status === 'Approved'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {inv.status || 'Needs Review'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => onReviewInvoice(inv.id)}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Review OCR & Lines</span>
                      </button>
                      <button
                        onClick={() => setPendingDelete(inv)}
                        className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-xs transition-colors cursor-pointer"
                        title="Delete Invoice"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-invoice-title">
          <div className="w-full max-w-md rounded-xl border border-rose-500/40 bg-zinc-900 p-6 shadow-2xl">
            <h3 id="delete-invoice-title" className="text-lg font-bold text-zinc-100">Delete invoice?</h3>
            <p className="mt-2 text-sm text-zinc-400">This permanently removes {pendingDelete.vendor_name_raw || 'this invoice'}{pendingDelete.invoice_number ? ` #${pendingDelete.invoice_number}` : ''} and its line items.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setPendingDelete(null)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800">Cancel</button>
              <button onClick={handleDeleteInvoice} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">Delete invoice</button>
            </div>
          </div>
        </div>
      )}
      {pendingUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="invoice-template-title">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 id="invoice-template-title" className="text-lg font-bold text-zinc-100">Invoice template</h3>
            <p className="mt-2 text-sm text-zinc-300">Is <span className="font-semibold text-zinc-100">{pendingUpload.name}</span> a Marvel Produce invoice?</p>
            <p className="mt-1 text-xs text-zinc-500">Choose Yes to run the Marvel Produce template. You can add more vendor templates here as they are created.</p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button onClick={() => setPendingUpload(null)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800">Cancel</button>
              <button onClick={() => { const file = pendingUpload; setPendingUpload(null); handleFileUpload(file, 'auto'); }} className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800">No, auto-detect</button>
              <button onClick={() => { const file = pendingUpload; setPendingUpload(null); handleFileUpload(file, 'marvel_produce_v1'); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Yes, Marvel Produce</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
