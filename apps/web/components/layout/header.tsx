'use client';

import Image from 'next/image';
import { useAuthStore } from '@/lib/stores/auth';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const user = useAuthStore((s) => s.user);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const currentOrg = user?.memberships.find((m) => m.orgId === currentOrgId);

  return (
    <header className="sticky top-0 z-40 flex items-center h-16 px-4 border-b bg-background md:hidden">
      <div className="flex items-center gap-2 flex-1">
        <Image
          src="/logo.png"
          alt="Ledgly"
          width={32}
          height={32}
          className=""
        />
        <div className="flex flex-col">
          <span className="font-semibold text-sm">{title || 'Ledgly'}</span>
          {currentOrg && (
            <span className="text-xs text-muted-foreground">{currentOrg.orgName}</span>
          )}
        </div>
      </div>
    </header>
  );
}
