'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/Navbar';
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
    <div className={`min-h-screen ${isAdminPage ? 'bg-canvas' : 'bg-gray-950'}`}>
      {!isAdminPage && <Navbar />}
      <main className={isAdminPage ? 'h-screen' : 'pt-16'}>{children}</main>
    </div>
  );
}

