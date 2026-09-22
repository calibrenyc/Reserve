import React, { useState, useEffect } from 'react';
import { Building2, Plus, Phone } from 'lucide-react';
import { Vendor } from '../types';

export const VendorsView: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [name, setName] = useState('');
  const [accNum, setAccNum] = useState('');
  const [phone, setPhone] = useState('');

  const fetchVendors = () => {
    fetch('/api/vendors')
      .then(res => res.json())
      .then(data => setVendors(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch('/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, account_number: accNum, contact_phone: phone })
    });
    setName('');
    setAccNum('');
    setPhone('');
    fetchVendors();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100">Vendors Database</h2>
        <p className="text-zinc-400 text-sm">Manage vendor directories and account references</p>
      </div>

      {/* Add Vendor Form */}
      <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-700 p-4 rounded-xl flex items-center gap-3">
        <input
          type="text"
          placeholder="Vendor Name (e.g. Sysco, US Foods)"
          value={name}
          onChange={e => setName(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 flex-1 focus:border-emerald-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Account #"
          value={accNum}
          onChange={e => setAccNum(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 w-40 focus:border-emerald-500 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Phone #"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 w-40 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg flex items-center space-x-1.5 cursor-pointer shadow-lg shadow-emerald-950/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Vendor</span>
        </button>
      </form>

      {/* Vendor Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {vendors.map(vendor => (
          <div key={vendor.id} className="bg-zinc-900 border border-zinc-700 p-5 rounded-xl space-y-3 shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-100 text-base">{vendor.name}</h3>
                <p className="text-xs text-zinc-400">Acc #: {vendor.account_number || 'N/A'}</p>
              </div>
            </div>
            {vendor.contact_phone && (
              <p className="text-xs text-zinc-300 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-zinc-400" /> {vendor.contact_phone}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
