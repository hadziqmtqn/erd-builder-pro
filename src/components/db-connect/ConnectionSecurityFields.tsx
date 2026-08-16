import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DbEnvironment, DbSafeMode, DbSslMode } from '@/hooks/useConnections';

type Props = {
  environment: DbEnvironment;
  safeMode: DbSafeMode;
  sslMode: DbSslMode;
  sslCa: string;
  sslCert: string;
  sslKey: string;
  queryTimeoutMs: string;
  onEnvironmentChange: (value: DbEnvironment) => void;
  onSafeModeChange: (value: DbSafeMode) => void;
  onSslModeChange: (value: DbSslMode) => void;
  onSslCaChange: (value: string) => void;
  onSslCertChange: (value: string) => void;
  onSslKeyChange: (value: string) => void;
  onQueryTimeoutChange: (value: string) => void;
};

const label = 'text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1';

const ENVIRONMENT_LABELS: Record<DbEnvironment, string> = {
  local: 'Local',
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
};

const SAFE_MODE_LABELS: Record<DbSafeMode, string> = {
  normal: 'Normal',
  protected: 'Protected',
  'read-only': 'Read-only',
};

const SSL_MODE_LABELS: Record<DbSslMode, string> = {
  disable: 'Disable',
  require: 'Require',
  'verify-ca': 'Verify CA',
  'verify-full': 'Verify Full',
};

export function ConnectionSecurityFields(props: Props) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel className={label}>Environment</FieldLabel>
          <Select value={props.environment} onValueChange={value => props.onEnvironmentChange(value as DbEnvironment)}>
            <SelectTrigger><SelectValue>{ENVIRONMENT_LABELS[props.environment]}</SelectValue></SelectTrigger>
            <SelectContent>{Object.entries(ENVIRONMENT_LABELS).map(([value, optionLabel]) => <SelectItem key={value} value={value}>{optionLabel}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel className={label}>Safe Mode</FieldLabel>
          <Select value={props.safeMode} onValueChange={value => props.onSafeModeChange(value as DbSafeMode)}>
            <SelectTrigger><SelectValue>{SAFE_MODE_LABELS[props.safeMode]}</SelectValue></SelectTrigger>
            <SelectContent>{Object.entries(SAFE_MODE_LABELS).map(([value, optionLabel]) => <SelectItem key={value} value={value}>{optionLabel}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field><FieldLabel className={label}>TLS / SSL</FieldLabel>
          <Select value={props.sslMode} onValueChange={value => props.onSslModeChange(value as DbSslMode)}>
            <SelectTrigger><SelectValue>{SSL_MODE_LABELS[props.sslMode]}</SelectValue></SelectTrigger>
            <SelectContent>{Object.entries(SSL_MODE_LABELS).map(([value, optionLabel]) => <SelectItem key={value} value={value}>{optionLabel}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field><FieldLabel className={label}>Query timeout (ms)</FieldLabel><Input type="number" min={1000} max={600000} value={props.queryTimeoutMs} onChange={e => props.onQueryTimeoutChange(e.target.value)} /></Field>
      </div>
      {props.sslMode !== 'disable' && (
        <div className="space-y-2">
          <Input placeholder="CA certificate path (optional)" value={props.sslCa} onChange={e => props.onSslCaChange(e.target.value)} />
          <Input placeholder="Client certificate path (optional)" value={props.sslCert} onChange={e => props.onSslCertChange(e.target.value)} />
          <Input placeholder="Client private key path (optional)" value={props.sslKey} onChange={e => props.onSslKeyChange(e.target.value)} />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Protected and Production connections require the table name for destructive actions.</p>
    </div>
  );
}
