import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from "@/lib/utils";
import { apiFetch, getInstallMode, isInstalledApp, setAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface LoginProps {
  onLogin: (userData?: any) => void;
  onGuestLogin?: () => void;
}

export function Login({ onLogin, onGuestLogin }: LoginProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  // Fetch runtime config (guest mode, auth config)
  useEffect(() => {
    apiFetch('/api/auth-config')
      .then(r => r.json())
      .then(d => {
        setGuestMode(d.guest_mode !== false);
        setSetupRequired(d.needs_setup === true || d.needsSetup === true);
      })
      .catch(() => setSetupRequired(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      toast.error(error);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Installed local apps use auto-login via /api/me — login form should never show.
  // If the login page mounts while the local server is still starting, silently poll.
  const isLocalApp = isInstalledApp();
  const isCli = getInstallMode() === 'cli';
  const pollRef = useRef(true);
  const pollAttempts = useRef(0);

  useEffect(() => {
    if (!isLocalApp) return;

    let cancelled = false;
    const poll = async () => {
      while (!cancelled && pollRef.current) {
        try {
          const res = await apiFetch('/api/me');
          if (res.ok) {
            const data = await res.json();
            if (data.authenticated && !cancelled) {
              if (data.token) setAuthToken(data.token);
              onLogin(data.user);
              return;
            }
          } else if (res.status === 503) {
            // Server is up but DB not ready. Check if error is permanent.
            const data = await res.json().catch(() => ({}));
            if (data.db_error && !cancelled) {
              setDbError(data.message || "Database initialization failed. Check logs for details.");
              // Stop polling — permanent error won't heal
              return;
            }
          }
        } catch {
          // Server not reachable yet (connection refused) — keep polling
        }
        pollAttempts.current++;
        // After ~20s of failure, show timeout error
        if (pollAttempts.current >= 20 && !cancelled) {
          setDbError(isCli
            ? "Unable to connect to the CLI backend server. Check ~/.erdbpro/logs/ for server logs."
            : "Unable to connect to the desktop backend server. Check the application logs.");
          return;
        }
        if (!cancelled) await new Promise(r => setTimeout(r, 1000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [isCli, isLocalApp, onLogin]);

  // In installed local-app mode, never show the form — wait for auto-login silently.
  // If DB error detected, show diagnostic card instead of spinner.
  if (isLocalApp) {
    if (dbError) {
      return (
        <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
          <div className="max-w-md w-full rounded-lg border border-red-800 bg-red-950/40 p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-red-400 text-lg">⚠️</span>
              <h2 className="text-red-300 font-semibold">Startup Error</h2>
            </div>
            <p className="text-red-200/80 text-sm mb-4">{dbError}</p>
            <div className="text-xs text-red-300/60 space-y-1">
              <p>Log file: <code className="text-red-200/80">{isCli ? '~/.erdbpro/logs/server-*.err.log' : '~/Library/Logs/com.erdbuilderpro.app/server-startup.log'}</code></p>
              <p>{isCli ? 'Try restarting the CLI. If the issue persists, inspect the latest server error log.' : 'Try restarting the app. If the issue persists, ensure Node.js is installed.'}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Connecting...</p>
        </div>
      </div>
    );
  }

  if (setupRequired === null) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const setupMode = setupRequired;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupMode && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(setupMode ? '/api/setup' : '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupMode ? { name, email, password, confirmPassword } : { email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) setAuthToken(data.token);
        onLogin(data.user);
        toast.success(setupMode ? "Administrator account created!" : "Welcome back!");
      } else {
        const data = await res.json();
        toast.error(data.error || "Login failed");
      }
    } catch (err) {
      console.error('Login error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className={cn("flex flex-col gap-6")}>
          <Card>
            <CardHeader>
              <CardTitle>{setupMode ? 'Create administrator account' : 'Login to your account'}</CardTitle>
              <CardDescription>
                {setupMode
                  ? 'Set the first administrator email and password for this Self-host installation.'
                  : 'Enter your email below to login to your account'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <FieldGroup>
                  {setupMode && (
                    <Field>
                      <FieldLabel htmlFor="name">Name</FieldLabel>
                      <Input
                        id="name"
                        type="text"
                        placeholder="Enter administrator name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Field>
                  )}
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="m@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <div className="flex items-center">
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                    </div>
                    <div className="relative">
                      <Input 
                        id="password" 
                        type={showPassword ? "text" : "password"} 
                        placeholder={setupMode ? "Create a password" : "Enter your password"}
                        required 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none cursor-pointer"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </Field>
                  {setupMode && (
                    <Field>
                      <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
                      <div className="relative">
                        <Input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Re-enter your password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus:outline-none cursor-pointer"
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </Field>
                  )}
                  <Field className="flex flex-col gap-3">
                    <Button type="submit" disabled={loading} className="w-full">
                      {loading ? (setupMode ? "Creating account..." : "Logging in...") : (setupMode ? "Create administrator" : "Login")}
                    </Button>
                    {guestMode && (
                      <>
                        <div className="relative my-2">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">Or</span>
                          </div>
                        </div>
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="w-full" 
                          onClick={() => {
                            onGuestLogin?.();
                            toast.success("Welcome! You're in Guest Mode.");
                          }}
                        >
                          Try as Guest (Local Mode)
                        </Button>
                      </>
                    )}
                    {setupMode && (
                      <FieldDescription className="text-center">
                        This setup is available only once for the empty database.
                      </FieldDescription>
                    )}
                  </Field>

                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
