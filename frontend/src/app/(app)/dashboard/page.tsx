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
    // Redirect to complete profile if needed
    if (user && !user.profileComplete) {
      router.replace('/profile?complete=1');
    }
  }, [user, router]);

  useEffect(() => {
    api.get<{ contacts: unknown[] }>('/api/contacts').then(d => setContactCount(d.contacts.length)).catch(() => { });
  }, []);

  useEffect(() => {
    // Admins see live SOS on /admin — citizens only see their own
    // There's no /api/sos list endpoint per citizen, we show just quick links
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
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10 fade-in">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-gray-500 text-sm">{greeting()},</p>
        <h1 className="text-3xl font-black text-white">{user?.displayName}</h1>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${user?.role === 'ADMIN' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {user?.role === 'ADMIN' ? 'Admin / Rescue Team' : 'Citizen'}
          </span>
          {user?.profileComplete && (
            <span className="inline-flex items-center gap-1 text-xs text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              Profile Complete
            </span>
          )}
        </div>
      </div>

      {/* Profile incomplete banner */}
      {!user?.profileComplete && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-5 flex items-start gap-4">
          <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-yellow-300 text-sm">Complete your profile</p>
            <p className="text-yellow-500/80 text-sm mt-0.5">Add your phone number and date of birth to activate SOS features.</p>
          </div>
          <Link href="/profile?complete=1" className="text-xs text-yellow-400 hover:text-yellow-300 font-medium shrink-0 flex items-center gap-1">
            Complete <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Admin SOS alert */}
      {user?.role === 'ADMIN' && (
        <Link href="/admin" className="block">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex items-center gap-4 hover:border-red-500/40 transition-colors group cursor-pointer sos-pulse">
            <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
              <Bell className="w-5 h-5 text-red-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-300 text-sm">Admin Rescue Panel</p>
              <p className="text-red-400/70 text-sm mt-0.5">View live SOS events, acknowledge and resolve emergencies.</p>
            </div>
            <ChevronRight className="w-5 h-5 text-red-400 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Network</p>
            <p className="font-bold text-white">ZeroGrid Active</p>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Emergency Contacts</p>
            <p className="font-bold text-white">
              {contactCount === null ? <Spinner className="w-4 h-4" /> : contactCount}
              <span className="text-gray-500 font-normal text-sm"> saved</span>
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">Profile</p>
            <p className="font-bold text-white">{user?.profileComplete ? 'Complete' : 'Incomplete'}</p>
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/contacts" id="dash-contacts" className="glass-card rounded-2xl p-5 flex items-center gap-4 hover:border-white/15 transition-all hover:-translate-y-0.5 group">
            <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">Manage Contacts</p>
              <p className="text-xs text-gray-500">Add or remove emergency contacts</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 group-hover:translate-x-1 transition-all" />
          </Link>

          <Link href="/family" id="dash-family" className="glass-card rounded-2xl p-5 flex items-center gap-4 hover:border-white/15 transition-all hover:-translate-y-0.5 group">
            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">Family Links</p>
              <p className="text-xs text-gray-500">Manage parent-child connections</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 group-hover:translate-x-1 transition-all" />
          </Link>

          <Link href="/profile" id="dash-profile" className="glass-card rounded-2xl p-5 flex items-center gap-4 hover:border-white/15 transition-all hover:-translate-y-0.5 group">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">My Profile</p>
              <p className="text-xs text-gray-500">Update your personal details</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 group-hover:translate-x-1 transition-all" />
          </Link>

          {user?.role === 'ADMIN' && (
            <Link href="/admin" id="dash-admin" className="glass-card rounded-2xl p-5 flex items-center gap-4 hover:border-orange-500/20 transition-all hover:-translate-y-0.5 group border-orange-500/10">
              <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white text-sm">Admin Panel</p>
                <p className="text-xs text-gray-500">Live SOS events and rescue coordination</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-orange-400 group-hover:translate-x-1 transition-all" />
            </Link>
          )}
        </div>
      </div>

      {/* Recent SOS placeholder (visible only if there are any) */}
      {!loadingSos && recentSos.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Your Recent SOS Events</h2>
          <div className="space-y-3">
            {recentSos.map(sos => (
              <Card key={sos.id} className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={sos.status} />
                    <CategoryBadge category={sos.category} />
                  </div>
                  {sos.message && <p className="text-sm text-gray-300">{sos.message}</p>}
                  <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
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
