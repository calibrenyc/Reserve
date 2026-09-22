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

  const handleDeleteInvoice = async (id: string, vendorName?: string, invNumber?: string) => {
    const label = `${vendorName || 'Vendor'} ${invNumber ? `#${invNumber}` : ''}`.trim();
    if (!window.confirm(`Are you sure you want to delete invoice ${label}? This cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchInvoices();
      } else {
        alert('Failed to delete invoice.');
      }
    } catch (e) {
      console.error(e);
      alert('Error deleting invoice.');
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

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
      }
    } catch (e) {
      console.error(e);
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

        {/* File Upload Button */}
        <label className="cursor-pointer px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-950/40 transition-colors">
          <Upload className="w-4 h-4" />
          <span>{uploading ? 'Processing Local OCR...' : 'Upload Invoice File'}</span>
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            className="hidden"
            disabled={uploading}
          />
        </label>
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
                        onClick={() => handleDeleteInvoice(inv.id, inv.vendor_name_raw, inv.invoice_number)}
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
    </div>
  );
};
