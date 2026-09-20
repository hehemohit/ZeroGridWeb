'use client';
import { useState, FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { Input, Button } from '@/components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(239,68,68,0.1),transparent)]" />

      <div className="relative w-full max-w-md space-y-8 fade-in">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-2xl font-black text-white">Welcome back</h1>
          <p className="text-gray-500 text-sm">Sign in to your ZeroGrid account</p>
        </div>

        {/* Form card */}
        <div className="glass-card rounded-2xl p-8 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form id="login-form" onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="login-email"
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              id="login-submit"
              loading={loading}
              className="w-full"
              size="lg"
            >
              Sign In
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-red-400 hover:text-red-300 font-medium">
            Create one free
          </Link>
        </p>
      </div>
    </div>
  );
}
