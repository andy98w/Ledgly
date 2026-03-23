'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Settings,
  LogIn,
  LogOut,
  Building2,
  ChevronDown,
  Check,
  Plus,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  FileSpreadsheet,
  Receipt,
  CreditCard,
  TrendingDown,
  Sparkles,
  History,
  Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MEMBERSHIP_ROLE_LABELS } from '@ledgly/shared';
import { useAuthStore } from '@/lib/stores/auth';
import { useSidebarStore } from '@/lib/stores/sidebar';
import { useLogout } from '@/lib/queries/auth';
import { useCreateOrganization, useResolveJoinCode, useJoinOrganization } from '@/lib/queries/organizations';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
};

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/spreadsheet', label: 'Ledger', icon: FileSpreadsheet },
  { href: '/members', label: 'Members', icon: Users },
];

const secondaryNavItems: NavItem[] = [
  { href: '/charges', label: 'Charges', icon: Receipt },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/expenses', label: 'Expenses', icon: TrendingDown },
  { href: '/agent', label: 'AI Assistant', icon: Sparkles },
  { href: '/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/audit', label: 'Audit Log', icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);
  const logout = useLogout();
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const toggle = useSidebarStore((s) => s.toggle);

  const { toast } = useToast();
  const createOrganization = useCreateOrganization();
  const joinOrg = useJoinOrganization();
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'join'>('create');
  const [newOrgName, setNewOrgName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [submittedJoinCode, setSubmittedJoinCode] = useState('');
  const { data: resolvedOrg, isLoading: resolving, error: resolveError } = useResolveJoinCode(submittedJoinCode || null);

  const currentOrg = user?.memberships.find((m) => m.orgId === currentOrgId);
  const allOrgs = user?.memberships || [];

  const handleCreateOrg = () => {
    if (!newOrgName.trim()) return;
    createOrganization.mutate(
      { name: newOrgName.trim() },
      {
        onSuccess: (org) => {
          toast({ title: 'Organization created!' });
          setShowCreateOrgDialog(false);
          setNewOrgName('');
          router.push(`/onboarding?orgId=${org.id}&step=1`);
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message || 'Failed to create organization',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleJoinOrg = async () => {
    if (!submittedJoinCode || !resolvedOrg) return;
    try {
      const result = await joinOrg.mutateAsync(submittedJoinCode);
      setCurrentOrgId(result.orgId);
      toast({ title: result.status === 'PENDING' ? 'Join request sent!' : `Joined ${result.orgName}!` });
      setShowCreateOrgDialog(false);
      setJoinCode('');
      setSubmittedJoinCode('');
    } catch (error: any) {
      toast({ title: 'Could not join', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <aside className={cn(
      'hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-border bg-card transition-all duration-300',
      isCollapsed ? 'md:w-[68px]' : 'md:w-64',
    )}>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Logo / Expand toggle */}
        <div className={cn('flex items-center justify-between h-16 border-b border-border', isCollapsed ? 'justify-center px-2' : 'px-5')}>
          {isCollapsed ? (
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggle}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                    aria-label="Expand sidebar"
                  >
                    <PanelLeft className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <>
              <Link href="/dashboard" className="flex items-center gap-3">
                <Image
                  src="/logo.png"
                  alt="Ledgly"
                  width={36}
                  height={36}
                  className="shrink-0"
                />
                <span className="font-bold text-xl tracking-tight">Ledgly</span>
              </Link>
              <button
                onClick={toggle}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {/* Org Selector */}
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => { setDialogMode('create'); setShowCreateOrgDialog(true); }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Organization</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { setDialogMode('join'); setShowCreateOrgDialog(true); }}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Join Organization</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <Separator className="opacity-50" />

        {/* Navigation */}
        <nav data-tour="sidebar-nav" className={cn('flex-1 py-4 space-y-1', isCollapsed ? 'px-2' : 'px-3')}>
          <TooltipProvider delayDuration={0}>
            {[...navItems, ...secondaryNavItems].map((item, i) => {
              const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
              const isSecondary = i >= navItems.length;
              const showDivider = i === navItems.length;
              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour={`nav-${item.href.replace('/', '')}`}
                  className={cn(
                    'relative flex items-center gap-3 px-3 rounded-xl text-sm font-medium transition-all',
                    isSecondary ? 'py-2' : 'py-2.5',
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
                  <item.icon className={cn(isSecondary ? 'h-4 w-4' : 'h-5 w-5', 'relative z-10 shrink-0', isActive && 'text-primary')} />
                  {!isCollapsed && <span className={cn('relative z-10', isSecondary && 'text-xs')}>{item.label}</span>}
                  {!isCollapsed && item.badge && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium relative z-10">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );

              const el = isCollapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : link;

              if (showDivider) {
                return (
                  <div key={item.href}>
                    <div className={cn('my-2 border-t border-border/50', isCollapsed ? 'mx-1' : 'mx-2')} />
                    {el}
                  </div>
                );
              }

              return el;
            })}
          </TooltipProvider>
        </nav>

        <Separator className="opacity-50" />

        {/* Footer */}
        <div className={cn('space-y-1', isCollapsed ? 'p-2' : 'p-3')}>
          <TooltipProvider delayDuration={0}>
            {isCollapsed ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/settings"
                      data-tour="nav-settings"
                      className={cn(
                        'flex w-full items-center justify-center py-2.5 rounded-xl text-sm font-medium transition-colors',
                        pathname.startsWith('/settings') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
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
                  href="/settings"
                  data-tour="nav-settings"
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    pathname.startsWith('/settings') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
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

        {/* User Info */}
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

      <Dialog open={showCreateOrgDialog} onOpenChange={(open) => {
        setShowCreateOrgDialog(open);
        if (!open) { setNewOrgName(''); setJoinCode(''); setSubmittedJoinCode(''); }
      }}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setDialogMode('create')}
                className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', dialogMode === 'create' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}
              >
                Create
              </button>
              <button
                onClick={() => setDialogMode('join')}
                className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', dialogMode === 'join' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}
              >
                Join
              </button>
            </div>
            <DialogTitle>{dialogMode === 'create' ? 'Create Organization' : 'Join Organization'}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'create' ? 'Set up a new organization to manage separately' : 'Enter the join code shared by your admin'}
            </DialogDescription>
          </DialogHeader>

          {dialogMode === 'create' ? (
            <form onSubmit={(e) => { e.preventDefault(); handleCreateOrg(); }}>
              <div className="py-4">
                <div className="space-y-2">
                  <Label htmlFor="new-org-name">Organization Name</Label>
                  <Input
                    id="new-org-name"
                    placeholder="e.g., Alpha Beta Gamma"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    maxLength={100}
                    className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateOrgDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={newOrgName.trim().length < 3 || createOrganization.isPending}>
                  {createOrganization.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="py-4 space-y-4">
              {resolvedOrg && !resolveError ? (
                <div className="space-y-4">
                  <div className="text-center py-2">
                    <p className="font-medium text-lg">{resolvedOrg.orgName}</p>
                    <p className="text-sm text-muted-foreground mt-1">You&apos;ll be added as a member</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setSubmittedJoinCode(''); setJoinCode(''); }}>Back</Button>
                    <Button onClick={handleJoinOrg} disabled={joinOrg.isPending}>
                      {joinOrg.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Joining...</> : `Join ${resolvedOrg.orgName}`}
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = joinCode.trim().toUpperCase();
                  if (trimmed.length === 6) setSubmittedJoinCode(trimmed);
                }}>
                  {resolveError && (
                    <p className="text-sm text-destructive mb-3">Invalid or disabled code. Check with your admin.</p>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="join-code">Join Code</Label>
                    <Input
                      id="join-code"
                      placeholder="ABC123"
                      value={joinCode}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                        setJoinCode(val);
                        if (resolveError && val !== submittedJoinCode) setSubmittedJoinCode('');
                      }}
                      className="h-14 text-center text-2xl font-mono tracking-[0.3em] bg-secondary/50 border-border/50 focus:border-primary"
                      maxLength={6}
                      autoFocus
                    />
                  </div>
                  <DialogFooter className="mt-4">
                    <Button type="button" variant="outline" onClick={() => setShowCreateOrgDialog(false)}>Cancel</Button>
                    <Button type="submit" disabled={joinCode.length !== 6 || resolving}>
                      {resolving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Looking up...</> : 'Look Up'}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
