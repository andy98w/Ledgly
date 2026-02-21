'use client';

import { cn } from '@/lib/utils';

interface AvatarGradientProps {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

const gradients = [
  'avatar-gradient-1',
  'avatar-gradient-2',
  'avatar-gradient-3',
  'avatar-gradient-4',
  'avatar-gradient-5',
  'avatar-gradient-6',
];

function getGradientForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AvatarGradient({ name, size = 'md', className }: AvatarGradientProps) {
  const gradient = getGradientForName(name);
  const initials = getInitials(name);

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold text-white shadow-lg',
        sizeClasses[size],
        gradient,
        className,
      )}
    >
      {initials}
    </div>
  );
}
