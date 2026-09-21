import React, { useState, useEffect } from 'react';
import { Building2, Plus, Phone, Mail } from 'lucide-react';
import { Vendor } from '../types';

export const VendorsView: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [name, setName] = useState('');
  const [accNum, setAccNum] = useState('');
  const [phone, setPhone] = useState('');

  const fetchVendors = () => {
    fetch('/api/vendors')
      .then(res => res.json())
      .then(data => setVendors(data))
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
        <h2 className="text-2xl font-bold text-slate-100">Vendors Database</h2>
        <p className="text-slate-400 text-sm">Manage vendor directories and account references</p>
      </div>

      {/* Add Vendor Form */}
      <form onSubmit={handleCreate} className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-xl flex items-center gap-3">
        <input
          type="text"
          placeholder="Vendor Name (e.g. Sysco, US Foods)"
          value={name}
          onChange={e => setName(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 flex-1"
        />
        <input
          type="text"
          placeholder="Account #"
          value={accNum}
          onChange={e => setAccNum(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 w-40"
        />
        <input
          type="text"
          placeholder="Phone #"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 w-40"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-lg flex items-center space-x-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Add Vendor</span>
        </button>
      </form>

      {/* Vendor Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {vendors.map(vendor => (
          <div key={vendor.id} className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-xl space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-sky-500/10 rounded-lg text-sky-400">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">{vendor.name}</h3>
                <p className="text-xs text-slate-400">Acc #: {vendor.account_number || 'N/A'}</p>
              </div>
            </div>
            {vendor.contact_phone && (
              <p className="text-xs text-slate-300 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-500" /> {vendor.contact_phone}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

