import React, { useState, useEffect } from 'react';
import { UserCheck } from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/audit-log')
      .then(res => res.json())
      .then(data => setLogs(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100">System Audit Log</h2>
        <p className="text-zinc-400 text-sm">Immutable audit trail of major operational changes, approvals, and data modifications</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-700">
            <tr>
              <th className="p-4">Timestamp</th>
              <th className="p-4">Action</th>
              <th className="p-4">Entity Type</th>
              <th className="p-4">User</th>
              <th className="p-4">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-zinc-400 italic">No audit log records found.</td>
              </tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} className="hover:bg-zinc-800/60 transition-colors">
                  <td className="p-4 font-mono text-xs text-zinc-400">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="p-4 font-bold text-emerald-400">{log.action}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 rounded-md bg-zinc-950 text-zinc-300 text-xs border border-zinc-800 font-semibold">
                      {log.entity_type}
                    </span>
                  </td>
                  <td className="p-4 text-zinc-300 flex items-center space-x-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{log.user}</span>
                  </td>
                  <td className="p-4 text-xs text-zinc-300 font-mono">{log.new_value || log.details || 'N/A'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
