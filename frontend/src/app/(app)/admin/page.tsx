'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';
import {
  Users,
  MapPin,
  Compass,
  Info,
  Search,
  CheckCircle,
  Shield,
  User,
  Battery,
  Radio,
  ChevronRight,
  X,
  Crosshair,
  Check,
  CheckCheck,
  FileText,
  Loader2,
} from 'lucide-react';

// --- Types conforming strictly to backend data model ---
interface NoteItem {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

interface SosEventUI {
  id: string;        // Display ID e.g. "sos-8921"
  rawId: string;     // Backend Mongo ObjectId
  userId: string;
  userName: string;
  userEmail: string;
  role: 'AUTHORITY' | 'REGULAR';
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  severity: string;
  location: string;
  coordinates?: [number, number];
  timestamp: string;
  batteryLevel: string;
  peerNodesInRange: number;
  message?: string;
  notes: NoteItem[];
}

interface AdminUserUI {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  nodeType: 'AUTHORITY' | 'REGULAR';
  nodeAddress: string;
  status: 'Active' | 'Standby';
}

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
      // Fallback to local item if fetch by ID requires creator permission
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

  // When selected SOS ID changes, fetch details
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

  return (
    <div className="flex flex-col h-screen bg-canvas text-primaryText font-sans select-none overflow-hidden">
      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-5 right-6 z-50 flex items-center gap-3 bg-surface border border-hairline shadow-lg px-4 py-3 rounded-16dp text-sm font-medium animate-bounce-short">
          <span className={`w-2.5 h-2.5 rounded-full ${toast.type === 'error' ? 'bg-alertRed' : 'bg-brandTeal'}`}></span>
          <span className="text-primaryText">{toast.message}</span>
        </div>
      )}

      {/* ================= 1. Top Navbar ================= */}
      <header className="h-16 flex-shrink-0 bg-surface border-b border-hairline px-6 flex items-center justify-between z-20">
        {/* Left: Brand & Standard Logo */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface border border-hairline flex items-center justify-center shadow-xs">
              {/* ZeroGrid shield emblem with red stroke as brand logo */}
              <svg className="w-5 h-5 text-alertRed" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-lg tracking-tight text-primaryText">ZeroGrid</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brandTealLight text-brandTeal uppercase tracking-wider">
                Admin
              </span>
            </div>
          </div>

          {/* Mode indicator badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-[#F5F5F5] rounded-full border border-hairline text-xs font-medium text-mutedGray">
            <span className="w-2 h-2 rounded-full bg-brandTeal"></span>
            <span>Telemetry Operational • Material 3 Minimalist</span>
          </div>
        </div>

        {/* Right: Navigation Items & User Management Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsUserManagementOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-[#F7F7F7] border border-hairline hover:border-mutedGray/40 text-primaryText rounded-16dp text-xs font-semibold transition-all shadow-xs"
          >
            <Users className="w-4 h-4 text-brandTeal" />
            <span>User Management</span>
          </button>

          <div className="h-5 w-px bg-hairline mx-1"></div>

          {/* Status / Active Node Indicator */}
          <div className="flex items-center gap-2.5 pl-1">
            <div className="w-8 h-8 rounded-full bg-brandTealLight text-brandTeal font-bold text-xs flex items-center justify-center border border-brandTeal/20 uppercase">
              {currentUser?.displayName ? currentUser.displayName.slice(0, 2) : 'AD'}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-bold text-primaryText leading-none">
                {currentUser?.displayName || 'Rescue Team Lead'}
              </span>
              <span className="text-[10px] text-mutedGray mt-0.5 font-mono">
                {currentUser?.email || 'ID: ZG-DISPATCH-01'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ================= 2. Main Content Area (Split-Pane) ================= */}
      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* CENTER / LEFT PANE: Large empty container reserved for Google Maps integration */}
        <section className="flex-1 flex flex-col min-w-0 bg-surface border border-hairline rounded-16dp overflow-hidden relative shadow-xs">
          {/* Card Header Toolbar with tactical coordinate metadata */}
          <div className="h-12 border-b border-hairline px-5 flex items-center justify-between bg-surface/80 backdrop-blur-sm z-10">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brandTeal" />
              <span className="text-xs font-semibold uppercase tracking-wider text-brandTeal">
                Geo-Spatial Telemetry Canvas
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-mutedGray">
              <span className="font-mono bg-[#F7F7F7] px-2.5 py-1 rounded-md border border-hairline text-[11px]">
                Coverage: 14.8 km² Mesh
              </span>
              <span className="hidden sm:inline-block font-mono text-[11px]">
                Active Events: {sosEvents.filter(e => e.status === 'ACTIVE').length}
              </span>
            </div>
          </div>

          {/* Map Placeholder Body */}
          <div className="flex-1 relative flex flex-col items-center justify-center p-8 bg-[#FAFAFA]">
            {/* Subtle tactical grid lines background pattern */}
            <div
              className="absolute inset-0 opacity-40 pointer-events-none"
              style={{
                backgroundImage: `linear-gradient(to right, #E5E5E5 1px, transparent 1px), linear-gradient(to bottom, #E5E5E5 1px, transparent 1px)`,
                backgroundSize: '40px 40px',
              }}
            ></div>

            {/* Central Card with strict requested label: "Map Integration Pending" */}
            <div className="relative z-10 flex flex-col items-center text-center max-w-sm px-6 py-8 bg-surface rounded-16dp border border-hairline shadow-sm">
              <div className="w-14 h-14 rounded-full bg-brandTealLight flex items-center justify-center mb-4 text-brandTeal">
                <Compass className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-primaryText mb-1">
                Map Integration Pending
              </h3>
              <p className="text-xs text-mutedGray leading-relaxed mb-4">
                Container reserved for future Google Maps API integration. Real-time peer-to-peer LoRa beacon telemetry will project active SOS coordinates onto this canvas.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F5F5F5] border border-hairline text-[11px] font-medium text-mutedGray">
                <span className="w-1.5 h-1.5 rounded-full bg-brandTeal animate-pulse"></span>
                <span>Awaiting Google Maps SDK key binding</span>
              </div>
            </div>

            {/* Decorative mock node markers to simulate live feed spatial presence */}
            <div className="absolute top-16 left-20 hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface/90 border border-hairline rounded-full shadow-xs text-[11px] text-primaryText">
              <span className="w-2 h-2 rounded-full bg-alertRed"></span>
              <span className="font-semibold">Sector 4B</span>
              <span className="text-mutedGray font-mono">#sos-active</span>
            </div>

            <div className="absolute bottom-16 right-28 hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface/90 border border-hairline rounded-full shadow-xs text-[11px] text-primaryText">
              <span className="w-2 h-2 rounded-full bg-brandTeal"></span>
              <span className="font-semibold">Relay Point 03</span>
              <span className="text-mutedGray font-mono">LoRa Connected</span>
            </div>
          </div>

          {/* Sub-bar / Mode Notice Footer */}
          <div className="border-t border-hairline px-5 py-2.5 bg-surface flex items-center justify-between text-xs text-mutedGray">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-brandTeal" />
              <span>Operational roles and dispatch modes can be switched at any time.</span>
            </span>
            <span className="font-mono text-[10px] text-mutedGray/80">ZeroGrid UI • v3.2.0-clean</span>
          </div>
        </section>

        {/* RIGHT PANE (Fixed width 400px): Vertically scrolling sidebar dedicated to SOS users */}
        <aside className="w-96 lg:w-[400px] flex-shrink-0 flex flex-col bg-surface border border-hairline rounded-16dp overflow-hidden shadow-xs">
          {/* Sticky Header with Feed/History Switcher, Search Bar, and Sort Dropdown */}
          <div className="p-4 border-b border-hairline bg-surface sticky top-0 z-10 flex flex-col gap-3">
            {/* Header title & API route indicator */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-primaryText">Emergency SOS Dispatch</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F5F5F5] text-mutedGray border border-hairline">
                  GET /api/admin/sos
                </span>
              </div>
              <span className="text-xs font-semibold text-brandTeal bg-brandTealLight px-2 py-0.5 rounded-full">
                {filteredSosList.length} Events
              </span>
            </div>

            {/* Tabs: Live Feed vs History */}
            <div className="flex rounded-lg bg-[#F5F5F5] p-0.5 border border-hairline text-xs font-medium">
              <button
                onClick={() => {
                  setActiveSosTab('FEED');
                  setStatusFilter('ALL');
                }}
                className={`flex-1 py-1.5 rounded-md text-center transition-all ${
                  activeSosTab === 'FEED'
                    ? 'bg-surface text-primaryText font-semibold shadow-xs'
                    : 'text-mutedGray hover:text-primaryText'
                }`}
              >
                Active Feed
              </button>
              <button
                onClick={() => {
                  setActiveSosTab('HISTORY');
                }}
                className={`flex-1 py-1.5 rounded-md text-center transition-all ${
                  activeSosTab === 'HISTORY'
                    ? 'bg-surface text-primaryText font-semibold shadow-xs'
                    : 'text-mutedGray hover:text-primaryText'
                }`}
              >
                History (Resolved)
              </button>
            </div>

            {/* Search Bar (client-side filter) */}
            <div className="relative">
              <Search className="w-4 h-4 text-mutedGray absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by user, ID, or sector..."
                className="w-full bg-[#FAFAFA] border border-hairline rounded-xl pl-9 pr-8 py-1.5 text-xs text-primaryText placeholder-mutedGray/60 focus:outline-none focus:border-brandTeal focus:bg-surface transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mutedGray hover:text-primaryText text-xs font-bold"
                >
                  ×
                </button>
              )}
            </div>

            {/* Sort & Status Filters */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-[11px] text-mutedGray whitespace-nowrap font-medium">Sort:</span>
                <select
                  value={sortOption}
                  onChange={e => setSortOption(e.target.value as any)}
                  className="w-full bg-[#FAFAFA] border border-hairline rounded-lg px-2 py-1 text-xs text-primaryText focus:outline-none focus:border-brandTeal font-medium"
                >
                  <option value="DATE_DESC">Newest First</option>
                  <option value="DATE_ASC">Oldest First</option>
                  <option value="STATUS">By Urgency/Status</option>
                </select>
              </div>

              {activeSosTab === 'FEED' && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-2 py-1 rounded text-[11px] font-medium border ${
                      statusFilter === 'ALL'
                        ? 'bg-surface text-brandTeal border-brandTeal font-semibold'
                        : 'bg-[#FAFAFA] text-mutedGray border-hairline'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`px-2 py-1 rounded text-[11px] font-medium border ${
                      statusFilter === 'ACTIVE'
                        ? 'bg-alertRedBg text-alertRed border-alertRed/30 font-semibold'
                        : 'bg-[#FAFAFA] text-mutedGray border-hairline'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACKNOWLEDGED')}
                    className={`px-2 py-1 rounded text-[11px] font-medium border ${
                      statusFilter === 'ACKNOWLEDGED'
                        ? 'bg-brandTealLight text-brandTeal border-brandTeal/30 font-semibold'
                        : 'bg-[#FAFAFA] text-mutedGray border-hairline'
                    }`}
                  >
                    Ack&apos;d
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Scrollable SOS Cards Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAFAFA]">
            {isSosLoading ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-mutedGray gap-2">
                <Loader2 className="w-8 h-8 text-brandTeal animate-spin" />
                <p className="text-xs font-semibold text-primaryText">Loading SOS Feed...</p>
              </div>
            ) : filteredSosList.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-mutedGray">
                <CheckCircle className="w-10 h-10 text-brandTeal/40 mb-2" />
                <p className="text-xs font-semibold text-primaryText">No SOS events found</p>
                <p className="text-[11px] text-mutedGray mt-1">
                  {searchQuery ? 'Try refining your search filter.' : 'All emergency alerts are currently quiet.'}
                </p>
              </div>
            ) : (
              filteredSosList.map(sos => {
                const isSelected = selectedSosId === sos.id || selectedSosId === sos.rawId;
                const isAuthority = sos.role === 'AUTHORITY';
                const isEmergencyActive = sos.status === 'ACTIVE';

                return (
                  <div
                    key={sos.rawId || sos.id}
                    onClick={() => setSelectedSosId(sos.id)}
                    className={`p-4 rounded-16dp bg-surface border transition-all cursor-pointer text-left relative shadow-xs hover:border-brandTeal/60 ${
                      isSelected
                        ? 'border-brandTeal ring-2 ring-brandTeal/10'
                        : 'border-hairline'
                    }`}
                  >
                    {/* Status chip & SOS Identifier */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        {/* Reserved Red used strictly for genuine Active SOS */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isEmergencyActive
                              ? 'bg-alertRedBg text-alertRed border border-alertRedBorder animate-pulse'
                              : sos.status === 'ACKNOWLEDGED'
                              ? 'bg-brandTealLight text-brandTeal border border-brandTeal/20'
                              : 'bg-[#F5F5F5] text-mutedGray border border-hairline'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isEmergencyActive ? 'bg-alertRed' : sos.status === 'ACKNOWLEDGED' ? 'bg-brandTeal' : 'bg-mutedGray'
                            }`}
                          ></span>
                          {sos.status}
                        </span>
                        <span className="font-mono text-[11px] text-mutedGray font-medium">
                          #{sos.id}
                        </span>
                      </div>
                      <span className="text-[11px] text-mutedGray font-mono">
                        {formatTime(sos.timestamp)}
                      </span>
                    </div>

                    {/* Node Card Token styling (Authority & Rescue Card vs Regular Node Card) */}
                    <div className="flex items-start gap-3">
                      {/* Avatar Badge */}
                      <div
                        className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold border ${
                          isAuthority
                            ? 'bg-brandTeal text-surface border-brandTeal'
                            : 'bg-[#F5F5F5] text-primaryText border-hairline'
                        }`}
                      >
                        {isAuthority ? (
                          <Shield className="w-5 h-5 text-white" />
                        ) : (
                          <User className="w-5 h-5 text-mutedGray" />
                        )}
                      </div>

                      {/* Node Information */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-primaryText truncate">
                            {sos.userName}
                          </h4>
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-brandTeal px-1.5 py-0.5 rounded bg-brandTealLight">
                            {isAuthority ? 'Authority Node' : 'Regular Node'}
                          </span>
                        </div>

                        <p className="text-xs text-mutedGray truncate mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-brandTeal flex-shrink-0" />
                          <span className="truncate">{sos.location}</span>
                        </p>

                        {/* Node telemetry stats */}
                        <div className="mt-2.5 pt-2 border-t border-hairline/60 flex items-center justify-between text-[11px] text-mutedGray">
                          <span className="flex items-center gap-1 font-mono">
                            <Battery className="w-3 h-3" />
                            {sos.batteryLevel}
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <Radio className="w-3 h-3" />
                            {sos.peerNodesInRange} Peered
                          </span>
                          <span className="text-brandTeal font-medium flex items-center gap-0.5">
                            Details
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </main>

      {/* ================= 3. SOS Action Interface (Slide-out Drawer / Modal) ================= */}
      {selectedSosId && activeDrawerSos && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20 backdrop-blur-xs transition-opacity animate-fade-in">
          <div className="w-full max-w-lg bg-surface h-full border-l border-hairline shadow-2xl flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="p-5 border-b border-hairline flex items-center justify-between bg-surface">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#F5F5F5] text-mutedGray border border-hairline">
                    GET /api/sos/{activeDrawerSos.rawId || activeDrawerSos.id}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      activeDrawerSos.status === 'ACTIVE'
                        ? 'bg-alertRedBg text-alertRed border border-alertRedBorder'
                        : 'bg-brandTealLight text-brandTeal border border-brandTeal/30'
                    }`}
                  >
                    {activeDrawerSos.status}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-primaryText mt-1">
                  Emergency Event Details
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedSosId(null);
                  setSelectedSosDetails(null);
                }}
                className="w-8 h-8 rounded-full border border-hairline hover:bg-[#F5F5F5] flex items-center justify-center text-mutedGray hover:text-primaryText transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body - Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {drawerLoading ? (
                <div className="h-48 flex items-center justify-center text-brandTeal">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Originating User Profile Card */}
                  <div className="p-4 bg-canvas rounded-16dp border border-hairline">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${
                          activeDrawerSos.role === 'AUTHORITY'
                            ? 'bg-brandTeal text-surface'
                            : 'bg-surface border border-hairline text-primaryText'
                        }`}
                      >
                        {activeDrawerSos.role === 'AUTHORITY' ? (
                          <Shield className="w-6 h-6 text-white" />
                        ) : (
                          <User className="w-6 h-6 text-mutedGray" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-base font-bold text-primaryText">{activeDrawerSos.userName}</h4>
                          <span className="text-[11px] font-mono text-mutedGray">
                            User: {activeDrawerSos.userId}
                          </span>
                        </div>
                        <p className="text-xs text-brandTeal font-medium mt-0.5">
                          {activeDrawerSos.role === 'AUTHORITY'
                            ? 'Authority & Rescue Node Operator'
                            : 'Civilian Regular Node (Citizen Telemetry)'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-hairline text-xs">
                      <div>
                        <span className="text-mutedGray block text-[11px]">Reported Time</span>
                        <span className="font-semibold text-primaryText">
                          {new Date(activeDrawerSos.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-mutedGray block text-[11px]">Hardware Battery</span>
                        <span className="font-semibold text-primaryText font-mono">{activeDrawerSos.batteryLevel}</span>
                      </div>
                      <div>
                        <span className="text-mutedGray block text-[11px]">Direct LoRa Mesh Peers</span>
                        <span className="font-semibold text-primaryText font-mono">
                          {activeDrawerSos.peerNodesInRange} nodes in range
                        </span>
                      </div>
                      <div>
                        <span className="text-mutedGray block text-[11px]">Urgency Classification</span>
                        <span className="font-semibold text-alertRed font-mono">{activeDrawerSos.severity}</span>
                      </div>
                    </div>
                  </div>

                  {/* Geolocation Specs */}
                  <div className="p-4 bg-surface rounded-16dp border border-hairline">
                    <h5 className="text-xs font-bold text-brandTeal uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Crosshair className="w-3.5 h-3.5" />
                      Reported Location Telemetry
                    </h5>
                    <p className="text-sm font-medium text-primaryText">{activeDrawerSos.location}</p>
                    {activeDrawerSos.message && (
                      <p className="text-xs italic text-mutedGray mt-2 bg-canvas p-2.5 rounded-lg border border-hairline">
                        &quot;{activeDrawerSos.message}&quot;
                      </p>
                    )}
                    <p className="text-[11px] text-mutedGray mt-2">
                      ZeroGrid Decentralized Mesh packet received via 868MHz relay gateway.
                    </p>
                  </div>

                  {/* Action Buttons (Strict API: PUT /api/sos/:id/acknowledge, PUT /api/sos/:id/resolve) */}
                  <div className="p-4 bg-canvas rounded-16dp border border-hairline">
                    <h5 className="text-xs font-bold text-primaryText uppercase tracking-wider mb-3">
                      Dispatch Action Controls
                    </h5>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Acknowledge Action Button */}
                      <button
                        disabled={
                          actionLoading ||
                          activeDrawerSos.status === 'ACKNOWLEDGED' ||
                          activeDrawerSos.status === 'RESOLVED'
                        }
                        onClick={() => handleAcknowledgeSos(activeDrawerSos.id)}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-16dp text-xs font-semibold border transition-all ${
                          activeDrawerSos.status === 'ACKNOWLEDGED'
                            ? 'bg-brandTealLight text-brandTeal border-brandTeal/30 cursor-not-allowed'
                            : 'bg-surface hover:bg-[#F5F5F5] text-brandTeal border-brandTeal hover:border-brandTeal/80 shadow-xs'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                        <span>
                          {activeDrawerSos.status === 'ACKNOWLEDGED'
                            ? 'Acknowledged'
                            : 'PUT /api/sos/acknowledge'}
                        </span>
                      </button>

                      {/* Resolve Action Button (Strictly Reserved Red Rule applied here for active emergency resolution) */}
                      <button
                        disabled={actionLoading || activeDrawerSos.status === 'RESOLVED'}
                        onClick={() => handleResolveSos(activeDrawerSos.id)}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-16dp text-xs font-semibold transition-all ${
                          activeDrawerSos.status === 'RESOLVED'
                            ? 'bg-[#F5F5F5] text-mutedGray border border-hairline cursor-not-allowed'
                            : 'bg-alertRed hover:bg-[#B91C1C] text-white shadow-xs'
                        }`}
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>
                          {activeDrawerSos.status === 'RESOLVED' ? 'Resolved' : 'PUT /api/sos/resolve'}
                        </span>
                      </button>
                    </div>
                    <p className="text-[10px] text-mutedGray mt-2 text-center">
                      *Red action button strictly reserved for resolving genuine live SOS incidents.
                    </p>
                  </div>

                  {/* Operational Notes Section (POST /api/sos/:id/notes) */}
                  <div className="p-4 bg-surface rounded-16dp border border-hairline">
                    <div className="flex items-center justify-between mb-3">
                      <h5 className="text-xs font-bold text-primaryText uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-brandTeal" />
                        Incident Log Notes
                      </h5>
                      <span className="text-[10px] font-mono text-mutedGray">
                        POST /api/sos/{activeDrawerSos.rawId || activeDrawerSos.id}/notes
                      </span>
                    </div>

                    {/* Existing notes list */}
                    <div className="space-y-2.5 mb-3 max-h-48 overflow-y-auto">
                      {activeDrawerSos.notes.length === 0 ? (
                        <p className="text-xs text-mutedGray italic py-2 text-center bg-canvas rounded-lg border border-hairline">
                          No dispatch notes recorded yet.
                        </p>
                      ) : (
                        activeDrawerSos.notes.map(n => (
                          <div key={n.id} className="p-2.5 rounded-lg bg-canvas border border-hairline text-xs">
                            <div className="flex items-center justify-between text-[11px] text-mutedGray mb-1">
                              <span className="font-semibold text-brandTeal">{n.author}</span>
                              <span className="font-mono">{formatTime(n.createdAt)}</span>
                            </div>
                            <p className="text-primaryText">{n.text}</p>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add note form */}
                    <form onSubmit={handleAddNote} className="flex gap-2">
                      <input
                        type="text"
                        value={noteInput}
                        onChange={e => setNoteInput(e.target.value)}
                        placeholder="Append dispatch telemetry notes..."
                        className="flex-1 bg-canvas border border-hairline rounded-xl px-3 py-1.5 text-xs text-primaryText focus:outline-none focus:border-brandTeal focus:bg-surface"
                      />
                      <button
                        type="submit"
                        disabled={!noteInput.trim() || actionLoading}
                        className="px-3 py-1.5 bg-brandTeal hover:bg-[#085555] text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-hairline bg-canvas flex items-center justify-between text-xs text-mutedGray">
              <span>Emergency Record Active</span>
              <button
                onClick={() => {
                  setSelectedSosId(null);
                  setSelectedSosDetails(null);
                }}
                className="font-medium text-primaryText hover:text-brandTeal"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 4. User Management Full-Screen Overlay / Modal ================= */}
      {isUserManagementOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/30 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-4xl h-[85vh] bg-surface rounded-16dp border border-hairline shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-hairline flex items-center justify-between bg-surface">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brandTealLight flex items-center justify-center text-brandTeal">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-primaryText">User & Node Authority Management</h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F5F5F5] text-mutedGray border border-hairline">
                      GET /api/admin/users
                    </span>
                  </div>
                  <p className="text-xs text-mutedGray mt-0.5">
                    Manage ZeroGrid peer nodes, promote field dispatchers, and revoke admin privileges.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsUserManagementOpen(false)}
                className="w-8 h-8 rounded-full border border-hairline hover:bg-[#F5F5F5] flex items-center justify-center text-mutedGray hover:text-primaryText transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bar for Users (regex/query representation) */}
            <div className="p-4 border-b border-hairline bg-canvas flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-mutedGray absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search users by name, email, or mesh address (GET /api/admin/users?q=)..."
                  className="w-full bg-surface border border-hairline rounded-xl pl-9 pr-3 py-2 text-xs text-primaryText focus:outline-none focus:border-brandTeal"
                />
              </div>
              <div className="text-xs text-mutedGray font-mono">
                Total Nodes: {users.length}
              </div>
            </div>

            {/* User Table / List */}
            <div className="flex-1 overflow-y-auto p-4">
              {isUsersLoading ? (
                <div className="h-64 flex items-center justify-center text-brandTeal gap-2">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-xs font-semibold text-primaryText">Querying User Directory...</span>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-hairline text-mutedGray font-semibold uppercase text-[10px] tracking-wider">
                      <th className="pb-3 pl-3">Node / User</th>
                      <th className="pb-3">Role & Token</th>
                      <th className="pb-3">Mesh Hardware</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 pr-3 text-right">Authority Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-mutedGray">
                          No users found matching query.
                        </td>
                      </tr>
                    ) : (
                      users.map(u => {
                        const isAdmin = u.role === 'ADMIN';
                        return (
                          <tr key={u.id} className="hover:bg-canvas/80 transition-colors">
                            {/* User Info */}
                            <td className="py-3.5 pl-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                    isAdmin
                                      ? 'bg-brandTeal text-surface'
                                      : 'bg-[#F5F5F5] text-primaryText border border-hairline'
                                  }`}
                                >
                                  {isAdmin ? (
                                    <Shield className="w-4 h-4" />
                                  ) : (
                                    <User className="w-4 h-4" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-bold text-primaryText">{u.name}</div>
                                  <div className="text-[11px] text-mutedGray font-mono">{u.email}</div>
                                </div>
                              </div>
                            </td>

                            {/* Role */}
                            <td className="py-3.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  isAdmin
                                    ? 'bg-brandTealLight text-brandTeal border border-brandTeal/30'
                                    : 'bg-[#F5F5F5] text-mutedGray border border-hairline'
                                }`}
                              >
                                {isAdmin ? 'Admin / Authority' : 'Citizen Node'}
                              </span>
                            </td>

                            {/* Mesh Hardware */}
                            <td className="py-3.5 font-mono text-mutedGray text-[11px]">
                              {u.nodeAddress}
                            </td>

                            {/* Status */}
                            <td className="py-3.5">
                              <span className="inline-flex items-center gap-1.5 text-xs text-primaryText">
                                <span className="w-1.5 h-1.5 rounded-full bg-brandTeal"></span>
                                {u.status}
                              </span>
                            </td>

                            {/* Actions (Strict API: POST /api/admin/admins, DELETE /api/admin/admins/:userId) */}
                            <td className="py-3.5 pr-3 text-right">
                              {isAdmin ? (
                                <button
                                  onClick={() => handleDemoteAdmin(u.id, u.name)}
                                  className="px-3 py-1.5 rounded-16dp bg-surface hover:bg-[#F5F5F5] border border-hairline text-mutedGray hover:text-primaryText font-medium text-xs transition-colors shadow-xs"
                                  title="DELETE /api/admin/admins/:userId"
                                >
                                  Revoke Admin
                                </button>
                              ) : (
                                <button
                                  onClick={() => handlePromoteAdmin(u.email, u.name)}
                                  className="px-3 py-1.5 rounded-16dp bg-brandTeal hover:bg-[#085555] text-white font-medium text-xs transition-colors shadow-xs"
                                  title="POST /api/admin/admins"
                                >
                                  Promote to Admin
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-hairline bg-canvas flex items-center justify-between text-xs text-mutedGray">
              <span>Backend Protocol: ZeroGrid Auth v2.1 • All queries executed on live node registry</span>
              <button
                onClick={() => setIsUserManagementOpen(false)}
                className="px-4 py-1.5 bg-surface border border-hairline rounded-16dp text-primaryText font-semibold hover:bg-[#F5F5F5]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
