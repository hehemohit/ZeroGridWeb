'use client';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Shield, Menu, X, LogOut, User, AlertTriangle, Users, Home } from 'lucide-react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/family', label: 'Family', icon: Users },
  { href: '/profile', label: 'Profile', icon: User },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center group-hover:bg-red-400 transition-colors">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              Zero<span className="text-red-400">Grid</span>
            </span>
          </Link>

          {/* Desktop nav */}
          {user && (
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === href
                      ? 'bg-red-500/20 text-red-400'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {label}
                </Link>
              ))}
              {user.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                    pathname.startsWith('/admin')
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Admin
                </Link>
              )}
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden md:flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                    {user.displayName?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <span className="text-sm text-gray-300 hidden lg:block">{user.displayName}</span>
                </div>
                <button
                  onClick={logout}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Link href="/auth/login" className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">
                  Login
                </Link>
                <Link href="/auth/register" className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors">
                  Get Started
                </Link>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setOpen(!open)}
              className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-white/5 px-4 py-4 space-y-1 fade-in">
          {user ? (
            <>
              {navLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === href ? 'bg-red-500/20 text-red-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
              {user.role === 'ADMIN' && (
                <Link href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-orange-400 hover:bg-white/5 transition-colors">
                  <AlertTriangle className="w-4 h-4" />
                  Admin Panel
                </Link>
              )}
              <button
                onClick={() => { logout(); setOpen(false); }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-white/5 transition-colors w-full text-left"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-gray-300 hover:text-white">Login</Link>
              <Link href="/auth/register" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm bg-red-500 text-white rounded-lg text-center font-medium">Get Started</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
