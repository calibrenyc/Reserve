import React, { useState, useEffect } from 'react';
import { Landmark, Plus, AlertCircle, CheckCircle } from 'lucide-react';
import { Deposit } from '../types';

export const DepositsView: React.FC = () => {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [bDate, setBDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedCash, setExpectedCash] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [refNum, setRefNum] = useState('');

  const fetchDeposits = () => {
    fetch('/api/deposits')
      .then(res => res.json())
      .then(data => setDeposits(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchDeposits();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expectedCash || !actualCash) return;

    const exp = parseFloat(expectedCash) || 0;
    const act = parseFloat(actualCash) || 0;

    await fetch('/api/deposits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_date: bDate,
        deposit_date: bDate,
        expected_cash: exp,
        actual_cash: act,
        deposit_amount: act,
        deposit_reference: refNum
      })
    });

    setExpectedCash('');
    setActualCash('');
    setRefNum('');
    fetchDeposits();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100">Daily Deposit Management</h2>
        <p className="text-zinc-400 text-sm">Track expected vs counted cash, calculate cash over/short, and record bank references</p>
      </div>

      <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl flex items-center gap-3">
        <input
          type="date"
          value={bDate}
          onChange={e => setBDate(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
        />

        <input
          type="number"
          step="0.01"
          placeholder="Expected Cash ($)"
          value={expectedCash}
          onChange={e => setExpectedCash(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 flex-1 focus:border-emerald-500 focus:outline-none"
        />

        <input
          type="number"
          step="0.01"
          placeholder="Actual Cash Counted ($)"
          value={actualCash}
          onChange={e => setActualCash(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm font-bold text-emerald-400 flex-1 focus:border-emerald-500 focus:outline-none"
        />

        <input
          type="text"
          placeholder="Deposit Slip / Ref #"
          value={refNum}
          onChange={e => setRefNum(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 w-44 focus:border-emerald-500 focus:outline-none"
        />

        <button
          type="submit"
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-emerald-950/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Record Deposit</span>
        </button>
      </form>

      {/* Deposits Table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs font-semibold tracking-wider border-b border-zinc-700">
            <tr>
              <th className="p-4">Business Date</th>
              <th className="p-4">Expected Cash</th>
              <th className="p-4">Actual Cash</th>
              <th className="p-4">Over / Short</th>
              <th className="p-4">Reference #</th>
              <th className="p-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {deposits.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-400 italic">No deposit logs recorded yet.</td>
              </tr>
            ) : (
              deposits.map(d => (
                <tr key={d.id} className="hover:bg-zinc-800/60 transition-colors">
                  <td className="p-4 font-semibold text-zinc-100 flex items-center space-x-2">
                    <Landmark className="w-4 h-4 text-emerald-400" />
                    <span>{d.business_date}</span>
                  </td>
                  <td className="p-4 text-zinc-300">${d.expected_cash.toFixed(2)}</td>
                  <td className="p-4 font-bold text-emerald-400">${d.actual_cash.toFixed(2)}</td>
                  <td className="p-4">
                    <span className={`font-semibold ${d.over_short < 0 ? 'text-rose-400' : d.over_short > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      ${d.over_short.toFixed(2)}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-xs text-zinc-400">{d.deposit_reference || '—'}</td>
                  <td className="p-4 text-right">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {d.status}
                    </span>
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
