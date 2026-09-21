import React, { useState, useEffect } from 'react';
import { Database, Download, RotateCcw, ShieldCheck } from 'lucide-react';

export const BackupsView: React.FC = () => {
  const [backups, setBackups] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchBackups = () => {
    fetch('/api/backups')
      .then(res => res.json())
      .then(data => setBackups(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateBackup = async () => {
    setCreating(true);
    await fetch('/api/backups/create', { method: 'POST' });
    setCreating(false);
    fetchBackups();
  };

  const handleRestore = async (filename: string) => {
    if (!confirm(`Are you sure you want to restore backup '${filename}'? This will replace your local database and files.`)) return;
    await fetch(`/api/backups/restore?filename=${encodeURIComponent(filename)}`, { method: 'POST' });
    alert('Backup restored successfully!');
    fetchBackups();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Database & System Backups</h2>
          <p className="text-slate-400 text-sm">Timestamped local ZIP archives including SQLite database, invoice files, and configuration</p>
        </div>

        <button
          onClick={handleCreateBackup}
          disabled={creating}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 shadow-lg"
        >
          <Database className="w-4 h-4" />
          <span>{creating ? 'Creating Archive...' : 'Create Backup Archive'}</span>
        </button>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs font-semibold tracking-wider border-b border-slate-700/80">
            <tr>
              <th className="p-4">Backup Archive Filename</th>
              <th className="p-4">Size</th>
              <th className="p-4">Created At</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {backups.map(b => (
              <tr key={b.filename} className="hover:bg-slate-700/30">
                <td className="p-4 font-bold text-slate-100 flex items-center space-x-2 font-mono text-xs">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>{b.filename}</span>
                </td>
                <td className="p-4 text-slate-300 font-mono text-xs">{(b.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                <td className="p-4 text-slate-400 text-xs">{new Date(b.created_at).toLocaleString()}</td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => handleRestore(b.filename)}
                    className="px-3 py-1 bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-semibold rounded inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore Archive</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

