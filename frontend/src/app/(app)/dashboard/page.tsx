'use client';
import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Users, Bell, CheckCircle, AlertTriangle, UserCheck, ChevronRight, Clock } from 'lucide-react';
import { Card, StatusBadge, CategoryBadge, Spinner } from '@/components/ui';

interface SosEvent {
  id: string;
  category: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  message?: string;
  createdAt: string;
  location: { coordinates: [number, number] };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [recentSos, setRecentSos] = useState<SosEvent[]>([]);
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [loadingSos, setLoadingSos] = useState(true);

  useEffect(() => {
    if (user && !user.profileComplete) {
      router.replace('/profile?complete=1');
    }
  }, [user, router]);

  useEffect(() => {
    api.get<{ contacts: unknown[] }>('/api/contacts').then(d => setContactCount(d.contacts.length)).catch(() => { });
  }, []);

  useEffect(() => {
    setLoadingSos(false);
    setRecentSos([]);
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-6 sm:space-y-10 fade-in text-primaryText">

      {/* Header */}
      <div className="space-y-1 sm:space-y-1.5">
        <p className="text-mutedGray text-xs sm:text-sm font-medium">{greeting()},</p>
        <h1 className="text-2xl sm:text-3xl font-black text-primaryText font-display truncate">
          {user?.displayName || 'Citizen Node'}
        </h1>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider font-mono border ${
            user?.role === 'ADMIN'
              ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
              : 'bg-surfaceElevated text-secondaryText border-hairline'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${user?.role === 'ADMIN' ? 'bg-brandTeal' : 'bg-mutedGray'}`} />
            {user?.role === 'ADMIN' ? 'Admin / Rescue Team' : 'Citizen'}
          </span>
          {user?.profileComplete && (
            <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-brandTeal bg-brandTeal/10 px-2.5 py-1 rounded-full border border-brandTeal/20">
              <CheckCircle className="w-3.5 h-3.5" />
              Profile Complete
            </span>
          )}
        </div>
      </div>

      {/* Profile incomplete banner */}
      {!user?.profileComplete && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl sm:rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-sm">
          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-amber-500 text-sm">Complete your profile</p>
            <p className="text-amber-500/80 text-xs sm:text-sm mt-0.5">Add your phone number and date of birth to activate SOS features.</p>
          </div>
          <Link href="/profile?complete=1" className="inline-flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-full text-xs font-bold transition-colors shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
            Complete Profile <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Admin SOS alert banner */}
      {user?.role === 'ADMIN' && (
        <Link href="/admin" className="block">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl sm:rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 hover:border-red-500/40 hover:bg-red-500/15 transition-all group cursor-pointer shadow-sm">
            <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-red-500 group-hover:animate-swing" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-red-500 text-sm">Admin Rescue Panel</p>
              <p className="text-red-400/90 text-xs sm:text-sm mt-0.5">View live SOS events, acknowledge and resolve emergencies.</p>
            </div>
            <div className="flex items-center text-red-500 font-bold text-xs mt-2 sm:mt-0">
              Open Panel <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </Link>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-mutedGray uppercase tracking-wider font-mono truncate">Network</p>
            <p className="font-bold text-primaryText text-sm sm:text-base truncate">ZeroGrid Active</p>
          </div>
        </Card>

        <Card className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-brandTeal/10 border border-brandTeal/20 rounded-full flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-brandTeal" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-mutedGray uppercase tracking-wider font-mono truncate">Contacts</p>
            <p className="font-bold text-primaryText text-sm sm:text-base flex items-center gap-1">
              {contactCount === null ? <Spinner className="w-4 h-4 text-brandTeal" /> : contactCount}
              <span className="text-secondaryText font-normal text-xs sm:text-sm"> saved</span>
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-surfaceElevated border border-hairline rounded-full flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5 sm:w-6 sm:h-6 text-mutedGray" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs text-mutedGray uppercase tracking-wider font-mono truncate">Profile</p>
            <p className={`font-bold text-sm sm:text-base truncate ${user?.profileComplete ? 'text-brandTeal' : 'text-amber-500'}`}>
              {user?.profileComplete ? 'Complete' : 'Incomplete'}
            </p>
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-base sm:text-lg font-bold text-primaryText mb-3 sm:mb-4 font-display">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Link href="/contacts" id="dash-contacts" className="bg-surfaceCard border border-hairline rounded-xl sm:rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:border-brandTeal/40 hover:bg-surfaceElevated/50 hover:shadow-md transition-all hover:-translate-y-0.5 group">
            <div className="w-10 h-10 bg-brandTeal/10 border border-brandTeal/20 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-brandTeal transition-colors">
              <Users className="w-5 h-5 text-brandTeal group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-primaryText text-sm truncate">Manage Contacts</p>
              <p className="text-[11px] sm:text-xs text-mutedGray truncate mt-0.5">Add or remove emergency contacts</p>
            </div>
            <ChevronRight className="w-4 h-4 text-hairlineBright group-hover:text-brandTeal group-hover:translate-x-1 transition-all shrink-0" />
          </Link>

          <Link href="/family" id="dash-family" className="bg-surfaceCard border border-hairline rounded-xl sm:rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:border-brandTeal/40 hover:bg-surfaceElevated/50 hover:shadow-md transition-all hover:-translate-y-0.5 group">
            <div className="w-10 h-10 bg-brandTeal/10 border border-brandTeal/20 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-brandTeal transition-colors">
              <UserCheck className="w-5 h-5 text-brandTeal group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-primaryText text-sm truncate">Family Links</p>
              <p className="text-[11px] sm:text-xs text-mutedGray truncate mt-0.5">Manage parent-child connections</p>
            </div>
            <ChevronRight className="w-4 h-4 text-hairlineBright group-hover:text-brandTeal group-hover:translate-x-1 transition-all shrink-0" />
          </Link>

          <Link href="/profile" id="dash-profile" className="bg-surfaceCard border border-hairline rounded-xl sm:rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:border-brandTeal/40 hover:bg-surfaceElevated/50 hover:shadow-md transition-all hover:-translate-y-0.5 group">
            <div className="w-10 h-10 bg-surfaceElevated border border-hairline rounded-xl flex items-center justify-center shrink-0 group-hover:bg-primaryText transition-colors">
              <Shield className="w-5 h-5 text-mutedGray group-hover:text-canvas transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-primaryText text-sm truncate">My Profile</p>
              <p className="text-[11px] sm:text-xs text-mutedGray truncate mt-0.5">Update your personal details</p>
            </div>
            <ChevronRight className="w-4 h-4 text-hairlineBright group-hover:text-primaryText group-hover:translate-x-1 transition-all shrink-0" />
          </Link>

          {user?.role === 'ADMIN' && (
            <Link href="/admin" id="dash-admin" className="bg-surfaceCard border border-red-500/20 rounded-xl sm:rounded-2xl p-4 sm:p-5 flex items-center gap-3 sm:gap-4 hover:border-red-500/40 hover:bg-surfaceElevated/50 hover:shadow-md transition-all hover:-translate-y-0.5 group">
              <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-red-500 transition-colors">
                <AlertTriangle className="w-5 h-5 text-red-500 group-hover:text-white transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-primaryText text-sm truncate">Admin Panel</p>
                <p className="text-[11px] sm:text-xs text-mutedGray truncate mt-0.5">Live SOS events and rescue coordination</p>
              </div>
              <ChevronRight className="w-4 h-4 text-hairlineBright group-hover:text-red-500 group-hover:translate-x-1 transition-all shrink-0" />
            </Link>
          )}
        </div>
      </div>

      {/* Recent SOS placeholder */}
      {!loadingSos && recentSos.length > 0 && (
        <div>
          <h2 className="text-base sm:text-lg font-bold text-primaryText mb-3 sm:mb-4 font-display">Your Recent SOS Events</h2>
          <div className="space-y-3">
            {recentSos.map(sos => (
              <Card key={sos.id} className="p-4 flex items-start gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <StatusBadge status={sos.status} />
                    <CategoryBadge category={sos.category} />
                  </div>
                  {sos.message && <p className="text-xs sm:text-sm text-primaryText font-medium truncate">{sos.message}</p>}
                  <p className="text-[10px] sm:text-xs text-mutedGray mt-1.5 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    {new Date(sos.createdAt).toLocaleString()}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}