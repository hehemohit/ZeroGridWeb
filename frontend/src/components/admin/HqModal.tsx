'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Building2, X, Search, Shield, Check, Loader2, MapPin, AlertCircle, Navigation } from 'lucide-react';

export interface AdminUserOption {
  id: string;
  displayName?: string;
  name?: string;
  email: string;
  role?: string;
  photoUrl?: string;
}

export interface HeadquartersUI {
  id: string;
  name: string;
  location: any;
  assignedAdmins: AdminUserOption[];
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
  updatedAt?: string;
}

interface HqModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (hqData: {
    name: string;
    location: string;
    assignedAdmins: string[];
    status: 'ACTIVE' | 'INACTIVE';
  }) => Promise<void>;
  editingHq: HeadquartersUI | null;
  adminUsers: AdminUserOption[];
  isLoadingAdmins: boolean;
}

export function HqModal({
  isOpen,
  onClose,
  onSave,
  editingHq,
  adminUsers,
  isLoadingAdmins
}: HqModalProps) {
  const [name, setName] = useState('');
  const [locationStr, setLocationStr] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state when modal opens or editingHq changes
  useEffect(() => {
    if (editingHq) {
      setName(editingHq.name || '');

      let loc = editingHq.location;
      if (typeof loc === 'object' && loc !== null) {
        if (Array.isArray(loc.coordinates)) {
          loc = `Coordinates: ${loc.coordinates[1]}, ${loc.coordinates[0]}`;
        } else {
          loc = JSON.stringify(loc);
        }
      }
      setLocationStr(loc || '');
      setStatus(editingHq.status || 'ACTIVE');

      const adminIds = (editingHq.assignedAdmins || []).map((a: any) =>
        typeof a === 'string' ? a : a.id || a._id
      );
      setSelectedAdminIds(adminIds.filter(Boolean));
    } else {
      setName('');
      setLocationStr('');
      setStatus('ACTIVE');
      setSelectedAdminIds([]);
    }
    setAdminSearch('');
    setErrorMsg(null);
  }, [editingHq, isOpen]);

  const filteredAdmins = useMemo(() => {
    return adminUsers.filter((u) => {
      const q = adminSearch.toLowerCase().trim();
      if (!q) return true;
      const uName = (u.displayName || u.name || '').toLowerCase();
      const uEmail = (u.email || '').toLowerCase();
      return uName.includes(q) || uEmail.includes(q);
    });
  }, [adminUsers, adminSearch]);

  const toggleAdmin = (adminId: string) => {
    setSelectedAdminIds((prev) =>
      prev.includes(adminId) ? prev.filter((id) => id !== adminId) : [...prev, adminId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Headquarters name is required.');
      return;
    }
    if (!locationStr.trim()) {
      setErrorMsg('Headquarters location is required.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        location: locationStr.trim(),
        assignedAdmins: selectedAdminIds,
        status
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save Headquarters.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-2xl max-h-[90vh] bg-surface rounded-16dp border border-hairlineBright shadow-2xl flex flex-col overflow-hidden text-primaryText">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-hairline flex items-center justify-between bg-surfaceElevated">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brandTeal/10 border border-brandTeal/30 flex items-center justify-center text-brandTeal shadow-glow-teal">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-primaryText font-display">
                {editingHq ? 'Edit Headquarters' : 'Create New Headquarters'}
              </h2>
              <p className="text-xs text-mutedGray mt-0.5">
                Define operational sector command post and assign authorized admin staff.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full border border-hairline hover:bg-surfaceCard flex items-center justify-center text-mutedGray hover:text-primaryText transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="px-5 py-3 bg-red-500/10 border-b border-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form id="hq-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-canvas">
          {/* HQ Name */}
          <div>
            <label className="block text-xs font-bold text-primaryText mb-1.5 font-mono uppercase tracking-wider">
              Headquarters Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sector Alpha Tactical Command Post"
              className="w-full bg-surface border border-hairline rounded-xl px-3.5 py-2.5 text-xs text-primaryText placeholder-mutedGray focus:outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/30"
              required
            />
          </div>

          {/* Location */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-primaryText font-mono uppercase tracking-wider">
                Location / Physical Coordinates <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        const coordsStr = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                        setLocationStr((prev) => (prev.trim() ? `${prev} (${coordsStr})` : `GPS Coordinates: ${coordsStr}`));
                      },
                      () => setErrorMsg('Unable to retrieve current GPS location')
                    );
                  }
                }}
                className="text-[10px] font-mono text-brandTeal hover:underline flex items-center gap-1 font-semibold"
              >
                <Navigation className="w-3 h-3" />
                <span>Use Current GPS</span>
              </button>
            </div>
            <div className="relative">
              <MapPin className="w-4 h-4 text-mutedGray absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={locationStr}
                onChange={(e) => setLocationStr(e.target.value)}
                placeholder="e.g. Sector 4 Command Base, New Delhi (28.6139, 77.2090)"
                className="w-full bg-surface border border-hairline rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-primaryText placeholder-mutedGray focus:outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/30"
                required
              />
            </div>
            <p className="text-[11px] text-mutedGray mt-1">
              Tip: Include latitude and longitude numbers (e.g. <code className="text-brandTeal">28.6139, 77.2090</code>) to render a precise marker on Google Maps.
            </p>
          </div>

          {/* Operational Status */}
          <div>
            <label className="block text-xs font-bold text-primaryText mb-1.5 font-mono uppercase tracking-wider">
              Operational Status
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStatus('ACTIVE')}
                className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  status === 'ACTIVE'
                    ? 'bg-brandTeal/10 border-brandTeal text-brandTeal shadow-sm'
                    : 'bg-surface border-hairline text-mutedGray hover:text-primaryText'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${status === 'ACTIVE' ? 'bg-brandTeal animate-pulse' : 'bg-gray-400'}`} />
                ACTIVE
              </button>
              <button
                type="button"
                onClick={() => setStatus('INACTIVE')}
                className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  status === 'INACTIVE'
                    ? 'bg-red-500/10 border-red-500 text-red-500 shadow-sm'
                    : 'bg-surface border-hairline text-mutedGray hover:text-primaryText'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${status === 'INACTIVE' ? 'bg-red-500' : 'bg-gray-400'}`} />
                INACTIVE
              </button>
            </div>
          </div>

          {/* Assigned Admins Multi-Select */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-primaryText font-mono uppercase tracking-wider">
                Assign Admin Personnel
              </label>
              <span className="text-[11px] font-mono text-brandTeal font-semibold">
                {selectedAdminIds.length} Selected
              </span>
            </div>

            <div className="bg-surface border border-hairline rounded-xl overflow-hidden shadow-sm">
              {/* Filter admins search inside dropdown */}
              <div className="p-2 border-b border-hairline bg-surfaceElevated relative">
                <Search className="w-3.5 h-3.5 text-mutedGray absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  placeholder="Filter admins by name or email..."
                  className="w-full bg-surface border border-hairline rounded-lg pl-8 pr-3 py-1.5 text-xs text-primaryText placeholder-mutedGray focus:outline-none focus:border-brandTeal"
                />
              </div>

              {/* Admin Checkbox List */}
              <div className="max-h-48 overflow-y-auto divide-y divide-hairline">
                {isLoadingAdmins ? (
                  <div className="p-4 text-center text-mutedGray text-xs flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-brandTeal" />
                    <span>Fetching active admins...</span>
                  </div>
                ) : filteredAdmins.length === 0 ? (
                  <div className="p-4 text-center text-mutedGray text-xs">
                    {adminSearch ? 'No matching admin found.' : 'No registered admin users found.'}
                  </div>
                ) : (
                  filteredAdmins.map((admin) => {
                    const isChecked = selectedAdminIds.includes(admin.id);
                    const adminName = admin.displayName || admin.name || admin.email;
                    return (
                      <div
                        key={admin.id}
                        onClick={() => toggleAdmin(admin.id)}
                        className={`p-3 flex items-center justify-between cursor-pointer transition-colors hover:bg-surfaceElevated/60 ${
                          isChecked ? 'bg-brandTeal/5' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            isChecked
                              ? 'bg-brandTeal text-white'
                              : 'bg-surfaceElevated text-secondaryText border border-hairline'
                          }`}>
                            <Shield className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-primaryText truncate">{adminName}</div>
                            <div className="text-[11px] text-mutedGray font-mono truncate">{admin.email}</div>
                          </div>
                        </div>

                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                          isChecked
                            ? 'bg-brandTeal border-brandTeal text-white'
                            : 'border-hairlineBright bg-surface'
                        }`}>
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-4 border-t border-hairline bg-surface flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-16dp bg-surfaceElevated border border-hairline text-secondaryText hover:text-primaryText font-semibold text-xs hover:bg-surfaceCard transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="hq-form"
            disabled={isSubmitting}
            className="px-5 py-2 rounded-16dp bg-brandTeal hover:bg-brandTealGlow text-white font-bold text-xs transition-colors shadow-glow-teal flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{editingHq ? 'Save Changes' : 'Create Headquarters'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
