import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, Clock, Trash2, Link2, RefreshCw } from 'lucide-react';
import { Invoice } from '../types';

interface DocumentsViewProps {
  onOpenInvoice?: (invoiceId: string) => void;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({ onOpenInvoice }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchInvoices = () => {
    setLoading(true);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        fetchInvoices();
      } else {
        alert('Failed to upload document.');
      }
    } catch (err) {
      console.error(err);
      alert('Error uploading document.');
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDelete = async (id: string, vendorName?: string) => {
    if (!window.confirm(`Delete invoice document for ${vendorName || 'Vendor'}?`)) return;
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      if (res.ok) fetchInvoices();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*,application/pdf"
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-400" />
            Documents Center
          </h2>
          <p className="text-slate-400 text-sm">Every uploaded invoice is stored here and linked to its Invoice Management record.</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-lg shadow-teal-950/40 cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          <span>{uploading ? 'Uploading Document…' : 'Upload Document'}</span>
        </button>
      </div>

      {/* Upload Dropzone Card */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-zinc-700 hover:border-teal-500 bg-zinc-900/60 hover:bg-zinc-900 rounded-xl p-8 text-center cursor-pointer transition-all group"
      >
        <UploadCloud className="w-12 h-12 text-teal-400 mx-auto mb-3 transition-transform group-hover:scale-110" />
        <h3 className="font-semibold text-slate-200 text-base">Click or drag files here to upload</h3>
        <p className="text-xs text-zinc-400 mt-1">Supports PDF invoices, scanned images (PNG, JPG, WEBP)</p>
      </div>

      {/* Document History Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-200">Uploaded Documents ({invoices.length})</h3>
        <button onClick={fetchInvoices} className="text-zinc-400 hover:text-slate-200 p-2 text-xs flex items-center gap-1 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Document Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-800">
            <tr>
              <th className="p-4">Document / File</th>
              <th className="p-4">Vendor</th>
              <th className="p-4">Linked invoice</th>
              <th className="p-4">Date</th>
              <th className="p-4 text-right">Total Amount</th>
              <th className="p-4 text-center">OCR Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">Loading document registry…</td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500">No documents uploaded yet. Click above to upload an invoice document.</td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="p-4 font-semibold text-slate-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-400 shrink-0" />
                    <span className="truncate max-w-[200px]">{inv.file_path ? inv.file_path.split(/[\/\\]/).pop() : `Invoice ${inv.id}`}</span>
                  </td>
                  <td className="p-4 text-zinc-300">{inv.vendor_name_raw || 'Unassigned'}</td>
                  <td className="p-4">
                    <p className="font-mono text-xs text-zinc-300">{inv.invoice_number || 'Invoice pending review'}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-teal-400"><Link2 className="h-3 w-3" />Used in Invoice Management</p>
                  </td>
                  <td className="p-4 text-zinc-400">{inv.invoice_date || '-'}</td>
                  <td className="p-4 text-right font-bold text-slate-100">
                    {Number(inv.total_amount) ? `$${Number(inv.total_amount).toFixed(2)}` : '-'}
                  </td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-bold ${
                      inv.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      inv.status === 'Needs Review' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      {inv.status === 'Approved' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {inv.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {onOpenInvoice && (
                      <button
                        onClick={() => onOpenInvoice(inv.id)}
                        className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded text-zinc-200 inline-flex items-center gap-1 border border-zinc-700 cursor-pointer"
                      >
                        <Link2 className="w-3.5 h-3.5 text-teal-400" />
                        <span>Open invoice</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(inv.id, inv.vendor_name_raw)}
                      className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                      title="Delete document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
