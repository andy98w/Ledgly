'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, FileSpreadsheet, Settings, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAISidebarStore } from '@/lib/stores/ai-sidebar';
import { useAuthStore } from '@/lib/stores/auth';
import { useDashboard } from '@/lib/queries/organizations';
import { useAISuggestions } from '@/hooks/use-ai-suggestions';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/spreadsheet', label: 'Ledger', icon: FileSpreadsheet },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const openAI = useAISidebarStore((s) => s.open);
  const isAIOpen = useAISidebarStore((s) => s.isOpen);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data: dashboardStats } = useDashboard(currentOrgId);
  const suggestions = useAISuggestions(dashboardStats);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t safe-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
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

        <button
          onClick={() => openAI()}
          className={cn(
            'relative flex flex-col items-center justify-center flex-1 h-full touch-target transition-colors',
            isAIOpen ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <span className="relative">
            <Sparkles className={cn('h-5 w-5 transition-transform duration-150', isAIOpen && 'scale-110')} />
            {suggestions.length > 0 && !isAIOpen && (
              <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold">
                {suggestions.length}
              </span>
            )}
          </span>
          <span className="text-xs mt-1">AI</span>
          {isAIOpen && (
            <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-primary" />
          )}
        </button>
      </div>
    </nav>
  );
}
