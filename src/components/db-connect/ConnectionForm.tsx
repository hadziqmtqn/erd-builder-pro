import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { DbAccountFormData, DbType, TestResult, DbAccount } from '@/hooks/useConnections';

const DB_OPTIONS: { value: DbType; label: string; defaultPort: number }[] = [
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432 },
  { value: 'mysql', label: 'MySQL', defaultPort: 3306 },
  { value: 'sqlite', label: 'SQLite', defaultPort: 0 },
];

interface ConnectionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: DbAccount | null;
  onSave: (data: DbAccountFormData) => Promise<DbAccount | null>;
  onTest: (data: DbAccountFormData) => Promise<TestResult>;
  getDefaultPort: (type: DbType) => number;
}

export function ConnectionForm({
  open,
  onOpenChange,
  editing,
  onSave,
  onTest,
  getDefaultPort,
}: ConnectionFormProps) {
  const [type, setType] = useState<DbType>(editing?.type || 'postgresql');
  const [name, setName] = useState(editing?.name || '');
  const [host, setHost] = useState(editing?.host || '');
  const [port, setPort] = useState(String(editing?.port ?? getDefaultPort(type)));
  const [user, setUser] = useState(editing?.user || '');
  const [password, setPassword] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!editing;

  useEffect(() => {
    if (open) {
      if (editing) {
        setType(editing.type);
        setName(editing.name);
        setHost(editing.host || '');
        setPort(String(editing.port ?? getDefaultPort(editing.type)));
        setUser(editing.user || '');
        setPassword('');
      } else {
        setType('postgresql');
        setName('');
        setHost('localhost');
        setPort('5432');
        setUser('postgres');
        setPassword('');
      }
      setTestResult(null);
    }
  }, [open, editing, getDefaultPort]);

  const handleTypeChange = (val: string | null) => {
    if (!val) return;
    const t = val as DbType;
    setType(t);
    setPort(String(getDefaultPort(t)));
    setTestResult(null);
  };

  const buildFormData = (): DbAccountFormData => ({
    name,
    type,
    host,
    port: Number(port),
    user,
    password,
  });

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await onTest(buildFormData());
    setTestResult(result);
    setIsTesting(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    const result = await onSave(buildFormData());
    setIsSaving(false);
    if (result) {
      onOpenChange(false);
    }
  };

  const isSqlite = type === 'sqlite';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Server Account' : 'New Server Account'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {/* Type */}
          <Field>
            <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
              Database Type
            </FieldLabel>
            <Select value={type} onValueChange={handleTypeChange}>
              <SelectTrigger className="h-10">
                <SelectValue>
                  {DB_OPTIONS.find(o => o.value === type)?.label || type}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {DB_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Name */}
          <Field>
            <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
              Server Name
            </FieldLabel>
            <Input
              className="h-10"
              placeholder="My Production DB"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </Field>

          {/* Host + Port (hidden for SQLite) */}
          {!isSqlite && (
            <div className="grid grid-cols-3 gap-3">
              <Field className="col-span-2">
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                  Host
                </FieldLabel>
                <Input
                  className="h-10"
                  placeholder="localhost"
                  value={host}
                  onChange={e => setHost(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                  Port
                </FieldLabel>
                <Input
                  className="h-10"
                  type="number"
                  value={port}
                  onChange={e => setPort(e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* User + Password (hidden for SQLite) */}
          {!isSqlite && (
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                  User
                </FieldLabel>
                <Input
                  className="h-10"
                  placeholder={type === 'postgresql' ? 'postgres' : 'root'}
                  value={user}
                  onChange={e => setUser(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 px-1">
                  Password
                </FieldLabel>
                <Input
                  className="h-10"
                  type="password"
                  placeholder={isEditing ? '(saved)' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              testResult.success
                ? 'border-green-500/20 bg-green-500/5 text-green-700 dark:text-green-400'
                : 'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-400'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-9" onClick={handleTest} disabled={isTesting}>
            {isTesting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : null}
            Test Connection
          </Button>
          <DialogClose render={<Button variant="ghost" className="h-9" />}>
            Cancel
          </DialogClose>
          <Button
            className="h-9 px-6"
            disabled={!name.trim() || isSaving}
            onClick={handleSave}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : null}
            {isEditing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
