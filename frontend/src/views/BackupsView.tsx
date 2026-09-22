import React, { useState, useEffect } from 'react';
import { Database, RotateCcw, ShieldCheck } from 'lucide-react';

export const BackupsView: React.FC = () => {
  const [backups, setBackups] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchBackups = () => {
    fetch('/api/backups')
      .then(res => res.json())
      .then(data => setBackups(Array.isArray(data) ? data : []))
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
          <h2 className="text-2xl font-bold text-zinc-100">Database & System Backups</h2>
          <p className="text-zinc-400 text-sm">Timestamped local ZIP archives including SQLite database, invoice files, and configuration</p>
        </div>

        <button
          onClick={handleCreateBackup}
          disabled={creating}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl flex items-center space-x-2 shadow-lg shadow-emerald-950/40 cursor-pointer transition-colors"
        >
          <Database className="w-4 h-4" />
          <span>{creating ? 'Creating Archive...' : 'Create Backup Archive'}</span>
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-700">
            <tr>
              <th className="p-4">Backup Archive Filename</th>
              <th className="p-4">Size</th>
              <th className="p-4">Created At</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {backups.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-zinc-400 italic">No backup archives recorded yet.</td>
              </tr>
            ) : (
              backups.map(b => (
                <tr key={b.filename} className="hover:bg-zinc-800/60 transition-colors">
                  <td className="p-4 font-bold text-zinc-100 flex items-center space-x-2 font-mono text-xs">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>{b.filename}</span>
                  </td>
                  <td className="p-4 text-zinc-300 font-mono text-xs">{(b.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
                  <td className="p-4 text-zinc-400 text-xs">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleRestore(b.filename)}
                      className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Archive</span>
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
