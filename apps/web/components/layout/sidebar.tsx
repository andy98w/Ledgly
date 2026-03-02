'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Receipt,
  CreditCard,
  Inbox,
  Settings,
  LogOut,
  Building2,
  ChevronDown,
  Check,
  TrendingDown,
  Table2,
  History,
  Plus,
  Loader2,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth';
import { useSidebarStore } from '@/lib/stores/sidebar';
import { useLogout } from '@/lib/queries/auth';
import { useCreateOrganization } from '@/lib/queries/organizations';
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

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
}> = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/charges', label: 'Charges', icon: Receipt },
  { href: '/expenses', label: 'Expenses', icon: TrendingDown },
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/spreadsheet', label: 'Spreadsheet', icon: Table2 },
  { href: '/audit', label: 'Audit Log', icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);
  const logout = useLogout();
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const toggle = useSidebarStore((s) => s.toggle);

  const { toast } = useToast();
  const createOrganization = useCreateOrganization();
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');

  const currentOrg = user?.memberships.find((m) => m.orgId === currentOrgId);
  const allOrgs = user?.memberships || [];

  const handleCreateOrg = () => {
    if (!newOrgName.trim()) return;
    createOrganization.mutate(
      { name: newOrgName.trim() },
      {
        onSuccess: () => {
          toast({ title: 'Organization created!' });
          setShowCreateOrgDialog(false);
          setNewOrgName('');
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

  return (
    <aside className={cn(
      'hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-border/50 bg-card/50 backdrop-blur-xl transition-all duration-300',
      isCollapsed ? 'md:w-[68px]' : 'md:w-64',
    )}>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Logo / Expand toggle */}
        <div className={cn('flex items-center justify-between h-16 border-b border-border/50', isCollapsed ? 'justify-center px-2' : 'px-5')}>
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
              <DropdownMenuTrigger asChild>
                {isCollapsed ? (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="w-full flex items-center justify-center p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{currentOrg.orgName}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors text-left">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{currentOrg.orgName}</p>
                      <p className="text-xs text-muted-foreground">{currentOrg.role}</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </DropdownMenuTrigger>
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
                      <p className="text-xs text-muted-foreground">{org.role}</p>
                    </div>
                    {org.orgId === currentOrgId && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowCreateOrgDialog(true)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Organization</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <Separator className="opacity-50" />

        {/* Navigation */}
        <nav data-tour="sidebar-nav" className={cn('flex-1 py-4 space-y-1', isCollapsed ? 'px-2' : 'px-3')}>
          <TooltipProvider delayDuration={0}>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
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
                  {!isCollapsed && item.badge && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium relative z-10">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );

              if (isCollapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return link;
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
                      className="flex items-center justify-center py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
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
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
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
          <div className={cn('border-t border-border/50', isCollapsed ? 'p-2' : 'p-3')}>
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

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrgDialog} onOpenChange={setShowCreateOrgDialog}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl">
          <form onSubmit={(e) => { e.preventDefault(); handleCreateOrg(); }}>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>
                Set up a new organization to manage separately
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-2">
                <Label htmlFor="new-org-name">Organization Name</Label>
                <Input
                  id="new-org-name"
                  placeholder="e.g., Alpha Beta Gamma"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateOrgDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newOrgName.trim() || createOrganization.isPending}
              >
                {createOrganization.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
