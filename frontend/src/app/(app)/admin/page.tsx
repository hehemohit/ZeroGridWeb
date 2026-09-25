'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';
import {
  Users,
  Search,
  CheckCircle,
  Shield,
  User,
  Battery,
  Radio,
  ChevronRight,
  Loader2,
  Building2
} from 'lucide-react';
import { MapCanvas } from '@/components/admin/MapCanvas';
import { SosDrawer, SosEventUI, NoteItem } from '@/components/admin/SosDrawer';
import { UserManagementModal, AdminUserUI } from '@/components/admin/UserManagementModal';

interface Toast {
  message: string;
  type: 'success' | 'info' | 'error';
}

// --- Data Normalization Helpers ---
function mapSosFromBackend(raw: any): SosEventUI {
  const rawId = String(raw.id || raw._id || '');
  const user = raw.triggeredBy || {};
  const isAuthority = user.role === 'ADMIN';

  const coords = raw.location?.coordinates;
  let locStr = 'Grid Sector Telemetry';
  if (Array.isArray(coords) && coords.length === 2) {
    locStr = `Coordinates: ${coords[1]?.toFixed(4)}, ${coords[0]?.toFixed(4)}`;
  } else if (typeof raw.location === 'string' && raw.location.trim()) {
    locStr = raw.location;
  }

  const notesList: NoteItem[] = Array.isArray(raw.notes)
    ? raw.notes.map((n: any, idx: number) => ({
      id: String(n._id || n.id || `n-${idx}`),
      author: n.authorId?.displayName || n.author || 'Dispatch Lead',
      text: n.text || '',
      createdAt: n.timestamp || n.createdAt || new Date().toISOString(),
    }))
    : [];

  const accuracy = typeof raw.accuracyMeters === 'number' ? raw.accuracyMeters : 15;
  const battery = typeof raw.batteryPercentage === 'number' && !isNaN(raw.batteryPercentage) ? `${Math.round(raw.batteryPercentage)}%` : 'Not Found';
  const peerCount = Math.max(2, Math.round(20 - accuracy / 3));

  const displayId = rawId.length >= 6 ? `sos-${rawId.slice(-4)}` : (rawId || `sos-${Math.floor(1000 + Math.random() * 9000)}`);

  let assignedAdminData = raw.assignedAdmin || null;
  if (assignedAdminData && typeof assignedAdminData === 'object') {
    assignedAdminData = {
      id: String(assignedAdminData.id || assignedAdminData._id || ''),
      displayName: assignedAdminData.displayName || assignedAdminData.email || 'Admin',
      email: assignedAdminData.email || '',
      photoUrl: assignedAdminData.photoUrl || ''
    };
  }

  return {
    id: displayId,
    rawId,
    userId: String(user._id || user.id || 'usr-anon'),
    userName: user.displayName || user.email || 'Citizen Node',
    userEmail: user.email || '',
    role: isAuthority ? 'AUTHORITY' : 'REGULAR',
    status: raw.status || 'ACTIVE',
    severity: raw.category || 'HIGH',
    location: locStr,
    coordinates: Array.isArray(coords) ? [coords[1], coords[0]] : undefined,
    timestamp: raw.createdAt || new Date().toISOString(),
    batteryLevel: battery,
    peerNodesInRange: peerCount,
    message: raw.message || '',
    notes: notesList,
    assignedAdmin: assignedAdminData,
  };
}

function mapUserFromBackend(raw: any): AdminUserUI {
  const id = String(raw.id || raw._id || '');
  const isAdmin = raw.role === 'ADMIN';
  const shortId = id.length >= 4 ? id.slice(-4).toUpperCase() : '81FA';
  return {
    id,
    name: raw.displayName || raw.email || 'ZeroGrid Node',
    email: raw.email || '',
    role: isAdmin ? 'ADMIN' : 'USER',
    nodeType: isAdmin ? 'AUTHORITY' : 'REGULAR',
    nodeAddress: `ZG-0x${shortId}`,
    status: raw.adminApproved || raw.profileComplete ? 'Active' : 'Standby',
  };
}

function AdminDashboardContent() {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sosEvents, setSosEvents] = useState<SosEventUI[]>([]);
  const [users, setUsers] = useState<AdminUserUI[]>([]);
  const [selectedSosId, setSelectedSosId] = useState<string | null>(null);
  const [drawerSosId, setDrawerSosId] = useState<string | null>(null);
  const [selectedSosDetails, setSelectedSosDetails] = useState<SosEventUI | null>(null);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [activeSosTab, setActiveSosTab] = useState<'FEED' | 'HISTORY'>('FEED');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<'DATE_DESC' | 'DATE_ASC' | 'STATUS'>('DATE_DESC');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED'>('ALL');

  const [userSearch, setUserSearch] = useState('');
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isSosLoading, setIsSosLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const socketRef = useRef<Socket | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [currentUser, router]);

  const handleCloseUserManagement = useCallback(() => {
    setIsUserManagementOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (params.has('modal')) {
      params.delete('modal');
      const newQuery = params.toString();
      router.replace(newQuery ? `/admin?${newQuery}` : '/admin');
    }
  }, [searchParams, router]);

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    const modalParam = searchParams.get('modal');

    if (filterParam === 'ACTIVE') {
      setStatusFilter('ACTIVE');
      setActiveSosTab('FEED');
    } else if (filterParam === 'ALL') {
      setStatusFilter('ALL');
      setActiveSosTab('FEED');
    }

    if (modalParam === 'nodes') {
      setIsUserManagementOpen(true);
    } else {
      setIsUserManagementOpen(false);
    }
  }, [searchParams]);

  const fetchSosEvents = useCallback(async () => {
    setIsSosLoading(true);
    try {
      if (activeSosTab === 'HISTORY') {
        const res = await api.get<{ events: any[] }>('/api/admin/sos/history?limit=50');
        const mapped = (res.events || []).map(mapSosFromBackend);
        setSosEvents(mapped);
      } else {
        if (statusFilter === 'ALL') {
          const [activeRes, ackRes] = await Promise.all([
            api.get<{ events: any[] }>('/api/admin/sos?status=ACTIVE&limit=50').catch(() => ({ events: [] })),
            api.get<{ events: any[] }>('/api/admin/sos?status=ACKNOWLEDGED&limit=50').catch(() => ({ events: [] })),
          ]);
          const combined = [...(activeRes.events || []), ...(ackRes.events || [])];
          setSosEvents(combined.map(mapSosFromBackend));
        } else {
          const res = await api.get<{ events: any[] }>(`/api/admin/sos?status=${statusFilter}&limit=50`);
          setSosEvents((res.events || []).map(mapSosFromBackend));
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch SOS events', 'error');
    } finally {
      setIsSosLoading(false);
    }
  }, [activeSosTab, statusFilter, showToast]);

  const fetchSosDetails = useCallback(async (sosItem: SosEventUI) => {
    setDrawerLoading(true);
    try {
      const targetId = sosItem.rawId || sosItem.id;
      const res = await api.get<{ sos: any }>(`/api/sos/${targetId}`);
      if (res && res.sos) {
        setSelectedSosDetails(mapSosFromBackend(res.sos));
      } else {
        setSelectedSosDetails(sosItem);
      }
    } catch {
      setSelectedSosDetails(sosItem);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async (query = '') => {
    setIsUsersLoading(true);
    try {
      const endpoint = query.trim()
        ? `/api/admin/users?q=${encodeURIComponent(query.trim())}&limit=50`
        : '/api/admin/users?limit=50';
      const res = await api.get<{ users: any[] }>(endpoint);
      setUsers((res.users || []).map(mapUserFromBackend));
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch users', 'error');
    } finally {
      setIsUsersLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchSosEvents(); }, [fetchSosEvents]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (isUserManagementOpen) fetchUsers(userSearch); }, [isUserManagementOpen, fetchUsers, userSearch]);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const socket = io(`${backendUrl}/sos`, { transports: ['polling', 'websocket'] });
    socketRef.current = socket;
    socket.on('sos:new', fetchSosEvents);
    socket.on('sos:updated', fetchSosEvents);
    return () => { socket.disconnect(); };
  }, [fetchSosEvents]);

  const selectedSos = useMemo(() => sosEvents.find(s => s.id === selectedSosId || s.rawId === selectedSosId) || null, [sosEvents, selectedSosId]);
  const drawerSos = useMemo(() => sosEvents.find(s => s.id === drawerSosId || s.rawId === drawerSosId) || null, [sosEvents, drawerSosId]);

  useEffect(() => {
    if (drawerSos) fetchSosDetails(drawerSos);
    else setSelectedSosDetails(null);
  }, [drawerSosId, drawerSos, fetchSosDetails]);

  const filteredSosList = useMemo(() => {
    return sosEvents
      .filter(event => {
        if (activeSosTab === 'HISTORY' && event.status !== 'RESOLVED') return false;
        if (activeSosTab !== 'HISTORY' && statusFilter !== 'ALL' && event.status !== statusFilter) return false;
        if (searchQuery.trim() === '') return true;
        const q = searchQuery.toLowerCase();
        return event.userName.toLowerCase().includes(q) || event.id.toLowerCase().includes(q) || event.rawId.toLowerCase().includes(q) || event.location.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (sortOption === 'DATE_DESC') return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        if (sortOption === 'DATE_ASC') return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        if (sortOption === 'STATUS') {
          const priority: Record<string, number> = { ACTIVE: 1, ACKNOWLEDGED: 2, RESOLVED: 3 };
          return (priority[a.status] || 9) - (priority[b.status] || 9);
        }
        return 0;
      });
  }, [sosEvents, searchQuery, sortOption, statusFilter, activeSosTab]);

  const handleAcknowledgeSos = async (id: string) => {
    const targetEvent = sosEvents.find(s => s.id === id || s.rawId === id);
    if (!targetEvent) return;
    setActionLoading(true);
    try {
      await api.put(`/api/sos/${targetEvent.rawId || targetEvent.id}/acknowledge`, {});
      showToast(`SOS [${targetEvent.id}] status updated to ACKNOWLEDGED.`);
      await fetchSosEvents();
      if (selectedSosId) fetchSosDetails(targetEvent);
    } catch (err: any) { showToast(err.message || 'Failed to acknowledge SOS', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleResolveSos = async (id: string) => {
    const targetEvent = sosEvents.find(s => s.id === id || s.rawId === id);
    if (!targetEvent) return;
    setActionLoading(true);
    try {
      await api.put(`/api/sos/${targetEvent.rawId || targetEvent.id}/resolve`, {});
      showToast(`SOS [${targetEvent.id}] has been marked RESOLVED.`, 'info');
      await fetchSosEvents();
      if (selectedSosId) fetchSosDetails(targetEvent);
    } catch (err: any) { showToast(err.message || 'Failed to resolve SOS', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim() || !selectedSosDetails) return;
    setActionLoading(true);
    try {
      const res = await api.post<{ sos: any }>(`/api/sos/${selectedSosDetails.rawId || selectedSosDetails.id}/notes`, { text: noteInput.trim() });
      setNoteInput('');
      showToast('Tactical telemetry note appended successfully.');
      if (res && res.sos) setSelectedSosDetails(mapSosFromBackend(res.sos));
      fetchSosEvents();
    } catch (err: any) { showToast(err.message || 'Failed to add note', 'error'); }
    finally { setActionLoading(false); }
  };

  const handleAssignAdmin = async (id: string, adminId: string | null) => {
    const targetEvent = sosEvents.find(s => s.id === id || s.rawId === id);
    if (!targetEvent) return;
    setActionLoading(true);
    try {
      const res = await api.put<{ sos: any }>(`/api/sos/${targetEvent.rawId || targetEvent.id}/assign`, { adminId });
      showToast(adminId ? `SOS [${targetEvent.id}] assigned to admin.` : `SOS [${targetEvent.id}] unassigned.`);
      await fetchSosEvents();
      if (res && res.sos) setSelectedSosDetails(mapSosFromBackend(res.sos));
    } catch (err: any) {
      showToast(err.message || 'Failed to assign admin', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePromoteAdmin = async (userEmail: string, userName: string) => {
    try {
      await api.post('/api/admin/admins', { email: userEmail });
      showToast(`Promoted ${userName} to Authority Admin`);
      fetchUsers(userSearch);
    } catch (err: any) { showToast(err.message || 'Failed to promote admin', 'error'); }
  };

  const handleDemoteAdmin = async (userId: string, userName: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (
      currentUser &&
      (userId === currentUser.id ||
        (currentUser.email && targetUser?.email && currentUser.email.toLowerCase() === currentUser.email.toLowerCase()))
    ) {
      showToast('You cannot revoke your own admin status', 'error');
      return;
    }
    try {
      await api.del(`/api/admin/admins/${userId}`);
      showToast(`Demoted ${userName} from Admin role`, 'info');
      fetchUsers(userSearch);
    } catch (err: any) { showToast(err.message || 'Failed to demote admin', 'error'); }
  };

  const formatTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return '--:--'; }
  };

  const activeDrawerSos = useMemo(
    () => drawerSos || selectedSosDetails || selectedSos,
    [drawerSos, selectedSosDetails, selectedSos]
  );
  const activeSosCount = sosEvents.filter(e => e.status === 'ACTIVE').length;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden p-2 sm:p-4 gap-2 sm:gap-4 bg-canvas text-primaryText font-sans transition-colors duration-200">

      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-4 md:top-5 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 z-50 flex items-center gap-3 bg-surface border border-hairline shadow-xl px-4 py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium w-[90%] md:w-auto animate-fade-in text-primaryText">
          <span className={`w-2.5 h-2.5 rounded-full ${toast.type === 'error' ? 'bg-red-500' : 'bg-brandTeal'}`}></span>
          <span>{toast.message}</span>
        </div>
      )}

        {/* UPPER: Geo-Spatial Map Canvas */}
        <MapCanvas
          activeSosCount={activeSosCount}
          sosEvents={sosEvents.filter(e => e.status === 'ACTIVE' || e.status === 'ACKNOWLEDGED')}
          selectedSosId={selectedSosId}
          onMarkerClick={(id) => setSelectedSosId(id)}
          onMarkerDoubleClick={(id) => { setSelectedSosId(id); setDrawerSosId(id); }}
          onOpenDetails={(id) => { setSelectedSosId(id); setDrawerSosId(id); }}
          onClosePreview={() => setSelectedSosId(null)}
        />

        {/* LOWER: Emergency SOS Feed Console */}
        <section className="flex-1 flex flex-col bg-surface border border-hairline rounded-xl sm:rounded-2xl overflow-hidden shadow-sm min-h-[300px]">

          {/* Console Header Bar */}
          <div className="p-3 sm:p-3.5 border-b border-hairline bg-surface flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 flex-shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" />
                <h2 className="font-bold text-xs sm:text-sm text-primaryText font-display">SOS Console</h2>
              </div>
              <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-surfaceElevated text-mutedGray border border-hairline">
                GET /api/admin/sos
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-brandTeal bg-brandTeal/10 border border-brandTeal/20 px-2 py-0.5 rounded-full font-mono">
                {filteredSosList.length} Events
              </span>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex rounded-lg bg-surfaceElevated p-1 border border-hairline text-[10px] sm:text-xs font-medium">
                <button
                  onClick={() => { setActiveSosTab('FEED'); setStatusFilter('ALL'); }}
                  className={`px-2 sm:px-3 py-1 rounded-md text-center transition-all ${activeSosTab === 'FEED' ? 'bg-surfaceCard text-primaryText font-semibold shadow-sm border border-hairline' : 'text-mutedGray hover:text-primaryText'
                    }`}
                >
                  Active Feed
                </button>
                <button
                  onClick={() => setActiveSosTab('HISTORY')}
                  className={`px-2 sm:px-3 py-1 rounded-md text-center transition-all ${activeSosTab === 'HISTORY' ? 'bg-surfaceCard text-primaryText font-semibold shadow-sm border border-hairline' : 'text-mutedGray hover:text-primaryText'
                    }`}
                >
                  History
                </button>
              </div>

              <div className="relative flex-1 min-w-[140px] sm:w-56">
                <Search className="w-3.5 h-3.5 text-mutedGray absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full bg-surfaceElevated border border-hairline rounded-lg pl-8 pr-6 py-1 text-[11px] sm:text-xs text-primaryText placeholder-mutedGray focus:outline-none focus:border-brandTeal focus:ring-1 focus:ring-brandTeal/30"
                />
              </div>

              {activeSosTab === 'FEED' && (
                <div className="hidden sm:flex items-center gap-1">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${statusFilter === 'ALL' ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20 font-semibold' : 'bg-surfaceElevated text-mutedGray border-hairline'
                      }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${statusFilter === 'ACTIVE' ? 'bg-red-500/10 text-red-500 border-red-500/20 font-semibold' : 'bg-surfaceElevated text-mutedGray border-hairline'
                      }`}
                  >
                    Active
                  </button>
                </div>
              )}

              <button
                onClick={() => router.push('/admin/headquarters')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-surfaceElevated text-primaryText border border-hairline hover:bg-surfaceCard transition-colors shadow-sm ml-auto sm:ml-0"
              >
                <Building2 className="w-3.5 h-3.5 text-brandTeal" />
                <span className="hidden sm:inline">Headquarters</span>
                <span className="sm:hidden">HQs</span>
              </button>

              <button
                onClick={() => setIsUserManagementOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-surfaceElevated text-primaryText border border-hairline hover:bg-surfaceCard transition-colors shadow-sm"
              >
                <Users className="w-3.5 h-3.5 text-brandTeal" />
                <span className="hidden sm:inline">Nodes & Users</span>
                <span className="sm:hidden">Users</span>
              </button>
            </div>
          </div>

          {/* Scrollable SOS Grid Panel */}
          <div className="flex-1 overflow-y-auto p-2 sm:p-3.5 bg-canvas">
            {isSosLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-mutedGray gap-2">
                <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-brandTeal animate-spin" />
                <p className="text-[11px] sm:text-xs font-semibold text-primaryText">Loading SOS Telemetry Feed...</p>
              </div>
            ) : filteredSosList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-mutedGray">
                <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-hairlineBright mb-2" />
                <p className="text-[11px] sm:text-xs font-semibold text-primaryText">No SOS events found</p>
                <p className="text-[10px] sm:text-[11px] mt-0.5">
                  {searchQuery ? 'Try refining your search filter.' : 'All emergency alerts are currently quiet.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3">
                {filteredSosList.map(sos => {
                  const isSelected = selectedSosId === sos.id || selectedSosId === sos.rawId;
                  const isAuthority = sos.role === 'AUTHORITY';
                  const isEmergencyActive = sos.status === 'ACTIVE';

                  return (
                    <div
                      key={sos.rawId || sos.id}
                      onClick={() => setSelectedSosId(sos.id)}
                      onDoubleClick={() => { setSelectedSosId(sos.id); setDrawerSosId(sos.id); }}
                      className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl transition-all cursor-pointer text-left relative flex flex-col justify-between shadow-sm ${isAuthority
                        ? 'bg-brandTeal/5 hover:bg-brandTeal/10 border border-brandTeal/20'
                        : 'bg-surfaceCard hover:bg-surfaceElevated border border-hairline'
                        } ${isSelected ? 'ring-2 ring-brandTeal border-brandTeal' : ''}`}
                    >
                      <div>
                        {/* Status chip & SOS Identifier */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono border ${isEmergencyActive
                                ? 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse'
                                : sos.status === 'ACKNOWLEDGED'
                                  ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
                                  : 'bg-surfaceElevated text-mutedGray border-hairline'
                                }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isEmergencyActive ? 'bg-red-500' : sos.status === 'ACKNOWLEDGED' ? 'bg-brandTeal' : 'bg-mutedGray'}`}></span>
                              {sos.status}
                            </span>
                            <span className="font-mono text-[9px] sm:text-[10px] text-mutedGray font-medium">
                              #{sos.id}
                            </span>
                          </div>
                          <span className="text-[9px] sm:text-[10px] text-mutedGray font-mono">
                            {formatTime(sos.timestamp)}
                          </span>
                        </div>

                        {/* Node Info */}
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border ${isAuthority
                              ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
                              : 'bg-surfaceElevated text-secondaryText border-hairline'
                              }`}
                          >
                            {isAuthority ? <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brandTeal" /> : <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-mutedGray" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="text-[11px] sm:text-xs font-bold text-primaryText truncate">{sos.userName}</h4>
                            <span className={`text-[8px] sm:text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded font-mono inline-block mt-0.5 border ${isAuthority ? 'text-brandTeal bg-brandTeal/10 border-brandTeal/20' : 'text-mutedGray bg-surfaceElevated border-hairline'
                              }`}
                            >
                              {isAuthority ? 'Authority Node' : 'Regular Node'}
                            </span>
                            <p className="text-[10px] sm:text-[11px] text-mutedGray truncate mt-1">{sos.location}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-hairline flex items-center justify-between text-[9px] sm:text-[10px] text-mutedGray">
                        <span className="flex items-center gap-1 font-mono text-mutedGray">
                          <Battery className="w-3 h-3 text-brandTeal" />
                          {sos.batteryLevel}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-mutedGray">
                          <Radio className="w-3 h-3 text-brandTeal" />
                          {sos.peerNodesInRange} Peered
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedSosId(sos.id); setDrawerSosId(sos.id); }}
                          className="text-brandTeal font-medium flex items-center gap-0.5 hover:underline"
                        >
                          Details <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      {/* ================= 3 & 4. Action Drawers & Modals ================= */}
      {drawerSosId && (
        <SosDrawer
          sos={activeDrawerSos}
          isLoadingDetails={drawerLoading}
          actionLoading={actionLoading}
          noteInput={noteInput}
          admins={users.filter(u => u.role === 'ADMIN')}
          currentUserId={currentUser?.id}
          onSetNoteInput={setNoteInput}
          onClose={() => { setDrawerSosId(null); setSelectedSosDetails(null); }}
          onAcknowledge={handleAcknowledgeSos}
          onResolve={handleResolveSos}
          onAddNote={handleAddNote}
          onAssignAdmin={handleAssignAdmin}
          formatTime={formatTime}
        />
      )}

      <UserManagementModal
        isOpen={isUserManagementOpen}
        userSearch={userSearch}
        users={users}
        isLoading={isUsersLoading}
        onClose={handleCloseUserManagement}
        onUserSearchChange={setUserSearch}
        onPromoteAdmin={handlePromoteAdmin}
        onDemoteAdmin={handleDemoteAdmin}
        currentUserId={currentUser?.id}
        currentUserEmail={currentUser?.email}
      />
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense>
      <AdminDashboardContent />
    </Suspense>
  );
}