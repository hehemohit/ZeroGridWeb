'use client';
import { useAuth } from '@/context/AuthContext';
import { useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { User, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, Input, Button } from '@/components/ui';
import { Suspense } from 'react';

function ProfileForm() {
  const { user, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const isCompleting = searchParams.get('complete') === '1';

  const [form, setForm] = useState({
    displayName: user?.displayName ?? '',
    phoneNumber: user?.phoneNumber ?? '',
    dateOfBirth: user?.dateOfBirth ? user.dateOfBirth.slice(0, 10) : '',
    photoUrl: user?.photoUrl ?? '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    setLoading(true);
    try {
      if (isCompleting && !user?.profileComplete) {
        await api.put('/api/users/me/complete-profile', {
          phoneNumber: form.phoneNumber,
          dateOfBirth: form.dateOfBirth,
        });
      } else {
        await api.put('/api/users/me', {
          displayName: form.displayName || undefined,
          phoneNumber: form.phoneNumber || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          photoUrl: form.photoUrl || undefined,
        });
      }
      await refreshUser();
      setSuccess('Profile updated successfully!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 space-y-6 sm:space-y-8 fade-in text-primaryText">

      {/* Page Header */}
      <div className="space-y-1 sm:space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-black text-primaryText font-display">
          {isCompleting ? 'Complete Your Profile' : 'My Profile'}
        </h1>
        <p className="text-mutedGray text-xs sm:text-sm">
          {isCompleting
            ? 'Add your phone and date of birth to activate SOS features.'
            : 'Update your personal information.'}
        </p>
      </div>

      {/* Avatar & Top Info */}
      <div className="flex items-center gap-3 sm:gap-4 bg-surfaceCard border border-hairline p-4 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm">
        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-brandTeal/10 border border-brandTeal/20 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold text-brandTeal shrink-0">
          {user?.displayName?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-primaryText text-sm sm:text-base truncate">{user?.displayName}</p>
          <p className="text-xs sm:text-sm text-mutedGray truncate mt-0.5">{user?.email}</p>
          <span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono border ${
            user?.role === 'ADMIN'
              ? 'bg-brandTeal/10 text-brandTeal border-brandTeal/20'
              : 'bg-surfaceElevated text-secondaryText border-hairline'
          }`}>
            {user?.role === 'ADMIN' ? 'Admin Node' : 'Citizen Node'}
          </span>
        </div>
      </div>

      {/* Profile Edit Form */}
      <Card className="p-4 sm:p-6">
        {error && (
          <div className="mb-5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs sm:text-sm text-red-500 font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-5 bg-brandTeal/10 border border-brandTeal/20 rounded-xl px-4 py-3 text-xs sm:text-sm text-brandTeal font-medium flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        <form id="profile-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {!isCompleting && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              <Input
                id="profile-name"
                label="Display Name"
                value={form.displayName}
                onChange={set('displayName')}
                placeholder="Alice Smith"
              />
              <Input
                id="profile-photo"
                label="Photo URL (optional)"
                type="url"
                value={form.photoUrl}
                onChange={set('photoUrl')}
                placeholder="https://..."
              />
            </div>
          )}

          <div className={`grid grid-cols-1 ${isCompleting ? '' : 'sm:grid-cols-2'} gap-4 sm:gap-5`}>
            <Input
              id="profile-phone"
              label="Phone Number"
              type="tel"
              value={form.phoneNumber}
              onChange={set('phoneNumber')}
              placeholder="+919876543210"
              required={isCompleting}
            />

            <Input
              id="profile-dob"
              label="Date of Birth"
              type="date"
              value={form.dateOfBirth}
              onChange={set('dateOfBirth')}
              required={isCompleting}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>

          <Button
            type="submit"
            id="profile-save"
            loading={loading}
            className="w-full bg-brandTeal hover:bg-brandTealGlow text-white border-none rounded-full py-2.5 sm:py-3 mt-2 sm:mt-4 flex items-center justify-center gap-2"
            size="lg"
          >
            <Save className="w-4 h-4" />
            {isCompleting ? 'Complete Profile' : 'Save Changes'}
          </Button>
        </form>
      </Card>

      {/* Account Info Read-Only Details */}
      <Card className="p-4 sm:p-6">
        <h2 className="font-bold text-primaryText mb-3 sm:mb-4 flex items-center gap-2 font-display">
          <User className="w-4 h-4 text-brandTeal" />
          Account Info
        </h2>
        <div className="space-y-1 text-xs sm:text-sm">
          {[
            { label: 'Email Address', value: user?.email },
            { label: 'Authentication Type', value: user?.accountType },
            { label: 'Member Since', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—' },
          ].map(row => (
            <div key={row.label} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2.5 sm:py-3 border-b border-hairline last:border-0 gap-1 sm:gap-0">
              <span className="text-mutedGray font-medium">{row.label}</span>
              <span className="text-primaryText font-semibold">{row.value ?? '—'}</span>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileForm />
    </Suspense>
  );
}