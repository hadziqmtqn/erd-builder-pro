import { useEffect, useState } from 'react';
import { User, Lock, Save, Loader2, Info, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

type AuthConfig = {
  supabaseAuth: boolean;
  isDesktop: boolean;
  isLocalPostgres: boolean;
  supportsPasswordUpdate: boolean;
};

export function AccountTab() {
  const { user, isGuest, setUser } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiFetch('/api/auth-config');
        if (!res.ok) throw new Error('Failed to load auth config');
        const data: AuthConfig = await res.json();
        if (mounted) setConfig(data);
      } catch (err: any) {
        toast.error('Failed to load account settings: ' + err.message);
      } finally {
        if (mounted) setIsLoadingConfig(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.user_metadata?.name || user.user_metadata?.full_name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  if (isGuest) {
    return (
      <div className="p-12 flex flex-col items-center justify-center h-full text-center space-y-4">
        <div className="p-4 bg-muted/20 rounded-full">
          <User className="size-8 text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">Guest Mode</h3>
          <p className="text-sm text-muted-foreground max-w-[280px]">
            Sign in to manage your account information.
          </p>
        </div>
      </div>
    );
  }

  if (isLoadingConfig) {
    return (
      <div className="p-12 flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || !config) {
    return null;
  }

  const isReadOnly = config.supabaseAuth;

  const hasChanges =
    name !== (user.user_metadata?.name || user.user_metadata?.full_name || '') ||
    email !== (user.email || '') ||
    newPassword.length > 0;

  const handleSave = async () => {
    if (isReadOnly) return;
    if (!hasChanges) {
      toast.info('No changes to save');
      return;
    }
    const wantsEmailChange = email !== (user.email || '');
    const wantsPasswordChange = newPassword.length > 0;
    if ((wantsEmailChange || wantsPasswordChange) && !currentPassword) {
      toast.error('Current password is required to change email or password');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, string> = {};
      const newName = name.trim();
      const oldName = (user.user_metadata?.name || user.user_metadata?.full_name || '').trim();
      if (newName && newName !== oldName) payload.name = newName;
      if (wantsEmailChange) payload.email = email.trim();
      if (currentPassword) payload.currentPassword = currentPassword;
      if (wantsPasswordChange) payload.newPassword = newPassword;

      const res = await apiFetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update account');
      }

      const data = await res.json();
      // Sync auth state immediately with the response so the sidebar/nav
      // reflect the new name/email without a reload (avoids an extra /me round-trip)
      if (data.user) {
        setUser(data.user);
      }

      setCurrentPassword('');
      setNewPassword('');
      toast.success('Account updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update account');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-100">Account</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Update your profile information. {isReadOnly
            ? 'Your account is managed by your authentication provider.'
            : 'Changes are saved to your local profile.'}
        </p>
      </div>

      {isReadOnly && (
        <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-md flex items-start gap-2">
          <Info className="size-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-200/80">
            Signed in via Supabase Auth. To change your name, email, or password, visit your Supabase dashboard or contact your administrator.
          </p>
        </div>
      )}

      {!isReadOnly && config.isDesktop && (
        <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-start gap-2">
          <Info className="size-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-200/80">
            Desktop mode: name and email can be updated here. Password is fixed at install time and cannot be changed.
          </p>
        </div>
      )}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="account-name">
            <User className="size-3.5 inline mr-1.5" />
            Name
          </FieldLabel>
          <Input
            id="account-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isReadOnly || isSaving}
            placeholder="Your name"
            maxLength={255}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="account-email">Email</FieldLabel>
          <Input
            id="account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isReadOnly || isSaving}
            placeholder="you@example.com"
            maxLength={255}
          />
          <FieldDescription>
            {isReadOnly
              ? 'Managed by your auth provider'
              : 'Changing your email requires your current password'}
          </FieldDescription>
        </Field>

        {!isReadOnly && (
          <>
            <div className="border-t border-border/40 pt-6 mt-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <Lock className="size-3.5" />
                    Change Password
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {config.supportsPasswordUpdate
                      ? 'Enter your current password and a new password to update.'
                      : 'Password changes are not available in this mode.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPasswords((v) => !v)}
                  disabled={!config.supportsPasswordUpdate}
                  className="text-xs"
                >
                  {showPasswords ? <EyeOff className="size-3.5 mr-1" /> : <Eye className="size-3.5 mr-1" />}
                  {showPasswords ? 'Hide' : 'Show'}
                </Button>
              </div>

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="account-current-password">
                    <ShieldCheck className="size-3.5 inline mr-1.5" />
                    Current Password
                  </FieldLabel>
                  <Input
                    id="account-current-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={!config.supportsPasswordUpdate || isSaving}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="account-new-password">New Password</FieldLabel>
                  <Input
                    id="account-new-password"
                    type={showPasswords ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={!config.supportsPasswordUpdate || isSaving}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    minLength={6}
                    maxLength={128}
                  />
                  {!config.supportsPasswordUpdate && (
                    <FieldDescription>
                      Password update is disabled in this build.
                    </FieldDescription>
                  )}
                </Field>
              </FieldGroup>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={isSaving || isReadOnly || !hasChanges}
                className="min-w-[140px]"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="size-3.5 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="size-3.5 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              {hasChanges && !isSaving && (
                <span className="text-xs text-muted-foreground">You have unsaved changes</span>
              )}
            </div>
          </>
        )}
      </FieldGroup>
    </div>
  );
}
