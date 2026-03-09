'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Receipt, CreditCard, MoreHorizontal, TrendingDown, Inbox, Table2, History, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const primaryItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/agent', label: 'AI', icon: Sparkles },
  { href: '/members', label: 'Members', icon: Users },
  { href: '/charges', label: 'Charges', icon: Receipt },
];

const moreItems = [
  { href: '/payments', label: 'Payments', icon: CreditCard },
  { href: '/expenses', label: 'Expenses', icon: TrendingDown },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/spreadsheet', label: 'Spreadsheet', icon: Table2 },
  { href: '/audit', label: 'Activity', icon: History },
];

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t safe-bottom">
      <div className="flex items-center justify-around h-16">
        {primaryItems.map((item) => {
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

        {/* More dropdown */}
        <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'relative flex flex-col items-center justify-center flex-1 h-full touch-target transition-colors',
                isMoreActive ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-label="More navigation options"
            >
              <MoreHorizontal className={cn('h-5 w-5 transition-transform duration-150', isMoreActive && 'scale-110')} />
              <span className="text-xs mt-1">More</span>
              {isMoreActive && (
                <span className="absolute bottom-1.5 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48 mb-2">
            {moreItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 cursor-pointer',
                      isActive && 'text-primary',
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
