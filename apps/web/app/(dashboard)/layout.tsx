'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIsMutating } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { Header } from '@/components/layout/header';
import { TourOverlay } from '@/components/tour/tour-overlay';
import { CommandPalette } from '@/components/command-palette';
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog';
import { useMe } from '@/lib/queries/auth';
import { useAuthStore } from '@/lib/stores/auth';
import { useTutorialStore } from '@/lib/stores/tutorial';
import { useSidebarStore } from '@/lib/stores/sidebar';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: user, isLoading, error } = useMe();
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const hasSeenTutorial = useTutorialStore((s) => s.hasSeenTutorial);
  const startTutorial = useTutorialStore((s) => s.start);
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const isMutating = useIsMutating();
  const { showHelp, setShowHelp } = useKeyboardShortcuts();

  useEffect(() => {
    if (error) {
      router.push('/login');
    }
  }, [error, router]);

  useEffect(() => {
    if (user && !currentOrgId && user.memberships.length > 0) {
      setCurrentOrgId(user.memberships[0].orgId);
    }
  }, [user, currentOrgId, setCurrentOrgId]);

  // Auto-launch tutorial on first login
  useEffect(() => {
    if (user && !hasSeenTutorial) {
      startTutorial();
    }
  }, [user, hasSeenTutorial, startTutorial]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !user) {
    return null;
  }

  // If user has no organizations, show onboarding
  if (user.memberships.length === 0) {
    router.push('/onboarding');
    return null;
  }

  return (
    <div className="min-h-screen">
      {isMutating > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 h-0.5">
          <div className="h-full bg-primary animate-loading-bar" />
        </div>
      )}
      <Sidebar />
      <Header />
      <main className={`pb-20 md:pb-0 transition-all duration-300 ${isCollapsed ? 'md:pl-[68px]' : 'md:pl-64'}`}>
        <div className="container max-w-6xl py-8 px-4 md:px-8">{children}</div>
      </main>
      <MobileNav />
      <TourOverlay />
      <CommandPalette />
      <KeyboardShortcutsDialog open={showHelp} onOpenChange={setShowHelp} />
    </div>
  );
}
