'use client';
import { useAuth } from '@/context/AuthContext';
import { useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { User, Save, CheckCircle } from 'lucide-react';
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
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8 fade-in">
      <div className="space-y-1">
        <h1 className="text-3xl font-black text-white">{isCompleting ? 'Complete Your Profile' : 'My Profile'}</h1>
        <p className="text-gray-500 text-sm">
          {isCompleting
            ? 'Add your phone and date of birth to activate SOS features.'
            : 'Update your personal information.'}
        </p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center text-2xl font-black text-white">
          {user?.displayName?.[0]?.toUpperCase() ?? 'U'}
        </div>
        <div>
          <p className="font-semibold text-white">{user?.displayName}</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
          <span className={`inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 rounded-full ${user?.role === 'ADMIN' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
            {user?.role}
          </span>
        </div>
      </div>

      <Card>
        {error && (
          <div className="mb-5 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-5 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 text-sm text-green-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {success}
          </div>
        )}

        <form id="profile-form" onSubmit={handleSubmit} className="space-y-5">
          {!isCompleting && (
            <>
              <Input id="profile-name" label="Display Name" value={form.displayName} onChange={set('displayName')} placeholder="Alice Smith" />
              <Input id="profile-photo" label="Photo URL (optional)" type="url" value={form.photoUrl} onChange={set('photoUrl')} placeholder="https://..." />
            </>
          )}

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

          <Button type="submit" id="profile-save" loading={loading} className="w-full" size="lg">
            <Save className="w-4 h-4" />
            {isCompleting ? 'Complete Profile' : 'Save Changes'}
          </Button>
        </form>
      </Card>

      {/* Account info */}
      <Card>
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" />
          Account Info
        </h2>
        <div className="space-y-3 text-sm">
          {[
            { label: 'Email', value: user?.email },
            { label: 'Account Type', value: user?.accountType },
            { label: 'Member Since', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—' },
          ].map(row => (
            <div key={row.label} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
              <span className="text-gray-500">{row.label}</span>
              <span className="text-gray-200">{row.value ?? '—'}</span>
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
