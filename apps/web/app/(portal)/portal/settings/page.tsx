'use client';

import { useState } from 'react';
import { Sun, Moon, Monitor, Loader2, Eye, EyeOff } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/lib/stores/auth';
import { useUpdateProfile, useChangePassword } from '@/lib/queries/auth';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardHeader, MotionCardTitle, MotionCardContent } from '@/components/ui/motion-card';
import { cn } from '@/lib/utils';

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function PortalSettingsPage() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [name, setName] = useState(user?.name || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const hasNameChanges = name !== (user?.name || '');

  const handleSaveName = () => {
    if (!name.trim()) return;
    updateProfile.mutate(
      { name: name.trim() },
      {
        onSuccess: () => toast({ title: 'Profile updated' }),
        onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      },
    );
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPw || newPw.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    changePassword.mutate(
      { currentPassword: currentPw || undefined, newPassword: newPw },
      {
        onSuccess: () => {
          toast({ title: 'Password updated' });
          setCurrentPw('');
          setNewPw('');
        },
        onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <MotionCard>
        <MotionCardHeader>
          <MotionCardTitle>Profile</MotionCardTitle>
        </MotionCardHeader>
        <MotionCardContent>
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <AvatarGradient name={user?.name || user?.email || ''} size="lg" />
              <div className="min-w-0">
                <p className="font-medium truncate">{user?.name || 'User'}</p>
                <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display-name">Display name</Label>
              <div className="flex gap-2">
                <Input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 bg-secondary/50 border-border/50"
                  maxLength={100}
                />
                <Button
                  onClick={handleSaveName}
                  disabled={!hasNameChanges || updateProfile.isPending}
                  size="default"
                >
                  {updateProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="h-10 bg-secondary/30 border-border/50" />
            </div>
          </div>
        </MotionCardContent>
      </MotionCard>

      <MotionCard>
        <MotionCardHeader>
          <MotionCardTitle>Change Password</MotionCardTitle>
        </MotionCardHeader>
        <MotionCardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {user?.hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="current-pw">Current password</Label>
                <div className="relative">
                  <Input
                    id="current-pw"
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className="h-10 bg-secondary/50 border-border/50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-pw">New password</Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="h-10 bg-secondary/50 border-border/50 pr-10"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={!newPw || changePassword.isPending}>
              {changePassword.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating...</> : 'Update password'}
            </Button>
          </form>
        </MotionCardContent>
      </MotionCard>

      <MotionCard>
        <MotionCardHeader>
          <MotionCardTitle>Appearance</MotionCardTitle>
        </MotionCardHeader>
        <MotionCardContent>
          <div className="space-y-3">
            <Label>Theme</Label>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((option) => {
                const isActive = theme === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98]',
                      isActive
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 hover:border-border hover:bg-secondary/50',
                    )}
                  >
                    <div className={cn(
                      'p-3 rounded-xl',
                      isActive ? 'bg-primary/20' : 'bg-secondary',
                    )}>
                      <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                    </div>
                    <span className={cn('text-sm font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </MotionCardContent>
      </MotionCard>
    </div>
  );
}
