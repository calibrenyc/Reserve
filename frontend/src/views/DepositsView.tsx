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
      .then(data => setDeposits(data))
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
        <h2 className="text-2xl font-bold text-slate-100">Daily Deposit Management</h2>
        <p className="text-slate-400 text-sm">Track expected vs counted cash, calculate cash over/short, and record bank references</p>
      </div>

      <form onSubmit={handleCreate} className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-xl flex items-center gap-3">
        <input
          type="date"
          value={bDate}
          onChange={e => setBDate(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
        />

        <input
          type="number"
          step="0.01"
          placeholder="Expected Cash ($)"
          value={expectedCash}
          onChange={e => setExpectedCash(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 flex-1"
        />

        <input
          type="number"
          step="0.01"
          placeholder="Actual Cash Counted ($)"
          value={actualCash}
          onChange={e => setActualCash(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-emerald-400 flex-1"
        />

        <input
          type="text"
          placeholder="Deposit Slip / Ref #"
          value={refNum}
          onChange={e => setRefNum(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 w-44"
        />

        <button
          type="submit"
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-lg flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Record Deposit</span>
        </button>
      </form>

      {/* Deposits Table */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-slate-200">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs font-semibold tracking-wider border-b border-slate-700/80">
            <tr>
              <th className="p-4">Business Date</th>
              <th className="p-4">Expected Cash</th>
              <th className="p-4">Actual Cash Counted</th>
              <th className="p-4">Over / Short</th>
              <th className="p-4">Ref #</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {deposits.map(d => (
              <tr key={d.id} className="hover:bg-slate-700/30">
                <td className="p-4 font-bold text-slate-100 flex items-center space-x-2">
                  <Landmark className="w-4 h-4 text-sky-400" />
                  <span>{d.business_date}</span>
                </td>
                <td className="p-4 text-slate-300">${d.expected_cash.toFixed(2)}</td>
                <td className="p-4 font-bold text-emerald-400">${d.actual_cash.toFixed(2)}</td>
                <td className={`p-4 font-extrabold ${d.over_short < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ${d.over_short.toFixed(2)}
                </td>
                <td className="p-4 text-slate-400 font-mono text-xs">{d.deposit_reference || 'N/A'}</td>
                <td className="p-4">
                  <span className="px-2.5 py-1 rounded bg-slate-900 text-slate-300 text-xs font-semibold border border-slate-800">
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

