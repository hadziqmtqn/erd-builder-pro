import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  Cloud,
  RefreshCw,
  Save,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  FolderOpen,
  Link,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api';

interface StorageConfig {
  type: 'r2' | 's3-compatible';
  accountId?: string;
  endpoint?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
}

export function StorageConfigTab() {
  const isDesktopApp = typeof window !== 'undefined' && (
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) ||
    (window as any).ERD_INSTALL_MODE === 'cli'
  );

  if (!isDesktopApp) {
    return (
      <div className="p-4 md:p-8">
        <Card className="border-border/50 bg-background/50 backdrop-blur-sm">
          <CardContent className="py-12 text-center">
            <HardDrive className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground mt-4 text-sm">
              Storage configuration is only available in the desktop app or CLI mode.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [config, setConfig] = useState<StorageConfig>({
    type: 'r2',
    accountId: '',
    endpoint: '',
    region: 'auto',
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    publicUrl: '',
  });
  const [savedConfig, setSavedConfig] = useState<StorageConfig | null>(null);
  const [source, setSource] = useState<'env' | 'db' | 'none'>('none');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | ''; message: string }>({ type: '', message: '' });
  const [showSecret, setShowSecret] = useState(false);
  const [showAccessKey, setShowAccessKey] = useState(false);

  // Load current config on mount
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/storage/config', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSource(data.source);
        if (data.config) {
          setSavedConfig(data.config);
          // Populate form, resolving masked secrets
          setConfig({
            type: data.config.type || 'r2',
            accountId: data.config.accountId || '',
            endpoint: data.config.endpoint || '',
            region: data.config.region || 'auto',
            accessKeyId: data.config.accessKeyId || '',
            secretAccessKey: data.config.secretAccessKey || '',
            bucketName: data.config.bucketName || '',
            publicUrl: data.config.publicUrl || '',
          });
        }
      }
    } catch (err) {
      console.error('Failed to load storage config:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await apiFetch('/api/storage/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'include',
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'Storage configuration saved successfully.' });
        setSavedConfig({ ...config });
        // Reload to get masked values
        await loadConfig();
      } else {
        const err = await res.json();
        setStatus({ type: 'error', message: err.error || 'Failed to save configuration' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setStatus({ type: '', message: '' });
    try {
      const res = await apiFetch('/api/storage/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'include',
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'Successfully connected to storage.' });
      } else {
        const err = await res.json();
        setStatus({ type: 'error', message: err.error || 'Connection failed' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Network error' });
    } finally {
      setIsTesting(false);
    }
  };

  const updateField = <K extends keyof StorageConfig>(field: K, value: StorageConfig[K]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setStatus({ type: '', message: '' });
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <Card className="border-border/50 bg-background/50 backdrop-blur-sm">
          <CardContent className="py-12 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground mt-4 text-sm">Loading storage configuration...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Source indicator ──
  const isFromEnv = source === 'env';
  const isFromDb = source === 'db';

  return (
    <div className="p-6 space-y-6">
      <Card className="border border-border/50 bg-background/50 backdrop-blur-sm shadow-lg">
        <CardHeader className="border-b border-border/30 pb-6">
          <div className="flex items-center gap-3">
            <Cloud className="w-6 h-6 text-blue-500" />
            <CardTitle className="text-xl md:text-2xl font-bold">Storage Configuration</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure Cloudflare R2 or S3-compatible storage for image uploads in Notes and Drawings.
          </p>
        </CardHeader>

        <CardContent className="space-y-6 p-4 md:p-6">
          {/* Source Indicator */}
          {isFromEnv && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Info className="w-4 h-4 text-blue-500 shrink-0" />
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Pre-filled from environment variables. Save to override with custom settings.
              </p>
            </div>
          )}

          {/* Status Banner */}
          {status.type && (
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${
              status.type === 'success'
                ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
                : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
            }`}>
              {status.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 shrink-0" />
              )}
              <p className="text-sm">{status.message}</p>
            </div>
          )}

          {/* Storage Type */}
          <Field>
            <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
              <HardDrive className="size-3" />
              Storage Provider
            </FieldLabel>
            <Select
              value={config.type}
              onValueChange={(val: 'r2' | 's3-compatible' | null, _ev) => val && updateField('type', val)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue>
                  {config.type === 'r2' ? (
                    <span className="flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      Cloudflare R2
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4" />
                      S3-Compatible
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="r2">
                  <span className="flex items-center gap-2">
                    <Cloud className="w-4 h-4" />
                    Cloudflare R2
                  </span>
                </SelectItem>
                <SelectItem value="s3-compatible">
                  <span className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    S3-Compatible
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* R2-specific: Account ID */}
          {config.type === 'r2' && (
            <Field>
              <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                <Globe className="size-3" />
                Account ID
              </FieldLabel>
              <Input
                placeholder="Your Cloudflare R2 Account ID"
                value={config.accountId || ''}
                onChange={(e) => updateField('accountId', e.target.value)}
                className="h-9 text-sm font-mono"
              />
              <p className="text-[11px] text-muted-foreground/70 mt-1 px-1">
                Found in your Cloudflare dashboard under R2 → Account ID.
              </p>
            </Field>
          )}

          {/* S3-specific: Endpoint */}
          {config.type === 's3-compatible' && (
            <>
              <Field>
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                  <Globe className="size-3" />
                  Endpoint URL
                </FieldLabel>
                <Input
                  placeholder="https://s3.us-east-1.amazonaws.com"
                  value={config.endpoint || ''}
                  onChange={(e) => updateField('endpoint', e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </Field>
              <Field>
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
                  <Globe className="size-3" />
                  Region
                </FieldLabel>
                <Input
                  placeholder="us-east-1"
                  value={config.region || ''}
                  onChange={(e) => updateField('region', e.target.value)}
                  className="h-9 text-sm font-mono"
                />
              </Field>
            </>
          )}

          {/* Access Key ID */}
          <Field>
            <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
              <KeyRound className="size-3" />
              Access Key ID
            </FieldLabel>
            <div className="relative">
              <Input
                type={showAccessKey ? 'text' : 'password'}
                placeholder="Your access key ID"
                value={config.accessKeyId}
                onChange={(e) => updateField('accessKeyId', e.target.value)}
                className="h-9 text-sm font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowAccessKey(!showAccessKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAccessKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          {/* Secret Access Key */}
          <Field>
            <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
              <KeyRound className="size-3" />
              Secret Access Key
            </FieldLabel>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                placeholder="Your secret access key"
                value={config.secretAccessKey}
                onChange={(e) => updateField('secretAccessKey', e.target.value)}
                className="h-9 text-sm font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          {/* Bucket Name */}
          <Field>
            <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
              <FolderOpen className="size-3" />
              Bucket Name
            </FieldLabel>
            <Input
              placeholder="your-bucket-name"
              value={config.bucketName}
              onChange={(e) => updateField('bucketName', e.target.value)}
              className="h-9 text-sm font-mono"
            />
          </Field>

          {/* Public URL (optional) */}
          <Field>
            <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-2 px-1">
              <Link className="size-3" />
              Public URL (optional)
            </FieldLabel>
            <Input
              placeholder="https://cdn.yourdomain.com"
              value={config.publicUrl || ''}
              onChange={(e) => updateField('publicUrl', e.target.value)}
              className="h-9 text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground/70 mt-1 px-1">
              {config.type === 's3-compatible'
                ? 'Optional. If set, overrides the auto-constructed endpoint URL. Useful for custom CDN/domain. If empty, URL is built from Endpoint + Bucket.'
                : 'Optional public URL prefix for direct image access (e.g., custom domain or CDN). If empty, R2 public URL is auto-constructed.'
              }
            </p>
          </Field>
        </CardContent>

        <CardFooter className="bg-muted/5 border-t border-border/30 p-4 md:px-6 md:py-4 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting || !config.bucketName || !config.accessKeyId || !config.secretAccessKey}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium whitespace-nowrap transition-colors h-10 px-4 bg-background hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none"
          >
            {isTesting ? (
              <>
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin pointer-events-none" />
                <span className="pointer-events-none">Testing...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 shrink-0 pointer-events-none" />
                <span className="pointer-events-none">Test Connection</span>
              </>
            )}
          </button>
          <Button
            onClick={handleSave}
            className="gap-2 px-6"
            disabled={isSaving}
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
