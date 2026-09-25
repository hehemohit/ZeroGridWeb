'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AppSidebar from '@/components/AppSidebar';
import { PageSpinner } from '@/components/ui';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isAdminPage = pathname?.startsWith('/admin');

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [user, loading, router]);

  if (loading) return <PageSpinner />;
  if (!user) return null;

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-canvas text-primaryText transition-colors duration-200 overflow-hidden select-none">
      <AppSidebar />
      <main
        className={`flex-1 min-w-0 h-full ${
          isAdminPage
            ? 'overflow-hidden flex flex-col'
            : 'overflow-y-auto'
        }`}
      >
        {children}
      </main>
    </div>
  );
}

