'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, UserCheck, X, ChevronRight, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, Button, Input, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

interface LinkUser { displayName: string; email: string; photoUrl: string | null; }
interface FamilyLink {
  _id: string;
  parentId: LinkUser;
  childId: LinkUser;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REVOKED';
  requestedAt: string;
  respondedAt?: string;
}

const statusColors: Record<string, string> = {
  PENDING: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  ACCEPTED: 'text-green-400 bg-green-500/10 border-green-500/20',
  REJECTED: 'text-red-400 bg-red-500/10 border-red-500/20',
  REVOKED: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
};

export default function FamilyPage() {
  const { user } = useAuth();
  const [links, setLinks] = useState<FamilyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [childEmail, setChildEmail] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function fetchLinks() {
    setLoading(true);
    try {
      const data = await api.get<{ links: FamilyLink[] }>('/api/family/links');
      setLinks(data.links);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchLinks(); }, []);

  async function handleSendRequest() {
    if (!childEmail.trim()) return;
    setSendError(''); setSendLoading(true);
    try {
      await api.post('/api/family/link-request', { childEmail: childEmail.trim() });
      setShowSend(false); setChildEmail('');
      await fetchLinks();
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'Failed to send link request');
    } finally {
      setSendLoading(false);
    }
  }

  async function handleAction(linkId: string, action: 'accept' | 'revoke') {
    setActionLoading(linkId + action);
    try {
      await api.put(`/api/family/link/${linkId}/${action}`, {});
      await fetchLinks();
    } catch { /* ignore */ } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8 fade-in">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-white">Family Links</h1>
          <p className="text-gray-500 text-sm">Connect with family — parents can view child location during SOS.</p>
        </div>
        <Button id="family-link-btn" onClick={() => setShowSend(true)} variant="primary" size="sm" className="shrink-0">
          <Plus className="w-4 h-4" /> Link Request
        </Button>
      </div>

      {/* Send request modal */}
      {showSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-5 fade-in">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Send Family Link Request</h2>
              <button onClick={() => { setShowSend(false); setSendError(''); }} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-400">As a parent, enter the child account email. They'll receive a request to accept.</p>
            {sendError && <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{sendError}</div>}
            <Input id="family-child-email" label="Child's Email" type="email" placeholder="child@example.com" value={childEmail} onChange={e => setChildEmail(e.target.value)} />
            <div className="flex gap-3">
              <Button id="family-send-submit" onClick={handleSendRequest} loading={sendLoading} className="flex-1">Send Request</Button>
              <Button variant="secondary" onClick={() => { setShowSend(false); setSendError(''); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Links list */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="w-8 h-8 text-red-500" /></div>
      ) : links.length === 0 ? (
        <Card className="text-center py-16 space-y-4">
          <div className="w-14 h-14 bg-gray-800 rounded-2xl flex items-center justify-center mx-auto">
            <UserCheck className="w-7 h-7 text-gray-600" />
          </div>
          <p className="text-gray-400 font-medium">No family links yet</p>
          <p className="text-gray-600 text-sm">Send a link request to a child account to enable family tracking.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map(link => {
            const isParent = link.parentId.email === user?.email;
            const other = isParent ? link.childId : link.parentId;
            const isPending = link.status === 'PENDING';
            const isChildPending = !isParent && isPending;

            return (
              <Card key={link._id} className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center text-white font-bold shrink-0">
                    {other.displayName?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{other.displayName}</p>
                      <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                        {isParent ? 'Child' : 'Parent'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[link.status]}`}>
                        {link.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{other.email}</p>
                    <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Requested {new Date(link.requestedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {isChildPending && (
                    <Button
                      id={`family-accept-${link._id}`}
                      size="sm"
                      variant="primary"
                      onClick={() => handleAction(link._id, 'accept')}
                      loading={actionLoading === link._id + 'accept'}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Accept
                    </Button>
                  )}
                  {(link.status === 'PENDING' || link.status === 'ACCEPTED') && (
                    <Button
                      id={`family-revoke-${link._id}`}
                      size="sm"
                      variant="danger"
                      onClick={() => handleAction(link._id, 'revoke')}
                      loading={actionLoading === link._id + 'revoke'}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {isParent ? 'Revoke' : 'Reject'}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
