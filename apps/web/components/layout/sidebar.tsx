'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth';
import { useLogout } from '@/lib/queries/auth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const navItems: Array<{ href: string; label: string; icon: typeof LayoutDashboard; badge?: string }> = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
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

  const currentOrg = user?.memberships.find((m) => m.orgId === currentOrgId);
  const allOrgs = user?.memberships || [];

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-border/50 bg-card/50 backdrop-blur-xl">
      <div className="flex flex-col flex-1 min-h-0">
        {/* Logo */}
        <div className="flex items-center h-16 px-5 border-b border-border/50">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Ledgly"
              width={36}
              height={36}
              className="rounded-xl shadow-lg"
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
                {allOrgs.length > 1 && <DropdownMenuSeparator />}
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
                    <Settings className="h-4 w-4" />
                    <span>Create Organization</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <Separator className="opacity-50" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 bg-primary/10 rounded-xl"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <item.icon className={cn('h-5 w-5 relative z-10', isActive && 'text-primary')} />
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
    </aside>
  );
}
