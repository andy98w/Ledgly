'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PaymentLinksProps {
  handles: Record<string, string>;
  enabledSources: string[];
  amountCents: number;
  note: string;
}

const SOURCES: Record<string, {
  label: string;
  color: string;
  bg: string;
  getLink: (handle: string, amount: number, note: string) => string | null;
}> = {
  venmo: {
    label: 'Venmo',
    color: 'text-[#008CFF]',
    bg: 'bg-[#008CFF]/10 hover:bg-[#008CFF]/20',
    getLink: (handle, amount, note) =>
      `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(handle)}&amount=${amount}&note=${encodeURIComponent(note)}`,
  },
  cashapp: {
    label: 'Cash App',
    color: 'text-[#00D632]',
    bg: 'bg-[#00D632]/10 hover:bg-[#00D632]/20',
    getLink: (handle, amount) =>
      `https://cash.app/${handle.startsWith('$') ? handle : `$${handle}`}/${amount}`,
  },
  paypal: {
    label: 'PayPal',
    color: 'text-[#003087]',
    bg: 'bg-[#003087]/10 hover:bg-[#003087]/20',
    getLink: (handle, amount) =>
      `https://paypal.me/${handle}/${amount}`,
  },
  zelle: {
    label: 'Zelle',
    color: 'text-[#6D1ED4]',
    bg: 'bg-[#6D1ED4]/10 hover:bg-[#6D1ED4]/20',
    getLink: () => null,
  },
};

export function PaymentLinks({ handles, enabledSources, amountCents, note }: PaymentLinksProps) {
  const [copiedSource, setCopiedSource] = useState<string | null>(null);

  const amount = (amountCents / 100).toFixed(2);
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const activeSources = enabledSources.filter((s) => handles[s]?.trim());

  if (activeSources.length === 0) return null;

  const handleClick = (source: string) => {
    const config = SOURCES[source];
    if (!config) return;

    const handle = handles[source];
    const link = config.getLink(handle, parseFloat(amount), note);

    if (link && isMobile) {
      window.location.href = link;
      return;
    }

    if (link && !isMobile) {
      window.open(link, '_blank');
    }

    navigator.clipboard.writeText(handle);
    setCopiedSource(source);
    setTimeout(() => setCopiedSource(null), 2000);
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {activeSources.map((source) => {
        const config = SOURCES[source];
        if (!config) return null;
        const isCopied = copiedSource === source;
        const hasLink = config.getLink(handles[source], parseFloat(amount), note) !== null;

        return (
          <Button
            key={source}
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-3 rounded-lg text-xs font-medium transition-all',
              config.bg,
              config.color,
            )}
            onClick={() => handleClick(source)}
          >
            {isCopied ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Copied!
              </>
            ) : (
              <>
                {hasLink ? (
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                )}
                {config.label} ${amount}
              </>
            )}
          </Button>
        );
      })}
    </div>
  );
}
