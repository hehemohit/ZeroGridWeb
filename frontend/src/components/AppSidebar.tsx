'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  User,
  Shield,
  Radio,
  LogOut,
  Menu,
  X,
  Activity,
  AlertTriangle,
  Cpu
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { api } from '@/lib/api';

function SidebarNavContent() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFilter = searchParams.get('filter');
  const currentModal = searchParams.get('modal');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSosCount, setActiveSosCount] = useState<number>(0);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, searchParams]);

  // Fetch active SOS count for admin badge
  useEffect(() => {
    if (user?.role !== 'ADMIN') return;

    let isMounted = true;
    const fetchSosCount = async () => {
      try {
        const data = await api.get<{ events?: any[]; sos?: any[] } | any[]>('/api/admin/sos');
        if (!isMounted) return;
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.events)
          ? data.events
          : Array.isArray(data?.sos)
          ? data.sos
          : [];
        const count = list.filter(
          (e: any) => e.status === 'ACTIVE' || e.status === 'ACKNOWLEDGED'
        ).length;
        setActiveSosCount(count);
      } catch {
        // Silently ignore or retain current count
      }
    };

    fetchSosCount();
    const interval = setInterval(fetchSosCount, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  const navLinks = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard',
    },
    {
      href: '/contacts',
      label: 'Contacts',
      icon: Users,
      active: pathname.startsWith('/contacts'),
    },
    {
      href: '/family',
      label: 'Family Links',
      icon: UserCheck,
      active: pathname.startsWith('/family'),
    },
    {
      href: '/profile',
      label: 'Profile',
      icon: User,
      active: pathname.startsWith('/profile'),
    },
  ];

  const adminLinks = [
    {
      href: '/admin',
      label: 'Admin Console',
      icon: Radio,
      active: pathname === '/admin' && !currentFilter && !currentModal,
    },
    {
      href: '/admin?filter=ACTIVE',
      label: 'SOS Dispatch',
      icon: AlertTriangle,
      active: pathname === '/admin' && currentFilter === 'ACTIVE',
      badge: activeSosCount > 0 ? activeSosCount : undefined,
    },
    {
      href: '/admin?modal=nodes',
      label: 'Nodes & Peering',
      icon: Cpu,
      active: pathname === '/admin' && currentModal === 'nodes',
    },
  ];

  return (
    <aside className="w-full md:w-64 flex-shrink-0 bg-surface border-b md:border-b-0 md:border-r border-hairline flex flex-col z-40 transition-colors duration-200 select-none">
      {/* Header Row */}
      <div className="flex items-center justify-between p-3.5 sm:p-5 md:border-b border-hairline">
        <Link href="/dashboard" className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surfaceElevated border border-hairline flex items-center justify-center shadow-sm">
            <svg
              className="w-5 h-5 text-red-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-lg tracking-tight text-primaryText font-display">
              Zero<span className="text-brandTeal">Grid</span>
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brandTeal/10 text-brandTeal border border-brandTeal/20 uppercase tracking-wider font-mono">
              {user?.role === 'ADMIN' ? 'Admin' : 'Mesh'}
            </span>
          </div>
        </Link>

        {/* Mobile menu toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 border border-hairline rounded-lg bg-surfaceElevated text-secondaryText hover:text-primaryText"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Desktop Telemetry Pill */}
      <div className="hidden md:flex px-4 pt-3 pb-1">
        <div className="w-full flex items-center justify-between px-2.5 py-1.5 bg-surfaceElevated rounded-lg border border-hairline text-[11px] font-medium text-secondaryText">
          <div className="flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-brandTeal animate-pulse"></span>
            <span className="truncate">Telemetry Operational</span>
          </div>
          <Activity className="w-3.5 h-3.5 text-brandTeal shrink-0" />
        </div>
      </div>

      {/* Navigation Links */}
      <div
        className={`${
          mobileMenuOpen ? 'flex' : 'hidden'
        } md:flex flex-col flex-1 overflow-y-auto p-3 gap-1`}
      >
        <div className="hidden md:block px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-mutedGray font-semibold">
          Navigation
        </div>

        {navLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                link.active
                  ? 'bg-surfaceElevated text-primaryText border border-hairline shadow-sm font-semibold'
                  : 'text-secondaryText hover:text-primaryText hover:bg-surfaceElevated/60 border border-transparent'
              }`}
            >
              <Icon
                className={`w-4 h-4 ${link.active ? 'text-brandTeal' : 'text-mutedGray'}`}
              />
              <span className="flex-1">{link.label}</span>
              {link.active && <span className="w-1.5 h-1.5 rounded-full bg-brandTeal" />}
            </Link>
          );
        })}

        {/* Admin Section */}
        {user?.role === 'ADMIN' && (
          <div className="pt-3 mt-2 border-t border-hairline space-y-1">
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-mutedGray font-semibold">
              Tactical Operations
            </div>
            {adminLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    link.active
                      ? 'bg-surfaceElevated text-primaryText border border-hairline shadow-sm font-semibold'
                      : 'text-secondaryText hover:text-primaryText hover:bg-surfaceElevated/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 ${
                        link.active
                          ? 'text-red-500'
                          : link.label === 'SOS Dispatch'
                          ? 'text-red-500'
                          : 'text-mutedGray'
                      }`}
                    />
                    <span>{link.label}</span>
                  </div>
                  {link.badge !== undefined && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-bold">
                      {link.badge}
                    </span>
                  )}
                  {link.active && !link.badge && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brandTeal" />
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {/* Footer Area: Theme Toggle, User Profile, Logout */}
        <div className="mt-auto pt-3 border-t border-hairline space-y-2">
          {/* Theme Switcher (desktop) */}
          <div className="hidden md:flex items-center justify-between px-3 py-2 bg-surfaceElevated rounded-xl border border-hairline">
            <span className="text-xs font-medium text-secondaryText">Interface Theme</span>
            <ThemeToggle />
          </div>

          {/* User Profile Card */}
          <div className="p-3 bg-surfaceElevated border border-hairline rounded-xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brandTeal/10 text-brandTeal font-bold text-xs flex items-center justify-center border border-brandTeal/20 flex-shrink-0 uppercase">
              {user?.displayName ? user.displayName.slice(0, 2) : 'ZG'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-primaryText truncate">
                  {user?.displayName || 'Citizen Node'}
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brandTeal/10 text-brandTeal border border-brandTeal/20 uppercase shrink-0">
                  {user?.role === 'ADMIN' ? 'ADMIN' : 'NODE'}
                </span>
              </div>
              <span className="text-[10px] text-mutedGray font-mono block truncate">
                {user?.email || 'mesh-node-01'}
              </span>
            </div>
          </div>

          {/* Logout Action */}
          <button
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function AppSidebar() {
  return (
    <Suspense>
      <SidebarNavContent />
    </Suspense>
  );
}
