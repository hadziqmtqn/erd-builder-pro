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
  installMode: 'desktop' | 'cli' | 'docker' | 'vercel' | 'web';
};

function getStoredName(user: any): string {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.name || '';
}

export function AccountTab() {
  const { user, isGuest, setUser } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // Dual detection: server primary + client fallback for tauri dev edge cases
  const isTauriClient = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

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
      setName(getStoredName(user));
      setEmail(user.email || '');
    }
  }, [user]);

  if (isGuest) {
    return <GuestModeView />;
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
  // config.isDesktop may be false in tauri dev (frontend runs in regular browser
  // without Tauri IPC). Dual detection: server config + client-side Tauri flags.
  const isDesktop = config.isDesktop || isTauriClient;
  const supportsPasswordUpdate = !config.supabaseAuth && !isDesktop;

  // Web local auth mode (non-desktop): allow name, email changes freely.
  // Current password only required when changing password.
  const wantsEmailChange = email !== (user.email || '');
  const wantsPasswordChange = newPassword.length > 0;
  const storedName = getStoredName(user);

  const hasChanges = isDesktop
    ? name !== storedName ||
      email !== (user.email || '')
    : name !== storedName ||
      email !== (user.email || '') ||
      newPassword.length > 0;

  const handleSave = async () => {
    if (isReadOnly) return;
    if (!hasChanges) {
      toast.info('No changes to save');
      return;
    }
    
    // Desktop app (Tauri): allow name and email changes
    if (isDesktop) {
      const newName = name.trim();
      const oldName = storedName.trim();
      const newEmail = email.trim();
      const oldEmail = (user.email || '').trim();
      if (newName === oldName && newEmail === oldEmail) {
        toast.info('No changes to save');
        return;
      }
      
      setIsSaving(true);
      try {
        const payload: Record<string, string> = {};
        if (newName && newName !== oldName) payload.name = newName;
        if (newEmail && newEmail !== oldEmail) payload.email = newEmail;

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
        if (data.user) {
          setUser(data.user);
        }

        toast.success('Account updated successfully');
      } catch (err: any) {
        toast.error(err.message || 'Failed to update account');
      } finally {
        setIsSaving(false);
      }
      return;
    }
    
    // Web local auth mode (non-desktop): allow name, email changes freely.
    // Current password only required when changing password.
    if (!isDesktop && wantsPasswordChange && !currentPassword) {
      toast.error('Current password is required to change your password');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, string> = {};
      const newName = name.trim();
      const oldName = storedName.trim();
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
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">Account</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isReadOnly
            ? 'Your account is managed by your authentication provider.'
            : isDesktop
            ? 'Update your account name and email.'
            : 'Update your profile information. Changes are saved to your local profile.'}
        </p>
      </div>

      {isReadOnly && (
        <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-3">
          <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="size-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Supabase Account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your account is managed by Supabase Auth. Name, email, and password changes must be done through your authentication provider.
            </p>
          </div>
        </div>
      )}

      {/* Read-only Supabase profile card */}
      {isReadOnly ? (
        <div className="rounded-xl border border-border/40 bg-muted/20 divide-y divide-border/20">
          <div className="flex items-center gap-3 px-4 py-3">
            <User className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Name</p>
              <p className="text-sm font-medium text-foreground truncate">{name || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Lock className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Email</p>
              <p className="text-sm text-foreground truncate">{email || '—'}</p>
            </div>
          </div>
        </div>
      ) : (
        <>

      {isDesktop && (
        <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-start gap-2">
          <Info className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Desktop mode: only account name and email can be updated. Password is configured during installation.
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
            disabled={isSaving}
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
            disabled={isSaving}
            placeholder="you@example.com"
            maxLength={255}
          />
          {!isDesktop && (
            <FieldDescription>
              Use the Change Password section below if you want to update your password.
            </FieldDescription>
          )}
        </Field>

        {!isDesktop && (
          <div className="border-t border-border/40 pt-6 mt-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Lock className="size-3.5" />
                  Change Password
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {supportsPasswordUpdate
                    ? 'Enter your current password and a new password to update.'
                    : 'Password changes are not available in this mode.'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPasswords((v) => !v)}
                disabled={!supportsPasswordUpdate}
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
                  disabled={!supportsPasswordUpdate || isSaving}
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
                  disabled={!supportsPasswordUpdate || isSaving}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={128}
                />
                {!supportsPasswordUpdate && (
                  <FieldDescription>
                    Password update is disabled in this build.
                  </FieldDescription>
                )}
              </Field>
            </FieldGroup>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="min-w-35"
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
      </FieldGroup>
        </>
      )}
    </div>
  );
}

// ── Guest Mode View ──

function GuestModeView() {
  return (
    <div className="p-4 md:p-8 flex flex-col items-center justify-center h-full text-center space-y-6">
      {/* Info */}
      <div className="space-y-3 max-w-90">
        <div className="p-4 bg-muted/20 rounded-full inline-flex mx-auto">
          <User className="size-8 text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">Guest Mode</h3>
          <p className="text-sm text-muted-foreground">
            You are browsing as a guest. Sign in to manage your account, or export your
            local data from Settings → Export Data.
          </p>
        </div>
      </div>

      {/* Sign in prompt */}
      <p className="text-xs text-muted-foreground">
        Already have an account?{' '}
        <button
          onClick={() => {
            // Clear guest mode and reload to show login
            sessionStorage.removeItem('auth_mode');
            window.location.reload();
          }}
          className="text-primary underline hover:no-underline"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
