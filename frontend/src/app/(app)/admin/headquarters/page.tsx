'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Users,
  Shield,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { MapCanvas } from '@/components/admin/MapCanvas';
import { HqModal, HeadquartersUI, AdminUserOption } from '@/components/admin/HqModal';

interface ToastNotification {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function HeadquartersPage() {
  const { user: currentUser } = useAuth();
  const router = useRouter();

  const [hqs, setHqs] = useState<HeadquartersUI[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserOption[]>([]);
  const [isLoadingHqs, setIsLoadingHqs] = useState(true);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const [selectedHqId, setSelectedHqId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHq, setEditingHq] = useState<HeadquartersUI | null>(null);

  const [toast, setToast] = useState<ToastNotification | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  }, []);

  // Auth Protection
  useEffect(() => {
    if (currentUser && currentUser.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [currentUser, router]);

  // Fetch Headquarters
  const fetchHqs = useCallback(async () => {
    setIsLoadingHqs(true);
    try {
      const data = await api.get<{ hqs: HeadquartersUI[] }>('/api/admin/hq');
      setHqs(data.hqs || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch headquarters', 'error');
    } finally {
      setIsLoadingHqs(false);
    }
  }, [showToast]);

  // Fetch Admin Users (for assigned admins multi-select)
  const fetchAdmins = useCallback(async () => {
    setIsLoadingAdmins(true);
    try {
      const data = await api.get<{ users: any[] }>('/api/admin/users?limit=100');
      const allUsers = data.users || [];
      const adminsOnly = allUsers
        .filter((u: any) => u.role === 'ADMIN')
        .map((u: any) => ({
          id: String(u.id || u._id),
          displayName: u.displayName || u.name,
          name: u.displayName || u.name,
          email: u.email,
          role: u.role,
          photoUrl: u.photoUrl
        }));
      setAdminUsers(adminsOnly);
    } catch (err: any) {
      showToast('Could not load admin user list for assignment', 'error');
    } finally {
      setIsLoadingAdmins(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchHqs();
    fetchAdmins();
  }, [fetchHqs, fetchAdmins]);

  // Handle Save (Create / Update)
  const handleSaveHq = async (hqData: {
    name: string;
    location: string;
    assignedAdmins: string[];
    status: 'ACTIVE' | 'INACTIVE';
  }) => {
    if (editingHq) {
      // Update
      const res = await api.put<{ message: string; hq: HeadquartersUI }>(
        `/api/admin/hq/${editingHq.id}`,
        hqData
      );
      showToast(res.message || 'Headquarters updated successfully!');
    } else {
      // Create
      const res = await api.post<{ message: string; hq: HeadquartersUI }>(
        '/api/admin/hq',
        hqData
      );
      showToast(res.message || 'Headquarters created successfully!');
    }
    fetchHqs();
  };

  // Handle Delete
  const handleDeleteHq = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;

    setIsDeletingId(id);
    try {
      await api.del(`/api/admin/hq/${id}`);
      showToast(`Headquarters "${name}" has been removed.`, 'info');
      fetchHqs();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete headquarters', 'error');
    } finally {
      setIsDeletingId(null);
    }
  };

  // Filtered HQs list
  const filteredHqs = useMemo(() => {
    return hqs.filter((hq) => {
      if (statusFilter !== 'ALL' && hq.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const nameMatch = hq.name.toLowerCase().includes(q);

      let locStr = '';
      if (typeof hq.location === 'string') locStr = hq.location.toLowerCase();
      else if (typeof hq.location === 'object' && hq.location) locStr = JSON.stringify(hq.location).toLowerCase();

      const locMatch = locStr.includes(q);

      const adminMatch = (hq.assignedAdmins || []).some(
        (a: any) =>
          (a.displayName && a.displayName.toLowerCase().includes(q)) ||
          (a.email && a.email.toLowerCase().includes(q))
      );

      return nameMatch || locMatch || adminMatch;
    });
  }, [hqs, searchQuery, statusFilter]);

  const openCreateModal = () => {
    setEditingHq(null);
    setIsModalOpen(true);
  };

  const openEditModal = (hq: HeadquartersUI) => {
    setEditingHq(hq);
    setIsModalOpen(true);
  };

  const formatLocation = (loc: any) => {
    if (!loc) return 'Location Telemetry Not Set';
    if (typeof loc === 'string') return loc;
    if (typeof loc === 'object') {
      if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
        return `Coordinates: ${loc.coordinates[1]?.toFixed(4)}, ${loc.coordinates[0]?.toFixed(4)}`;
      }
      return JSON.stringify(loc);
    }
    return String(loc);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto p-3 sm:p-6 gap-4 bg-canvas text-primaryText font-sans">
      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-5 right-6 z-50 flex items-center gap-3 bg-surface border border-hairline shadow-2xl px-4 py-3 rounded-2xl text-xs sm:text-sm font-medium animate-fade-in text-primaryText">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              toast.type === 'error' ? 'bg-red-500' : 'bg-brandTeal'
            }`}
          />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-mutedGray uppercase tracking-wider mb-1">
            <span>Tactical Console</span>
            <span>/</span>
            <span className="text-brandTeal font-semibold">Headquarters</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-primaryText font-display flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-brandTeal" />
            Headquarters Management
          </h1>
          <p className="text-xs sm:text-sm text-secondaryText mt-1">
            Configure command centers, physical field stations, and assign administrative personnel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchHqs();
              fetchAdmins();
            }}
            title="Refresh list"
            className="p-2.5 rounded-xl bg-surfaceElevated border border-hairline text-secondaryText hover:text-primaryText hover:bg-surfaceCard transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingHqs ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brandTeal hover:bg-brandTealGlow text-white font-bold text-xs sm:text-sm transition-all shadow-glow-teal"
          >
            <Plus className="w-4 h-4" />
            <span>Create HQ</span>
          </button>
        </div>
      </div>

      {/* Geo-Spatial Telemetry Map Canvas for Headquarters */}
      <MapCanvas
        activeSosCount={0}
        headquarters={hqs}
        selectedHqId={selectedHqId}
        onHqMarkerClick={(id) => setSelectedHqId(id)}
        onClosePreview={() => setSelectedHqId(null)}
      />

      {/* Control Filter Bar */}
      <div className="bg-surface border border-hairline rounded-2xl p-3.5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-mutedGray absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search headquarters by name, address, or assigned admin..."
            className="w-full bg-surfaceElevated border border-hairline rounded-xl pl-9 pr-4 py-2 text-xs text-primaryText placeholder-mutedGray focus:outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/30"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          <div className="flex rounded-xl bg-surfaceElevated p-1 border border-hairline text-xs font-medium">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-lg transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-surfaceCard text-primaryText font-bold shadow-sm border border-hairline'
                  : 'text-mutedGray hover:text-primaryText'
              }`}
            >
              All HQs ({hqs.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1 rounded-lg transition-all ${
                statusFilter === 'ACTIVE'
                  ? 'bg-surfaceCard text-brandTeal font-bold shadow-sm border border-hairline'
                  : 'text-mutedGray hover:text-primaryText'
              }`}
            >
              Active ({hqs.filter((h) => h.status === 'ACTIVE').length})
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-3 py-1 rounded-lg transition-all ${
                statusFilter === 'INACTIVE'
                  ? 'bg-surfaceCard text-red-500 font-bold shadow-sm border border-hairline'
                  : 'text-mutedGray hover:text-primaryText'
              }`}
            >
              Inactive ({hqs.filter((h) => h.status === 'INACTIVE').length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      {isLoadingHqs ? (
        <div className="flex-1 min-h-[250px] flex flex-col items-center justify-center gap-3 bg-surface border border-hairline rounded-2xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-brandTeal animate-spin" />
          <p className="text-xs font-bold text-primaryText">Loading Headquarters Telemetry...</p>
        </div>
      ) : filteredHqs.length === 0 ? (
        <div className="flex-1 min-h-[250px] flex flex-col items-center justify-center p-8 bg-surface border border-hairline rounded-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-surfaceElevated border border-hairline flex items-center justify-center text-mutedGray mb-3">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-primaryText">No Headquarters Found</h3>
          <p className="text-xs text-mutedGray max-w-sm mt-1 mb-4">
            {searchQuery
              ? 'No headquarters matches your current search query.'
              : 'No tactical headquarters have been registered yet. Create your first HQ post.'}
          </p>
          {!searchQuery && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brandTeal text-white font-bold text-xs shadow-glow-teal hover:bg-brandTealGlow transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Headquarters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredHqs.map((hq) => {
            const isActive = hq.status === 'ACTIVE';
            const admins = hq.assignedAdmins || [];
            const isDeleting = isDeletingId === hq.id;
            const isSelectedOnMap = selectedHqId === hq.id;

            return (
              <div
                key={hq.id}
                onClick={() => setSelectedHqId(hq.id)}
                className={`bg-surface border rounded-2xl p-5 shadow-sm transition-all flex flex-col justify-between cursor-pointer ${
                  isSelectedOnMap ? 'border-brandTeal ring-2 ring-brandTeal/40' : 'border-hairline hover:border-hairlineBright'
                }`}
              >
                {/* Top Section */}
                <div>
                  {/* Status & Name */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-brandTeal/10 border border-brandTeal/20 flex items-center justify-center text-brandTeal shrink-0 font-bold">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-primaryText font-display truncate">
                          {hq.name}
                        </h3>
                        <span className="text-[10px] font-mono text-mutedGray block truncate">
                          ID: HQ-0x{hq.id.slice(-4).toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono border shrink-0 ${
                        isActive
                          ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}
                    >
                      {isActive ? (
                        <CheckCircle2 className="w-3 h-3 text-brandTeal" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-500" />
                      )}
                      {hq.status}
                    </span>
                  </div>

                  {/* Location Info */}
                  <div className="p-3 rounded-xl bg-canvas border border-hairline mb-4">
                    <div className="flex items-start gap-2 text-xs text-secondaryText">
                      <MapPin className="w-4 h-4 text-brandTeal shrink-0 mt-0.5" />
                      <span className="font-mono leading-relaxed text-[11px] text-primaryText break-words">
                        {formatLocation(hq.location)}
                      </span>
                    </div>
                  </div>

                  {/* Assigned Admins list */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-mono uppercase font-bold text-mutedGray flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-brandTeal" />
                        Assigned Admins ({admins.length})
                      </span>
                    </div>

                    {admins.length === 0 ? (
                      <p className="text-[11px] text-mutedGray italic">No admin users assigned.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {admins.map((admin: any, idx: number) => {
                          const adminName = admin.displayName || admin.name || admin.email || 'Admin User';
                          return (
                            <div
                              key={admin.id || admin._id || idx}
                              className="flex items-center gap-2 p-1.5 rounded-lg bg-surfaceElevated border border-hairline text-xs"
                            >
                              <div className="w-6 h-6 rounded-full bg-brandTeal/10 border border-brandTeal/20 text-brandTeal font-bold text-[10px] flex items-center justify-center uppercase shrink-0">
                                {adminName.slice(0, 2)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-primaryText text-[11px] truncate">
                                  {adminName}
                                </div>
                                <div className="text-[10px] text-mutedGray font-mono truncate">
                                  {admin.email}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-hairline flex items-center justify-between text-xs">
                  <span className="text-[10px] font-mono text-mutedGray">
                    Updated {hq.updatedAt ? new Date(hq.updatedAt).toLocaleDateString() : 'Recently'}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(hq);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-surfaceElevated border border-hairline text-secondaryText hover:text-primaryText hover:bg-surfaceCard transition-colors flex items-center gap-1.5 text-xs font-semibold"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-brandTeal" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteHq(hq.id, hq.name);
                      }}
                      disabled={isDeleting}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-colors flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* HQ Create/Edit Modal */}
      <HqModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveHq}
        editingHq={editingHq}
        adminUsers={adminUsers}
        isLoadingAdmins={isLoadingAdmins}
      />
    </div>
  );
}
