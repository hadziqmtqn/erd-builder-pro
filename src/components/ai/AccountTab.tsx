import { useEffect, useState } from 'react';
import { User, Lock, Save, Loader2, Info, Eye, EyeOff, ShieldCheck, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api';
import { exportGuestData } from '@/lib/guestExport';
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

  // Detect if running in Tauri (desktop app) - client-side detection
  const isTauriApp = typeof window !== 'undefined' && 
    !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;

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

  const hasChanges = isTauriApp
    ? name !== (user.user_metadata?.name || user.user_metadata?.full_name || '')
    : name !== (user.user_metadata?.name || user.user_metadata?.full_name || '') ||
      email !== (user.email || '') ||
      newPassword.length > 0;

  const handleSave = async () => {
    if (isReadOnly) return;
    if (!hasChanges) {
      toast.info('No changes to save');
      return;
    }
    
    // Desktop app (Tauri): only allow name changes
    if (isTauriApp) {
      const newName = name.trim();
      const oldName = (user.user_metadata?.name || user.user_metadata?.full_name || '').trim();
      if (newName === oldName) {
        toast.info('No changes to save');
        return;
      }
      
      setIsSaving(true);
      try {
        const res = await apiFetch('/api/account', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update account');
        }

        const data = await res.json();
        if (data.user) {
          setUser(data.user);
        }

        toast.success('Account name updated successfully');
      } catch (err: any) {
        toast.error(err.message || 'Failed to update account');
      } finally {
        setIsSaving(false);
      }
      return;
    }
    
    // Web local auth mode: allow name, email, password changes
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
        <h2 className="text-lg font-semibold text-foreground">Account</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isReadOnly
            ? 'Your account is managed by your authentication provider.'
            : isTauriApp
            ? 'Update your account name. Email and password are fixed at install time.'
            : 'Update your profile information. Changes are saved to your local profile.'}
        </p>
      </div>

      {isReadOnly && (
        <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-md flex items-start gap-2">
          <Info className="size-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Signed in via Supabase Auth. To change your name, email, or password, visit your Supabase dashboard or contact your administrator.
          </p>
        </div>
      )}

      {!isReadOnly && isTauriApp && (
        <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-start gap-2">
          <Info className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Desktop mode: only account name can be updated. Email and password are configured during installation.
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

        {!isReadOnly && !isTauriApp && (
          <>
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
              <FieldDescription>
                Changing your email requires your current password
              </FieldDescription>
            </Field>
          </>
        )}

        {!isReadOnly && !isTauriApp && (
          <div className="border-t border-border/40 pt-6 mt-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Lock className="size-3.5" />
                  Change Password
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
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
        )}

        {!isReadOnly && (
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
        )}
      </FieldGroup>
    </div>
  );
}

// ── Guest Mode View ──

function GuestModeView() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportGuestData();
      toast.success('Guest data exported successfully!');
    } catch (err: any) {
      toast.error('Export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-8 flex flex-col items-center justify-center h-full text-center space-y-8">
      {/* Info */}
      <div className="space-y-3 max-w-[360px]">
        <div className="p-4 bg-muted/20 rounded-full inline-flex mx-auto">
          <User className="size-8 text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">Guest Mode</h3>
          <p className="text-sm text-muted-foreground">
            You are browsing as a guest. Sign in to manage your account, or export your
            local data to use in a full account.
          </p>
        </div>
      </div>

      {/* Export Data */}
      <div className="w-full max-w-sm bg-muted/10 border border-border/40 rounded-xl p-5 text-left">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <Download className="size-4 text-amber-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Export My Data</h4>
            <p className="text-[11px] text-muted-foreground">
              Download all your notes, diagrams, flowcharts, drawings, and AI chat sessions
              as a JSON file. You can import this file after signing in.
            </p>
          </div>
        </div>

        <Button
          onClick={handleExport}
          disabled={isExporting}
          variant="outline"
          size="sm"
          className="w-full"
        >
          {isExporting ? (
            <>
              <Loader2 className="size-3.5 mr-2 animate-spin" />
              Exporting…
            </>
          ) : (
            <>
              <Download className="size-3.5 mr-2" />
              Export Guest Data
            </>
          )}
        </Button>
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
