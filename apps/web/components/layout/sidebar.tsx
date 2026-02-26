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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth';
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

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  activeText: string;
  activeBg: string;
  activeBar: string;
}> = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, activeText: 'text-primary', activeBg: 'bg-primary/10', activeBar: 'bg-primary' },
  { href: '/members', label: 'Members', icon: Users, activeText: 'text-violet-500', activeBg: 'bg-violet-500/10', activeBar: 'bg-violet-500' },
  { href: '/charges', label: 'Charges', icon: Receipt, activeText: 'text-amber-500', activeBg: 'bg-amber-500/10', activeBar: 'bg-amber-500' },
  { href: '/expenses', label: 'Expenses', icon: TrendingDown, activeText: 'text-rose-500', activeBg: 'bg-rose-500/10', activeBar: 'bg-rose-500' },
  { href: '/payments', label: 'Payments', icon: CreditCard, activeText: 'text-emerald-500', activeBg: 'bg-emerald-500/10', activeBar: 'bg-emerald-500' },
  { href: '/inbox', label: 'Inbox', icon: Inbox, activeText: 'text-cyan-500', activeBg: 'bg-cyan-500/10', activeBar: 'bg-cyan-500' },
  { href: '/spreadsheet', label: 'Spreadsheet', icon: Table2, activeText: 'text-indigo-500', activeBg: 'bg-indigo-500/10', activeBar: 'bg-indigo-500' },
  { href: '/audit', label: 'Audit Log', icon: History, activeText: 'text-slate-500', activeBg: 'bg-slate-500/10', activeBar: 'bg-slate-500' },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);
  const logout = useLogout();

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
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-border/50 bg-card/50 backdrop-blur-xl">
      <div className="flex flex-col flex-1 min-h-0">
        {/* Logo */}
        <div className="flex items-center h-16 px-5 border-b border-border/50">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Ledgly"
              width={36}
              height={36}
            />
            <span className="font-bold text-xl tracking-tight">Ledgly</span>
          </Link>
        </div>

        {/* Org Selector */}
        {currentOrg && (
          <div className="px-3 py-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
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
        <nav data-tour="sidebar-nav" className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? item.activeText
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                )}
              >
                {isActive && (
                  <>
                    <div className={`absolute inset-0 ${item.activeBg} rounded-xl transition-all`} />
                    <div className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full ${item.activeBar}`} />
                  </>
                )}
                <item.icon className={cn('h-5 w-5 relative z-10', isActive && item.activeText)} />
                <span className="relative z-10">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium relative z-10">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <Separator className="opacity-50" />

        {/* Footer */}
        <div className="p-3 space-y-1">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <Settings className="h-5 w-5" />
            Settings
          </Link>
          <button
            onClick={() => {
              logout();
              window.location.href = '/login';
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>

        {/* User Info */}
        {user && (
          <div className="p-3 border-t border-border/50">
            <div className="flex items-center gap-3 px-3 py-2">
              <AvatarGradient name={user.name || user.email} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
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
                className="bg-gradient-to-r from-primary to-blue-400"
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
