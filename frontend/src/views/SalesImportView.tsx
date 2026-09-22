import React, { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react';

export const SalesImportView: React.FC = () => {
  const [imports, setImports] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchImports = () => {
    fetch('/api/sales/imports')
      .then(res => res.json())
      .then(data => setImports(Array.isArray(data) ? data : []))
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
          <h2 className="text-2xl font-bold text-zinc-100">PMIX Sales Import</h2>
          <p className="text-zinc-400 text-sm">Import POS item sales CSV files with duplicate detection</p>
        </div>

        <label className="cursor-pointer px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-950/40 transition-colors">
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
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-700">
            <tr>
              <th className="p-4">Filename</th>
              <th className="p-4">Business Date</th>
              <th className="p-4">Total Records</th>
              <th className="p-4">Total Net Sales</th>
              <th className="p-4">Imported At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {imports.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-400 italic">No PMIX sales imports recorded yet.</td>
              </tr>
            ) : (
              imports.map(imp => (
                <tr key={imp.id} className="hover:bg-zinc-800/60 transition-colors">
                  <td className="p-4 font-bold text-zinc-100 flex items-center space-x-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>{imp.filename}</span>
                  </td>
                  <td className="p-4 text-zinc-300">{imp.business_date}</td>
                  <td className="p-4 text-zinc-300">{imp.total_records} items</td>
                  <td className="p-4 font-bold text-emerald-400">${Number(imp.total_net_sales || 0).toFixed(2)}</td>
                  <td className="p-4 text-zinc-400 text-xs">{new Date(imp.import_date).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
