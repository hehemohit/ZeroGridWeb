'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, UserCheck, X, Clock, CheckCircle, XCircle } from 'lucide-react';
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
  PENDING: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  ACCEPTED: 'text-brandTeal bg-brandTeal/10 border-brandTeal/20',
  REJECTED: 'text-red-500 bg-red-500/10 border-red-500/20',
  REVOKED: 'text-mutedGray bg-surfaceElevated border-hairline',
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
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 space-y-6 sm:space-y-8 fade-in text-primaryText">

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-0">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-primaryText font-display">Family Links</h1>
          <p className="text-mutedGray text-xs sm:text-sm">Connect with family — parents can view child location during SOS.</p>
        </div>
        <Button
          id="family-link-btn"
          onClick={() => setShowSend(true)}
          variant="primary"
          size="sm"
          className="shrink-0 bg-brandTeal hover:bg-brandTealGlow text-white border-none shadow-sm rounded-full w-full sm:w-auto flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Link Request
        </Button>
      </div>

      {/* Send Request Modal */}
      {showSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface border border-hairline shadow-2xl rounded-2xl p-5 sm:p-6 w-full max-w-md space-y-5 fade-in text-primaryText">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-primaryText text-lg">Send Link Request</h2>
              <button
                onClick={() => { setShowSend(false); setSendError(''); }}
                className="text-mutedGray hover:text-primaryText bg-surfaceElevated hover:bg-surfaceCard p-1.5 rounded-full transition-colors"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-mutedGray">
              As a parent, enter the child account email. They'll receive a request to accept.
            </p>

            {sendError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-500 font-medium">
                {sendError}
              </div>
            )}

            <Input
              id="family-child-email"
              label="Child's Email"
              type="email"
              placeholder="child@example.com"
              value={childEmail}
              onChange={e => setChildEmail(e.target.value)}
            />

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => { setShowSend(false); setSendError(''); }}
                className="flex-1 rounded-full"
              >
                Cancel
              </Button>
              <Button
                id="family-send-submit"
                onClick={handleSendRequest}
                loading={sendLoading}
                className="flex-1 bg-brandTeal hover:bg-brandTealGlow text-white border-none rounded-full"
              >
                Send Request
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Links List / Empty States */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="w-8 h-8 text-brandTeal" />
        </div>
      ) : links.length === 0 ? (
        <Card className="text-center py-12 sm:py-16 space-y-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-brandTeal/10 border border-brandTeal/20 rounded-2xl flex items-center justify-center mx-auto">
            <UserCheck className="w-6 h-6 sm:w-7 sm:h-7 text-brandTeal" />
          </div>
          <div>
            <p className="text-primaryText font-bold text-base">No family links yet</p>
            <p className="text-mutedGray text-xs sm:text-sm mt-1 max-w-sm mx-auto">
              Send a link request to a child account to enable family tracking during emergencies.
            </p>
          </div>
          <Button
            onClick={() => setShowSend(true)}
            className="mx-auto bg-brandTeal hover:bg-brandTealGlow text-white rounded-full mt-4 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Link Child Account
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {links.map(link => {
            const isParent = link.parentId.email === user?.email;
            const other = isParent ? link.childId : link.parentId;
            const isPending = link.status === 'PENDING';
            const isChildPending = !isParent && isPending;

            return (
              <Card
                key={link._id}
                className="space-y-4 p-4 hover:border-brandTeal/40 transition-all"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-10 h-10 bg-brandTeal/10 border border-brandTeal/20 rounded-xl flex items-center justify-center text-brandTeal font-bold shrink-0">
                    {other.displayName?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-primaryText truncate text-sm sm:text-base">
                        {other.displayName}
                      </p>
                      <span className="text-[10px] sm:text-xs text-secondaryText bg-surfaceElevated border border-hairline px-2 py-0.5 rounded-full shrink-0">
                        {isParent ? 'Child' : 'Parent'}
                      </span>
                      <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono border ${statusColors[link.status]}`}>
                        {link.status}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-mutedGray truncate">{other.email}</p>
                    <p className="text-[10px] sm:text-[11px] text-mutedGray mt-1.5 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      Requested {new Date(link.requestedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap pt-2 sm:pt-1 border-t sm:border-none border-hairline">
                  {isChildPending && (
                    <Button
                      id={`family-accept-${link._id}`}
                      size="sm"
                      onClick={() => handleAction(link._id, 'accept')}
                      loading={actionLoading === link._id + 'accept'}
                      className="bg-brandTeal hover:bg-brandTealGlow text-white rounded-full flex-1 sm:flex-none py-1.5 sm:py-2 text-[11px] sm:text-xs"
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                      Accept
                    </Button>
                  )}
                  {(link.status === 'PENDING' || link.status === 'ACCEPTED') && (
                    <Button
                      id={`family-revoke-${link._id}`}
                      size="sm"
                      onClick={() => handleAction(link._id, 'revoke')}
                      loading={actionLoading === link._id + 'revoke'}
                      className="bg-surfaceElevated hover:bg-red-500/10 text-secondaryText hover:text-red-500 border border-hairline hover:border-red-500/20 rounded-full flex-1 sm:flex-none py-1.5 sm:py-2 text-[11px] sm:text-xs"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" />
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