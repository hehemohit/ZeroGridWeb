'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
    // GeoJSON coordinates are [lng, lat]
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
  const battery = `${Math.min(99, Math.max(12, Math.round(100 - accuracy * 1.5)))}%`;
  const peerCount = Math.max(2, Math.round(20 - accuracy / 3));

  const displayId = rawId.length >= 6 ? `sos-${rawId.slice(-4)}` : (rawId || `sos-${Math.floor(1000 + Math.random() * 9000)}`);

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

export default function AdminDashboardPage() {
  const { user: currentUser } = useAuth();
  const router = useRouter();

  // --- Core States ---
  const [sosEvents, setSosEvents] = useState<SosEventUI[]>([]);
  const [users, setUsers] = useState<AdminUserUI[]>([]);
  const [selectedSosId, setSelectedSosId] = useState<string | null>(null);
  const [selectedSosDetails, setSelectedSosDetails] = useState<SosEventUI | null>(null);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [activeSosTab, setActiveSosTab] = useState<'FEED' | 'HISTORY'>('FEED');

  // Filter & Sorting state for Right Pane SOS
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<'DATE_DESC' | 'DATE_ASC' | 'STATUS'>('DATE_DESC');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED'>('ALL');

  // User Management search & loading
  const [userSearch, setUserSearch] = useState('');
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  // General loading & Toast
  const [isSosLoading, setIsSosLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Action drawer note input
  const [noteInput, setNoteInput] = useState('');

  // Socket reference
  const socketRef = useRef<Socket | null>(null);

  // Trigger toast message
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  }, []);

  // Admin access protection check
  useEffect(() => {
    if (currentUser && currentUser.role !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [currentUser, router]);

  // --- API Fetchers ---

  // 1. Fetch SOS Events (GET /api/admin/sos & GET /api/admin/sos/history)
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

  // 2. Fetch Details for Selected SOS (GET /api/sos/:id)
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
      // Fallback to local item if fetch by ID requires creator permission or fails
      setSelectedSosDetails(sosItem);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  // 3. Fetch Users (GET /api/admin/users?q=...)
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

  // Initial and tab change triggers
  useEffect(() => {
    fetchSosEvents();
  }, [fetchSosEvents]);

  useEffect(() => {
    if (isUserManagementOpen) {
      fetchUsers(userSearch);
    }
  }, [isUserManagementOpen, fetchUsers, userSearch]);

  // Real-time updates via Socket.io
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const socket = io(`${backendUrl}/sos`, { transports: ['polling', 'websocket'] });
    socketRef.current = socket;

    socket.on('sos:new', () => {
      fetchSosEvents();
    });

    socket.on('sos:updated', () => {
      fetchSosEvents();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchSosEvents]);

  // Selected SOS ID change watcher
  const selectedSos = useMemo(() => {
    return sosEvents.find(s => s.id === selectedSosId || s.rawId === selectedSosId) || null;
  }, [sosEvents, selectedSosId]);

  useEffect(() => {
    if (selectedSos) {
      fetchSosDetails(selectedSos);
    } else {
      setSelectedSosDetails(null);
    }
  }, [selectedSosId, selectedSos, fetchSosDetails]);

  // Filtered & Sorted SOS events
  const filteredSosList = useMemo(() => {
    return sosEvents
      .filter(event => {
        if (activeSosTab === 'HISTORY') {
          if (event.status !== 'RESOLVED') return false;
        } else {
          if (statusFilter !== 'ALL' && event.status !== statusFilter) return false;
        }
        if (searchQuery.trim() === '') return true;
        const q = searchQuery.toLowerCase();
        return (
          event.userName.toLowerCase().includes(q) ||
          event.id.toLowerCase().includes(q) ||
          event.rawId.toLowerCase().includes(q) ||
          event.location.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortOption === 'DATE_DESC') {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        } else if (sortOption === 'DATE_ASC') {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        } else if (sortOption === 'STATUS') {
          const priority: Record<string, number> = { ACTIVE: 1, ACKNOWLEDGED: 2, RESOLVED: 3 };
          return (priority[a.status] || 9) - (priority[b.status] || 9);
        }
        return 0;
      });
  }, [sosEvents, searchQuery, sortOption, statusFilter, activeSosTab]);

  // --- API Action Handlers ---

  // PUT /api/sos/:id/acknowledge
  const handleAcknowledgeSos = async (id: string) => {
    const targetEvent = sosEvents.find(s => s.id === id || s.rawId === id);
    if (!targetEvent) return;
    const targetId = targetEvent.rawId || targetEvent.id;

    setActionLoading(true);
    try {
      await api.put(`/api/sos/${targetId}/acknowledge`, {});
      showToast(`SOS [${targetEvent.id}] status updated to ACKNOWLEDGED.`);
      await fetchSosEvents();
      if (selectedSosId) {
        fetchSosDetails(targetEvent);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to acknowledge SOS', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // PUT /api/sos/:id/resolve
  const handleResolveSos = async (id: string) => {
    const targetEvent = sosEvents.find(s => s.id === id || s.rawId === id);
    if (!targetEvent) return;
    const targetId = targetEvent.rawId || targetEvent.id;

    setActionLoading(true);
    try {
      await api.put(`/api/sos/${targetId}/resolve`, {});
      showToast(`SOS [${targetEvent.id}] has been marked RESOLVED.`, 'info');
      await fetchSosEvents();
      if (selectedSosId) {
        fetchSosDetails(targetEvent);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to resolve SOS', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // POST /api/sos/:id/notes
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim() || !selectedSosDetails) return;
    const targetId = selectedSosDetails.rawId || selectedSosDetails.id;

    setActionLoading(true);
    try {
      const res = await api.post<{ sos: any }>(`/api/sos/${targetId}/notes`, {
        text: noteInput.trim(),
      });
      setNoteInput('');
      showToast('Tactical telemetry note appended successfully.');
      if (res && res.sos) {
        setSelectedSosDetails(mapSosFromBackend(res.sos));
      }
      fetchSosEvents();
    } catch (err: any) {
      showToast(err.message || 'Failed to add note', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // POST /api/admin/admins (promote)
  const handlePromoteAdmin = async (userEmail: string, userName: string) => {
    try {
      await api.post('/api/admin/admins', { email: userEmail });
      showToast(`Promoted ${userName} to Authority Admin (POST /api/admin/admins)`);
      fetchUsers(userSearch);
    } catch (err: any) {
      showToast(err.message || 'Failed to promote admin', 'error');
    }
  };

  // DELETE /api/admin/admins/:userId (demote)
  const handleDemoteAdmin = async (userId: string, userName: string) => {
    try {
      await api.del(`/api/admin/admins/${userId}`);
      showToast(`Demoted ${userName} from Admin role (DELETE /api/admin/admins/${userId})`, 'info');
      fetchUsers(userSearch);
    } catch (err: any) {
      showToast(err.message || 'Failed to demote admin', 'error');
    }
  };

  // Format timestamp helper
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  const activeDrawerSos = selectedSosDetails || selectedSos;
  const activeSosCount = sosEvents.filter(e => e.status === 'ACTIVE').length;

  return (
    <div className="flex h-screen w-full bg-canvas text-primaryText font-sans overflow-hidden select-none">
      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-5 right-6 z-50 flex items-center gap-3 bg-surface border border-hairlineBright shadow-2xl px-4 py-3 rounded-16dp text-sm font-medium animate-bounce-short">
          <span className={`w-2.5 h-2.5 rounded-full ${toast.type === 'error' ? 'bg-alertRed shadow-glow-red' : 'bg-brandTeal shadow-glow-teal'}`}></span>
          <span className="text-primaryText">{toast.message}</span>
        </div>
      )}

      {/* ================= 1. Vertical Left Sidebar ================= */}
      <aside className="w-64 flex-shrink-0 bg-surface/95 border-r border-hairline flex flex-col justify-between z-20 backdrop-blur-md">
        {/* Top: Brand Header & Status */}
        <div>
          <div className="p-5 border-b border-hairline">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-surfaceCard border border-hairline flex items-center justify-center shadow-inner">
                <svg className="w-5 h-5 text-alertRed" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-bold text-lg tracking-tight text-primaryText font-display">ZeroGrid</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brandTealDark text-brandTeal border border-brandTeal/30 uppercase tracking-wider font-mono">
                  Admin
                </span>
              </div>
            </div>

            {/* Mode indicator badge */}
            <div className="mt-3.5 flex items-center gap-2 px-2.5 py-1.5 bg-surfaceCard rounded-lg border border-hairline text-[11px] font-medium text-mutedGray">
              <span className="w-2 h-2 rounded-full bg-brandTeal shadow-glow-teal animate-pulse"></span>
              <span className="truncate">Telemetry Operational</span>
            </div>
          </div>

          {/* Navigation Links / Sections */}
          <nav className="p-3 space-y-1.5">
            <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-dimGray font-semibold">
              Tactical Console
            </div>

            <button
              onClick={() => setActiveSosTab('FEED')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all bg-surfaceElevated text-primaryText border border-hairlineBright shadow-sm"
            >
              <Radio className="w-4 h-4 text-brandTeal" />
              <span className="flex-1 text-left">Dashboard / Telemetry</span>
              <span className="w-1.5 h-1.5 rounded-full bg-brandTeal shadow-glow-teal"></span>
            </button>

            <button
              onClick={() => {
                setActiveSosTab('FEED');
                setStatusFilter('ACTIVE');
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-mutedGray hover:text-primaryText hover:bg-surfaceCard transition-all"
            >
              <div className="flex items-center gap-3">
                <Radio className="w-4 h-4 text-alertRed" />
                <span>SOS Dispatch</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-alertRedBg text-alertRed border border-alertRedBorder font-bold">
                {activeSosCount}
              </span>
            </button>

            <button
              onClick={() => setIsUserManagementOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-mutedGray hover:text-primaryText hover:bg-surfaceCard transition-all"
            >
              <Users className="w-4 h-4 text-brandTeal" />
              <span className="flex-1 text-left">Nodes & Peering</span>
              <span className="text-[10px] font-mono text-dimGray">{users.length}</span>
            </button>

            <div className="pt-3 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-dimGray font-semibold">
              Administration
            </div>

            {/* User Management Trigger Button */}
            <button
              onClick={() => setIsUserManagementOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-secondaryText hover:text-primaryText bg-surfaceCard hover:bg-surfaceElevated border border-hairline hover:border-hairlineBright transition-all shadow-panel-dark text-left"
            >
              <Users className="w-4 h-4 text-brandTeal" />
              <span className="flex-1">User Management</span>
              <ChevronRight className="w-3.5 h-3.5 text-mutedGray" />
            </button>
          </nav>
        </div>

        {/* Bottom: User Profile Info */}
        <div className="p-4 border-t border-hairline bg-surfaceElevated/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brandTealDark text-brandTeal font-bold text-xs flex items-center justify-center border border-brandTeal/30 shadow-glow-teal flex-shrink-0 uppercase">
              {currentUser?.displayName ? currentUser.displayName.slice(0, 2) : 'AD'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primaryText truncate">
                  {currentUser?.displayName || 'Rescue Team Lead'}
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brandTealDark text-brandTeal border border-brandTeal/30">
                  LEAD
                </span>
              </div>
              <span className="text-[10px] text-mutedGray font-mono block truncate">
                {currentUser?.email || 'ID: ZG-DISPATCH-01'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* ================= 2. Main Content Area (Stacked Vertical Layout) ================= */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden p-4 gap-4 bg-canvas">
        {/* UPPER CONTAINER: Geo-Spatial Telemetry Canvas */}
        <MapCanvas activeSosCount={activeSosCount} />

        {/* LOWER CONTAINER: Emergency SOS Dispatch Feed (Structured bottom console panel) */}
        <section className="h-80 flex-shrink-0 flex flex-col bg-surface border border-hairline rounded-16dp overflow-hidden shadow-panel-dark">
          {/* Console Header Bar */}
          <div className="p-3.5 border-b border-hairline bg-surface flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            {/* Title & API route */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-alertRed" />
                <h2 className="font-bold text-sm text-primaryText font-display">Emergency SOS Dispatch Console</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surfaceCard text-mutedGray border border-hairline">
                GET /api/admin/sos
              </span>
              <span className="text-xs font-semibold text-brandTeal bg-brandTealDark border border-brandTeal/30 px-2.5 py-0.5 rounded-full font-mono">
                {filteredSosList.length} Events
              </span>
            </div>

            {/* Controls: Search, Sort, Tabs */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Tabs: Live Feed vs History */}
              <div className="flex rounded-lg bg-canvas p-1 border border-hairline text-xs font-medium">
                <button
                  onClick={() => {
                    setActiveSosTab('FEED');
                    setStatusFilter('ALL');
                  }}
                  className={`px-3 py-1 rounded-md text-center transition-all ${
                    activeSosTab === 'FEED'
                      ? 'bg-surfaceElevated text-primaryText font-semibold shadow-xs border border-hairlineBright'
                      : 'text-mutedGray hover:text-primaryText'
                  }`}
                >
                  Active Feed
                </button>
                <button
                  onClick={() => {
                    setActiveSosTab('HISTORY');
                  }}
                  className={`px-3 py-1 rounded-md text-center transition-all ${
                    activeSosTab === 'HISTORY'
                      ? 'bg-surfaceElevated text-primaryText font-semibold shadow-xs border border-hairlineBright'
                      : 'text-mutedGray hover:text-primaryText'
                  }`}
                >
                  History (Resolved)
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 text-mutedGray absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search user, ID, sector..."
                  className="w-full bg-canvas border border-hairline rounded-lg pl-8 pr-6 py-1 text-xs text-primaryText placeholder-dimGray focus:outline-none focus:border-brandTeal"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-mutedGray hover:text-primaryText text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-mutedGray font-medium">Sort:</span>
                <select
                  value={sortOption}
                  onChange={e => setSortOption(e.target.value as any)}
                  className="bg-canvas border border-hairline rounded-lg px-2 py-1 text-xs text-secondaryText focus:outline-none focus:border-brandTeal font-medium"
                >
                  <option value="DATE_DESC">Newest First</option>
                  <option value="DATE_ASC">Oldest First</option>
                  <option value="STATUS">Urgency/Status</option>
                </select>
              </div>

              {/* Status Pills */}
              {activeSosTab === 'FEED' && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      statusFilter === 'ALL'
                        ? 'bg-brandTealDark text-brandTeal border-brandTeal/50 font-semibold'
                        : 'bg-canvas text-mutedGray border-hairline hover:text-primaryText'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      statusFilter === 'ACTIVE'
                        ? 'bg-alertRedBg text-alertRed border-alertRed/40 font-semibold shadow-glow-red'
                        : 'bg-canvas text-mutedGray border-hairline hover:text-primaryText'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACKNOWLEDGED')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      statusFilter === 'ACKNOWLEDGED'
                        ? 'bg-brandTealDark text-brandTeal border-brandTeal/40 font-semibold'
                        : 'bg-canvas text-mutedGray border-hairline hover:text-primaryText'
                    }`}
                  >
                    Ack&apos;d
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Scrollable SOS Horizontal/Grid Cards Panel */}
          <div className="flex-1 overflow-y-auto p-3.5 bg-[#0A101D]">
            {isSosLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-mutedGray gap-2">
                <Loader2 className="w-8 h-8 text-brandTeal animate-spin" />
                <p className="text-xs font-semibold text-primaryText">Loading SOS Telemetry Feed...</p>
              </div>
            ) : filteredSosList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-mutedGray">
                <CheckCircle className="w-8 h-8 text-brandTeal/30 mb-2" />
                <p className="text-xs font-semibold text-primaryText">No SOS events found</p>
                <p className="text-[11px] text-mutedGray mt-0.5">
                  {searchQuery ? 'Try refining your search filter.' : 'All emergency alerts are currently quiet.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredSosList.map(sos => {
                  const isSelected = selectedSosId === sos.id || selectedSosId === sos.rawId;
                  const isAuthority = sos.role === 'AUTHORITY';
                  const isEmergencyActive = sos.status === 'ACTIVE';

                  return (
                    <div
                      key={sos.rawId || sos.id}
                      onClick={() => setSelectedSosId(sos.id)}
                      className={`p-3.5 rounded-16dp transition-all cursor-pointer text-left relative flex flex-col justify-between shadow-sm ${
                        isAuthority
                          ? 'bg-[#0B252E]/40 hover:bg-[#0B252E]/60 border border-brandTeal/30'
                          : 'bg-surfaceCard hover:bg-surfaceElevated border border-hairline'
                      } ${
                        isSelected
                          ? 'ring-2 ring-brandTeal border-brandTeal'
                          : ''
                      }`}
                    >
                      <div>
                        {/* Status chip & SOS Identifier */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono ${
                                isEmergencyActive
                                  ? 'bg-alertRedBg text-alertRed border border-alertRedBorder shadow-glow-red animate-pulse'
                                  : sos.status === 'ACKNOWLEDGED'
                                  ? 'bg-brandTealDark text-brandTeal border border-brandTeal/30'
                                  : 'bg-surfaceElevated text-mutedGray border border-hairline'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isEmergencyActive ? 'bg-alertRed' : sos.status === 'ACKNOWLEDGED' ? 'bg-brandTeal' : 'bg-mutedGray'
                                }`}
                              ></span>
                              {sos.status}
                            </span>
                            <span className="font-mono text-[10px] text-mutedGray font-medium">
                              #{sos.id}
                            </span>
                          </div>
                          <span className="text-[10px] text-mutedGray font-mono">
                            {formatTime(sos.timestamp)}
                          </span>
                        </div>

                        {/* Node Card Token styling */}
                        <div className="flex items-start gap-2.5">
                          {/* Avatar Badge */}
                          <div
                            className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border ${
                              isAuthority
                                ? 'bg-brandTealDark text-brandTeal border-brandTeal/40 shadow-glow-teal'
                                : 'bg-surfaceElevated text-secondaryText border-hairline'
                            }`}
                          >
                            {isAuthority ? (
                              <Shield className="w-4 h-4 text-brandTeal" />
                            ) : (
                              <User className="w-4 h-4 text-mutedGray" />
                            )}
                          </div>

                          {/* Node Information */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold text-primaryText truncate">
                                {sos.userName}
                              </h4>
                            </div>
                            <span
                              className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.2 rounded font-mono inline-block mt-0.5 ${
                                isAuthority
                                  ? 'text-brandTeal bg-brandTealDark/80 border border-brandTeal/30'
                                  : 'text-mutedGray bg-surfaceElevated border border-hairline'
                              }`}
                            >
                              {isAuthority ? 'Authority Node' : 'Regular Node'}
                            </span>

                            <p className="text-[11px] text-mutedGray truncate mt-1 flex items-center gap-1">
                              <span className="truncate">{sos.location}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Node telemetry stats */}
                      <div className="mt-2.5 pt-2 border-t border-hairline/80 flex items-center justify-between text-[10px] text-mutedGray">
                        <span className="flex items-center gap-1 font-mono text-secondaryText">
                          <Battery className="w-3 h-3 text-brandTeal" />
                          {sos.batteryLevel}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-secondaryText">
                          <Radio className="w-3 h-3 text-brandTeal" />
                          {sos.peerNodesInRange} Peered
                        </span>
                        <span className="text-brandTeal hover:text-brandTealGlow font-medium flex items-center gap-0.5">
                          Details
                          <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ================= 3. SOS Action Interface Drawer ================= */}
      {selectedSosId && (
        <SosDrawer
          sos={activeDrawerSos}
          isLoadingDetails={drawerLoading}
          actionLoading={actionLoading}
          noteInput={noteInput}
          onSetNoteInput={setNoteInput}
          onClose={() => {
            setSelectedSosId(null);
            setSelectedSosDetails(null);
          }}
          onAcknowledge={handleAcknowledgeSos}
          onResolve={handleResolveSos}
          onAddNote={handleAddNote}
          formatTime={formatTime}
        />
      )}

      {/* ================= 4. User Management Modal Overlay ================= */}
      <UserManagementModal
        isOpen={isUserManagementOpen}
        userSearch={userSearch}
        users={users}
        isLoading={isUsersLoading}
        onClose={() => setIsUserManagementOpen(false)}
        onUserSearchChange={setUserSearch}
        onPromoteAdmin={handlePromoteAdmin}
        onDemoteAdmin={handleDemoteAdmin}
      />
    </div>
  );
}

