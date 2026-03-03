'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Building2, ChevronDown, Check, LogOut } from 'lucide-react';
import { useMe, useLogout } from '@/lib/queries/auth';
import { useAuthStore } from '@/lib/stores/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: user, isLoading, error } = useMe();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);
  const logout = useLogout();

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

  // Redirect admins/treasurers to dashboard
  useEffect(() => {
    if (!user || !currentOrgId) return;
    const membership = user.memberships.find((m) => m.orgId === currentOrgId);
    if (membership && (membership.role === 'ADMIN' || membership.role === 'TREASURER')) {
      router.push('/dashboard');
    }
  }, [user, currentOrgId, router]);

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

  if (user.memberships.length === 0) {
    router.push('/onboarding');
    return null;
  }

  const currentMembership = user.memberships.find((m) => m.orgId === currentOrgId);
  if (currentMembership && (currentMembership.role === 'ADMIN' || currentMembership.role === 'TREASURER')) {
    return null;
  }

  const hasMultipleOrgs = user.memberships.length > 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Ledgly"
              width={32}
              height={32}
              className="shrink-0"
            />
            <span className="font-bold text-lg tracking-tight">Ledgly</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Org Switcher (only if multiple orgs) */}
            {hasMultipleOrgs && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium max-w-[140px] truncate">
                      {currentMembership?.orgName}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {user.memberships.map((m) => (
                    <DropdownMenuItem
                      key={m.orgId}
                      onClick={() => setCurrentOrgId(m.orgId)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Building2 className="h-3 w-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.orgName}</p>
                        <p className="text-xs text-muted-foreground">{m.role}</p>
                      </div>
                      {m.orgId === currentOrgId && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* User avatar + logout */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full hover:ring-2 hover:ring-primary/20 transition-all">
                  <AvatarGradient name={user.name || user.email} size="md" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium truncate">{user.name || 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => { logout(); window.location.href = '/login'; }}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl py-8 px-4">
        {children}
      </main>
    </div>
  );
}
