import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle } from 'lucide-react';

export const SalesImportView: React.FC = () => {
  const [imports, setImports] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchImports = () => {
    fetch('/api/sales/imports')
      .then(res => res.json())
      .then(data => setImports(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchImports();
  }, []);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setErrorMsg(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/sales/import', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.detail || 'Import failed.');
      } else {
        fetchImports();
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Import error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">PMIX Sales Import</h2>
          <p className="text-slate-400 text-sm">Import POS item sales CSV files with duplicate detection</p>
        </div>

        <label className="cursor-pointer px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 shadow-lg">
          <Upload className="w-4 h-4" />
          <span>{uploading ? 'Importing CSV...' : 'Upload PMIX CSV'}</span>
          <input
            type="file"
            accept=".csv"
            onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl flex items-center space-x-3 text-rose-400 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* History Table */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs font-semibold tracking-wider border-b border-slate-700/80">
            <tr>
              <th className="p-4">Filename</th>
              <th className="p-4">Business Date</th>
              <th className="p-4">Total Records</th>
              <th className="p-4">Total Net Sales</th>
              <th className="p-4">Imported At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {imports.map(imp => (
              <tr key={imp.id} className="hover:bg-slate-700/30">
                <td className="p-4 font-bold text-slate-100 flex items-center space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                  <span>{imp.filename}</span>
                </td>
                <td className="p-4 text-slate-300">{imp.business_date}</td>
                <td className="p-4 text-slate-300">{imp.total_records} items</td>
                <td className="p-4 font-bold text-emerald-400">${imp.total_net_sales.toFixed(2)}</td>
                <td className="p-4 text-slate-400 text-xs">{new Date(imp.import_date).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

