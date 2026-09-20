'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';
import {
  AlertTriangle, CheckCircle, XCircle, Clock,
  Users, History, Search, RefreshCw, Filter, StickyNote, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, Button, StatusBadge, CategoryBadge, Spinner } from '@/components/ui';

interface SosEvent {
  id: string;
  triggeredBy: { displayName: string; email: string };
  location: { type: string; coordinates: [number, number] };
  accuracyMeters?: number;
  category: string;
  message?: string;
  transport: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  notes?: { authorId: string; text: string; timestamp: string }[];
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

type Tab = 'live' | 'history' | 'users';

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('live');
  const [events, setEvents] = useState<SosEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'>('ACTIVE');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  // Users directory state
  const [users, setUsers] = useState<{ id: string; displayName: string; email: string; role: string; profileComplete: boolean }[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [userLoading, setUserLoading] = useState(false);

  // History state
  const [historyCategory, setHistoryCategory] = useState('');

  // Socket ref
  const socketRef = useRef<Socket | null>(null);

  // Guard: admin only
  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.replace('/dashboard');
  }, [user, router]);

  const fetchSos = useCallback(async (status = statusFilter) => {
    setLoading(true);
    try {
      const data = await api.get<{ events: SosEvent[]; pagination: Pagination }>(
        `/api/admin/sos?status=${status}&limit=20`
      );
      setEvents(data.events);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (historyCategory) params.set('category', historyCategory);
      const data = await api.get<{ events: SosEvent[]; pagination: Pagination }>(
        `/api/admin/sos/history?${params}`
      );
      setEvents(data.events);
      setPagination(data.pagination);
    } finally {
      setLoading(false);
    }
  }, [historyCategory]);

  const fetchUsers = useCallback(async (q = userQuery) => {
    setUserLoading(true);
    try {
      const data = await api.get<{ users: typeof users; pagination: Pagination }>(
        `/api/admin/users?q=${encodeURIComponent(q)}&limit=20`
      );
      setUsers(data.users);
    } finally {
      setUserLoading(false);
    }
  }, [userQuery]);

  // Fetch active SOS count for badge
  useEffect(() => {
    api.get<{ pagination: Pagination }>('/api/admin/sos?status=ACTIVE&limit=1')
      .then(d => setLiveCount(d.pagination.total))
      .catch(() => {});
  }, [events]);

  // Tab data fetch
  useEffect(() => {
    if (tab === 'live') fetchSos(statusFilter);
    if (tab === 'history') fetchHistory();
    if (tab === 'users') fetchUsers();
  }, [tab]);

  // Socket.io for real-time updates
  useEffect(() => {
    const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const socket = io(`${BACKEND}/sos`, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('sos:new', (newSos: SosEvent) => {
      setLiveCount(c => c + 1);
      if (tab === 'live' && statusFilter === 'ACTIVE') {
        setEvents(prev => [newSos, ...prev]);
      }
    });

    socket.on('sos:updated', (updated: SosEvent) => {
      setEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
    });

    return () => { socket.disconnect(); };
  }, [tab, statusFilter]);

  async function handleAction(sosId: string, action: 'acknowledge' | 'resolve') {
    setActionLoading(sosId + action);
    try {
      await api.put(`/api/sos/${sosId}/${action}`, {});
      await fetchSos();
    } catch { /* show toast in a real app */ }
    finally { setActionLoading(null); }
  }

  async function handleAddNote(sosId: string) {
    const text = noteText[sosId]?.trim();
    if (!text) return;
    setActionLoading(sosId + 'note');
    try {
      await api.post(`/api/sos/${sosId}/notes`, { text });
      setNoteText(prev => ({ ...prev, [sosId]: '' }));
      await fetchSos();
    } finally { setActionLoading(null); }
  }

  const categories = ['MEDICAL', 'DISASTER', 'TRAPPED', 'SECURITY', 'OTHER'];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8 fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-black text-white">Admin Panel</h1>
            {liveCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full sos-pulse">
                {liveCount} ACTIVE
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm">Rescue coordination dashboard — real-time SOS events via Socket.io.</p>
        </div>
        <Button id="admin-refresh" variant="secondary" size="sm" onClick={() => tab === 'live' ? fetchSos() : tab === 'history' ? fetchHistory() : fetchUsers()}>
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 p-1 rounded-xl w-fit border border-white/5">
        {([
          { key: 'live', label: 'Live SOS', icon: AlertTriangle },
          { key: 'history', label: 'History', icon: History },
          { key: 'users', label: 'Users', icon: Users },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`admin-tab-${key}`}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* --- LIVE SOS TAB --- */}
      {tab === 'live' && (
        <div className="space-y-4">
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'] as const).map(s => (
              <button
                key={s}
                id={`admin-filter-${s.toLowerCase()}`}
                onClick={() => { setStatusFilter(s); fetchSos(s); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  statusFilter === s
                    ? s === 'ACTIVE' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : s === 'ACKNOWLEDGED' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                    : 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'text-gray-500 border-gray-700 hover:text-gray-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner className="w-8 h-8 text-red-500" /></div>
          ) : events.length === 0 ? (
            <Card className="text-center py-16">
              <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No {statusFilter.toLowerCase()} events</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {events.map(ev => (
                <Card key={ev.id} className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${ev.status === 'ACTIVE' ? 'bg-red-500 animate-pulse' : ev.status === 'ACKNOWLEDGED' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={ev.status} />
                        <CategoryBadge category={ev.category} />
                        <span className="text-xs text-gray-600">{ev.transport}</span>
                      </div>
                      <p className="font-semibold text-white mt-1">{ev.triggeredBy.displayName}</p>
                      <p className="text-xs text-gray-500">{ev.triggeredBy.email}</p>
                      {ev.message && <p className="text-sm text-gray-300 mt-1 italic">&quot;{ev.message}&quot;</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(ev.createdAt).toLocaleString()}</span>
                        {ev.location && (
                          <a
                            href={`https://maps.google.com/?q=${ev.location.coordinates[1]},${ev.location.coordinates[0]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline"
                          >
                            📍 View on Map
                          </a>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                      className="text-gray-500 hover:text-gray-300 p-1"
                    >
                      {expandedId === ev.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap pl-6">
                    {ev.status === 'ACTIVE' && (
                      <Button
                        id={`admin-ack-${ev.id}`}
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAction(ev.id, 'acknowledge')}
                        loading={actionLoading === ev.id + 'acknowledge'}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Acknowledge
                      </Button>
                    )}
                    {(ev.status === 'ACTIVE' || ev.status === 'ACKNOWLEDGED') && (
                      <Button
                        id={`admin-resolve-${ev.id}`}
                        size="sm"
                        variant="primary"
                        onClick={() => handleAction(ev.id, 'resolve')}
                        loading={actionLoading === ev.id + 'resolve'}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Resolve
                      </Button>
                    )}
                  </div>

                  {/* Expanded: notes */}
                  {expandedId === ev.id && (
                    <div className="pl-6 space-y-3 border-t border-white/5 pt-4">
                      {ev.notes && ev.notes.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider flex items-center gap-1">
                            <StickyNote className="w-3 h-3" /> Notes
                          </p>
                          {ev.notes.map((n, i) => (
                            <div key={i} className="bg-gray-900 rounded-lg px-3 py-2 text-sm text-gray-300">
                              {n.text}
                              <span className="block text-xs text-gray-600 mt-1">{new Date(n.timestamp).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          id={`admin-note-input-${ev.id}`}
                          placeholder="Add a note…"
                          value={noteText[ev.id] ?? ''}
                          onChange={e => setNoteText(prev => ({ ...prev, [ev.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddNote(ev.id)}
                          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
                        />
                        <Button
                          id={`admin-note-submit-${ev.id}`}
                          size="sm"
                          variant="secondary"
                          onClick={() => handleAddNote(ev.id)}
                          loading={actionLoading === ev.id + 'note'}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- HISTORY TAB --- */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center flex-wrap">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm text-gray-500">Category:</span>
            <select
              id="admin-history-category"
              value={historyCategory}
              onChange={e => { setHistoryCategory(e.target.value); fetchHistory(); }}
              className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            >
              <option value="">All</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner className="w-8 h-8 text-red-500" /></div>
          ) : events.length === 0 ? (
            <Card className="text-center py-16">
              <History className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No history yet</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {events.map(ev => (
                <Card key={ev.id} className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={ev.status} />
                      <CategoryBadge category={ev.category} />
                    </div>
                    <p className="font-semibold text-white mt-1 text-sm">{ev.triggeredBy.displayName}</p>
                    {ev.message && <p className="text-sm text-gray-400 italic mt-0.5">&quot;{ev.message}&quot;</p>}
                    <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{new Date(ev.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {ev.location && (
                    <a
                      href={`https://maps.google.com/?q=${ev.location.coordinates[1]},${ev.location.coordinates[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
                    >
                      📍 Map
                    </a>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- USERS TAB --- */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                id="admin-user-search"
                placeholder="Search by name or email…"
                value={userQuery}
                onChange={e => setUserQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchUsers(userQuery)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
              />
            </div>
            <Button id="admin-user-search-btn" variant="secondary" onClick={() => fetchUsers(userQuery)}>Search</Button>
          </div>

          {userLoading ? (
            <div className="flex justify-center py-16"><Spinner className="w-8 h-8 text-red-500" /></div>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <Card key={u.id} className="flex items-center gap-4">
                  <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {u.displayName?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{u.displayName}</p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'ADMIN' ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-700 text-gray-400'}`}>
                      {u.role}
                    </span>
                    {u.profileComplete && <CheckCircle className="w-4 h-4 text-green-400" />}
                  </div>
                </Card>
              ))}
              {users.length === 0 && !userLoading && (
                <Card className="text-center py-12">
                  <p className="text-gray-500">No users found</p>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pagination summary */}
      {pagination && pagination.total > 0 && tab !== 'users' && (
        <p className="text-xs text-gray-600 text-center">
          Showing {events.length} of {pagination.total} events
        </p>
      )}
    </div>
  );
}
