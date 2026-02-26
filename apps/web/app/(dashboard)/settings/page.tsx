'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, User, Building2, Shield, Loader2, Camera, Plus, Trash2, AlertTriangle, Mail, Settings, GraduationCap, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth';
import { useTutorialStore } from '@/lib/stores/tutorial';
import { useUpdateProfile, useChangePassword } from '@/lib/queries/auth';
import { useCreateOrganization, useDeleteOrganization, useOrganization, useUpdateOrganization } from '@/lib/queries/organizations';
import { uploadAvatar } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { FadeIn } from '@/components/ui/page-transition';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const startTutorial = useTutorialStore((s) => s.start);
  const currentOrg = user?.memberships.find((m) => m.orgId === currentOrgId);
  const updateProfile = useUpdateProfile();
  const createOrganization = useCreateOrganization();
  const deleteOrganization = useDeleteOrganization();
  const { data: orgDetails } = useOrganization(currentOrgId ?? null);
  const updateOrganization = useUpdateOrganization(currentOrgId ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const changePassword = useChangePassword();

  const [name, setName] = useState(user?.name || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [showDeleteOrgDialog, setShowDeleteOrgDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const hasChanges = name !== (user?.name || '');

  const handleCreateOrg = () => {
    if (!newOrgName.trim()) {
      toast({ title: 'Please enter an organization name', variant: 'destructive' });
      return;
    }
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

  const handleDeleteOrg = () => {
    if (!currentOrgId || deleteConfirmText !== currentOrg?.orgName) {
      toast({ title: 'Please type the organization name to confirm', variant: 'destructive' });
      return;
    }
    deleteOrganization.mutate(currentOrgId, {
      onSuccess: () => {
        toast({ title: 'Organization deleted' });
        setShowDeleteOrgDialog(false);
        setDeleteConfirmText('');
        router.push('/');
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to delete organization',
          variant: 'destructive',
        });
      },
    });
  };

  const handleChangePassword = () => {
    if (newPw !== confirmPw) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    changePassword.mutate(
      { currentPassword: user?.hasPassword ? currentPw : undefined, newPassword: newPw },
      {
        onSuccess: () => {
          toast({ title: user?.hasPassword ? 'Password updated' : 'Password set' });
          setShowPasswordDialog(false);
          setCurrentPw('');
          setNewPw('');
          setConfirmPw('');
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message || 'Failed to update password',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleSave = () => {
    updateProfile.mutate(
      { name },
      {
        onSuccess: () => {
          toast({ title: 'Profile updated!' });
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message || 'Failed to update profile',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image under 5MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const avatarUrl = await uploadAvatar(file, user.id);

      updateProfile.mutate(
        { avatarUrl },
        {
          onSuccess: () => {
            toast({ title: 'Profile picture updated!' });
          },
          onError: (error: any) => {
            toast({
              title: 'Error',
              description: error.message || 'Failed to update profile picture',
              variant: 'destructive',
            });
          },
        },
      );
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload image',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Settings"
          helpText="Manage your account, appearance, notifications, and organization preferences."
          icon={<Settings className="h-6 w-6 text-primary-foreground" />}
        />
      </FadeIn>

      {/* Profile Section */}
      <FadeIn delay={0.1}>
        <MotionCard hover={false}>
          <MotionCardHeader>
            <MotionCardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              Profile
            </MotionCardTitle>
          </MotionCardHeader>
          <MotionCardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative group">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name || 'Profile'}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <AvatarGradient name={user?.name || user?.email || 'User'} size="lg" />
                )}
                <button
                  onClick={handleAvatarClick}
                  disabled={isUploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>
              <div>
                <p className="font-medium">{user?.name || 'No name set'}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click avatar to change photo
                </p>
              </div>
            </div>

            <Separator className="opacity-50" />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Display Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-11 bg-secondary/30 border-border/50 focus:border-primary"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Email Address</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={user?.email || ''}
                    disabled
                    className="h-11 bg-secondary/30 border-border/50 opacity-60"
                  />
                  <Button variant="outline" size="sm" disabled>
                    Change
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Email changes coming soon. Contact support if needed.
                </p>
              </div>

              <Button
                className="bg-gradient-to-r from-primary to-blue-400 hover:opacity-90"
                disabled={!hasChanges || updateProfile.isPending}
                onClick={handleSave}
              >
                {updateProfile.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </MotionCardContent>
        </MotionCard>
      </FadeIn>

      {/* Security Section */}
      <FadeIn delay={0.15}>
        <MotionCard hover={false}>
          <MotionCardHeader>
            <MotionCardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <KeyRound className="h-4 w-4 text-primary" />
              </div>
              Security
            </MotionCardTitle>
          </MotionCardHeader>
          <MotionCardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">
                  {user?.hasPassword
                    ? 'Change your account password'
                    : 'Set a password so you can sign in without a magic link'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)}>
                {user?.hasPassword ? 'Change password' : 'Set password'}
              </Button>
            </div>
          </MotionCardContent>
        </MotionCard>
      </FadeIn>

      {/* Appearance Section */}
      <FadeIn delay={0.2}>
        <MotionCard hover={false}>
          <MotionCardHeader>
            <MotionCardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sun className="h-4 w-4 text-primary" />
              </div>
              Appearance
            </MotionCardTitle>
          </MotionCardHeader>
          <MotionCardContent>
            <div className="space-y-4">
              <Label className="text-sm font-medium">Theme</Label>
              <div className="grid grid-cols-3 gap-3">
                {themeOptions.map((option) => {
                  const isActive = theme === option.value;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] transition-transform',
                        isActive
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 hover:border-border hover:bg-secondary/50'
                      )}
                    >
                      <div className={cn(
                        'p-3 rounded-xl',
                        isActive ? 'bg-primary/20' : 'bg-secondary'
                      )}>
                        <Icon className={cn(
                          'h-5 w-5',
                          isActive ? 'text-primary' : 'text-muted-foreground'
                        )} />
                      </div>
                      <span className={cn(
                        'text-sm font-medium',
                        isActive ? 'text-primary' : 'text-muted-foreground'
                      )}>
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </MotionCardContent>
        </MotionCard>
      </FadeIn>

      {/* Organization Section */}
      <FadeIn delay={0.3}>
        <MotionCard hover={false}>
          <MotionCardHeader>
            <MotionCardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              Organization
            </MotionCardTitle>
          </MotionCardHeader>
          <MotionCardContent>
            <div className="space-y-4">
              {currentOrg && (
                <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{currentOrg.orgName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {currentOrg.role === 'ADMIN' ? (
                          <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {currentOrg.role}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <Separator className="opacity-50" />

              <div className="pt-2">
                <p className="text-sm text-muted-foreground mb-3">
                  Create a new organization to manage a different group.
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateOrgDialog(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Organization
                  </Button>
                  <Button
                    variant="outline"
                    onClick={startTutorial}
                    data-tour="launch-tutorial"
                  >
                    <GraduationCap className="w-4 h-4 mr-2" />
                    Launch Tutorial
                  </Button>
                </div>
              </div>
            </div>
          </MotionCardContent>
        </MotionCard>
      </FadeIn>

      {/* Gmail Sync Section — admin only */}
      {currentOrg?.role === 'ADMIN' && (
        <FadeIn delay={0.45}>
          <MotionCard hover={false}>
            <MotionCardHeader>
              <MotionCardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                Gmail Sync
              </MotionCardTitle>
            </MotionCardHeader>
            <MotionCardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Auto-approve payments</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically confirm incoming payments with high-confidence member matches
                    </p>
                  </div>
                  <Switch
                    checked={orgDetails?.autoApprovePayments ?? true}
                    onCheckedChange={(checked) =>
                      updateOrganization.mutate({ autoApprovePayments: checked })
                    }
                  />
                </div>
                <Separator className="opacity-50" />
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Auto-approve expenses</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically create expenses from outgoing payment emails
                    </p>
                  </div>
                  <Switch
                    checked={orgDetails?.autoApproveExpenses ?? true}
                    onCheckedChange={(checked) =>
                      updateOrganization.mutate({ autoApproveExpenses: checked })
                    }
                  />
                </div>
              </div>
            </MotionCardContent>
          </MotionCard>
        </FadeIn>
      )}

      {/* Danger Zone */}
      <FadeIn delay={0.5}>
        <MotionCard hover={false} className="border-destructive/30">
          <MotionCardHeader>
            <MotionCardTitle className="flex items-center gap-2 text-destructive">
              <div className="p-2 rounded-lg bg-destructive/10">
                <Shield className="h-4 w-4 text-destructive" />
              </div>
              Danger Zone
            </MotionCardTitle>
          </MotionCardHeader>
          <MotionCardContent>
            <div className="space-y-4">
              {currentOrg?.role === 'ADMIN' && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Delete Organization</p>
                      <p className="text-xs text-muted-foreground">
                        Permanently delete {currentOrg.orgName} and all its data
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteOrgDialog(true)}
                    >
                      Delete
                    </Button>
                  </div>
                  <Separator className="opacity-50" />
                </>
              )}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Delete Account</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete your account and all associated data
                  </p>
                </div>
                <Button variant="destructive" size="sm" disabled>
                  Delete
                </Button>
              </div>
            </div>
          </MotionCardContent>
        </MotionCard>
      </FadeIn>

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrgDialog} onOpenChange={setShowCreateOrgDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to manage a different group, team, or chapter.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g., Alpha Beta Gamma"
                className="bg-secondary/30 border-border/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateOrgDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrg}
              disabled={createOrganization.isPending}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {createOrganization.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Organization'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        setShowPasswordDialog(open);
        if (!open) { setCurrentPw(''); setNewPw(''); setConfirmPw(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{user?.hasPassword ? 'Change Password' : 'Set Password'}</DialogTitle>
            <DialogDescription>
              {user?.hasPassword
                ? 'Enter your current password and choose a new one.'
                : 'Set a password so you can sign in with email and password.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {user?.hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="currentPw">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPw"
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    className="bg-secondary/30 border-border/50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPw">New Password</Label>
              <div className="relative">
                <Input
                  id="newPw"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 8 characters"
                  className="bg-secondary/30 border-border/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Must contain uppercase, lowercase, and a number
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPw">Confirm New Password</Label>
              <Input
                id="confirmPw"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Repeat new password"
                className="bg-secondary/30 border-border/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changePassword.isPending || !newPw || !confirmPw || (user?.hasPassword && !currentPw)}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {changePassword.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                user?.hasPassword ? 'Change Password' : 'Set Password'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog open={showDeleteOrgDialog} onOpenChange={setShowDeleteOrgDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Organization
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the organization
              and all associated data including members, charges, payments, and expenses.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30">
              <p className="text-sm text-destructive font-medium">
                Warning: You are about to delete &quot;{currentOrg?.orgName}&quot;
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                All members, charges, payments, expenses, and audit logs will be permanently deleted.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deleteConfirm">
                Type <span className="font-semibold">{currentOrg?.orgName}</span> to confirm
              </Label>
              <Input
                id="deleteConfirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Organization name"
                className="bg-secondary/30 border-border/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteOrgDialog(false);
              setDeleteConfirmText('');
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteOrg}
              disabled={deleteOrganization.isPending || deleteConfirmText !== currentOrg?.orgName}
            >
              {deleteOrganization.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Organization'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
