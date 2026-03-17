'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  Settings,
  LogOut,
  Building2,
  ChevronDown,
  Check,
  PanelLeftClose,
  PanelLeft,
  Megaphone,
} from 'lucide-react';
import { useMe, useLogout } from '@/lib/queries/auth';
import { useAuthStore } from '@/lib/stores/auth';
import { useSidebarStore } from '@/lib/stores/sidebar';
import { MEMBERSHIP_ROLE_LABELS } from '@ledgly/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const navItems = [
  { href: '/portal', label: 'Home', icon: LayoutDashboard },
  { href: '/portal/members', label: 'Members', icon: Users },
  { href: '/portal/ledger', label: 'Ledger', icon: FileSpreadsheet },
  { href: '/portal/announcements', label: 'Announcements', icon: Megaphone },
];

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, error } = useMe();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);
  const logout = useLogout();
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const toggle = useSidebarStore((s) => s.toggle);

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

  useEffect(() => {
    if (!user || !currentOrgId) return;
    const membership = user.memberships.find((m) => m.orgId === currentOrgId);
    if (membership && (membership.role === 'OWNER' || membership.role === 'ADMIN' || membership.role === 'TREASURER')) {
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
  if (currentMembership && (currentMembership.role === 'OWNER' || currentMembership.role === 'ADMIN' || currentMembership.role === 'TREASURER')) {
    return null;
  }

  const currentOrg = currentMembership;
  const allOrgs = user.memberships;

  return (
    <div className="min-h-screen">
      {/* Desktop Sidebar */}
      <aside className={cn(
        'hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card transition-all duration-300',
        isCollapsed ? 'md:w-[68px]' : 'md:w-64',
      )}>
        <div className="flex flex-col flex-1 min-h-0">
          <div className={cn('flex items-center justify-between h-16 border-b border-border', isCollapsed ? 'justify-center px-2' : 'px-5')}>
            {isCollapsed ? (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggle}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                    >
                      <PanelLeft className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <>
                <Link href="/portal" className="flex items-center gap-3">
                  <Image src="/logo.png" alt="Ledgly" width={36} height={36} className="shrink-0" />
                  <span className="font-bold text-xl tracking-tight">Ledgly</span>
                </Link>
                <button
                  onClick={toggle}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  <PanelLeftClose className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {currentOrg && (
            <div className={cn('py-4', isCollapsed ? 'px-2' : 'px-3')}>
              <DropdownMenu>
                {isCollapsed ? (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <DropdownMenuTrigger asChild>
                        <TooltipTrigger asChild>
                          <button className="w-full flex items-center justify-center p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                          </button>
                        </TooltipTrigger>
                      </DropdownMenuTrigger>
                      <TooltipContent side="right">{currentOrg.orgName}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <DropdownMenuTrigger asChild>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-left">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{currentOrg.orgName}</p>
                        <p className="text-xs text-muted-foreground">{MEMBERSHIP_ROLE_LABELS[currentOrg.role as keyof typeof MEMBERSHIP_ROLE_LABELS] || currentOrg.role}</p>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                )}
                <DropdownMenuContent align="start" className="w-56">
                  {allOrgs.map((org) => (
                    <DropdownMenuItem
                      key={org.orgId}
                      onClick={() => setCurrentOrgId(org.orgId)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <div className="p-1.5 rounded-lg bg-primary/10">
                        <Building2 className="h-3 w-3 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{org.orgName}</p>
                        <p className="text-xs text-muted-foreground">{MEMBERSHIP_ROLE_LABELS[org.role as keyof typeof MEMBERSHIP_ROLE_LABELS] || org.role}</p>
                      </div>
                      {org.orgId === currentOrgId && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <Separator className="opacity-50" />

          <nav className={cn('flex-1 py-4 space-y-1', isCollapsed ? 'px-2' : 'px-3')}>
            <TooltipProvider delayDuration={0}>
              {navItems.map((item) => {
                const isActive = item.href === '/portal'
                  ? pathname === '/portal'
                  : pathname.startsWith(item.href);
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                      isCollapsed && 'justify-center px-0',
                      isActive
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                    )}
                  >
                    {isActive && (
                      <>
                        <div className="absolute inset-0 bg-primary/8 rounded-xl transition-all" />
                        <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary" />
                      </>
                    )}
                    <item.icon className={cn('h-5 w-5 relative z-10 shrink-0', isActive && 'text-primary')} />
                    {!isCollapsed && <span className="relative z-10">{item.label}</span>}
                  </Link>
                );

                return isCollapsed ? (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : link;
              })}
            </TooltipProvider>
          </nav>

          <Separator className="opacity-50" />

          <div className={cn('space-y-1', isCollapsed ? 'p-2' : 'p-3')}>
            <TooltipProvider delayDuration={0}>
              {isCollapsed ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href="/portal/settings"
                        className={cn(
                          'flex w-full items-center justify-center py-2.5 rounded-xl text-sm font-medium transition-colors',
                          pathname.startsWith('/portal/settings') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                        )}
                      >
                        <Settings className="h-5 w-5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">Settings</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => { logout(); window.location.href = '/login'; }}
                        className="flex w-full items-center justify-center py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                      >
                        <LogOut className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Sign out</TooltipContent>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Link
                    href="/portal/settings"
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                      pathname.startsWith('/portal/settings') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                    )}
                  >
                    <Settings className="h-5 w-5" />
                    Settings
                  </Link>
                  <button
                    onClick={() => { logout(); window.location.href = '/login'; }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                    Sign out
                  </button>
                </>
              )}
            </TooltipProvider>
          </div>

          {user && (
            <div className={cn('border-t border-border', isCollapsed ? 'p-2' : 'p-3')}>
              {isCollapsed ? (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center py-2">
                        <AvatarGradient name={user.name || user.email} size="md" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="font-medium">{user.name || 'User'}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2">
                  <AvatarGradient name={user.name || user.email} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.name || 'User'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t safe-bottom">
        <div className="flex items-center justify-around h-16">
          {[...navItems, { href: '/portal/settings', label: 'Settings', icon: Settings }].map((item) => {
            const isActive = item.href === '/portal'
              ? pathname === '/portal'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex flex-col items-center justify-center flex-1 h-full touch-target transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <item.icon className={cn('h-5 w-5 transition-transform duration-150', isActive && 'scale-110')} />
                <span className="text-xs mt-1">{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <main className={`pb-20 md:pb-0 transition-all duration-300 ${isCollapsed ? 'md:pl-[68px]' : 'md:pl-64'}`}>
        <div className="container max-w-4xl py-8 px-4 md:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
