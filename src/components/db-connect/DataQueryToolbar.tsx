import { Download, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadResult, type QueryResult } from './DataQueryResultTable';

type Props = {
  groupName: string;
  name: string;
  result: QueryResult | null;
  onGroupChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onDelete?: () => void;
  onSave: () => void;
  security?: { environment?: string; safeMode?: string; sslMode?: string };
};

export function DataQueryToolbar({ groupName, name, result, onGroupChange, onNameChange, onDelete, onSave, security }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b px-2 py-1">
      <Input className="h-8 w-36 shrink-0" value={groupName} onChange={e => onGroupChange(e.target.value)} placeholder="Group" />
      <Input className="h-8 w-64 shrink-0" value={name} onChange={e => onNameChange(e.target.value)} placeholder="Query name" />
      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${security?.environment === 'production' ? 'border-red-500/30 bg-red-500/10 text-red-600' : 'text-muted-foreground'}`}>{security?.environment || 'development'}</span>
      {security?.safeMode === 'read-only' && <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">READ ONLY</span>}
      {security?.sslMode && security.sslMode !== 'disable' && <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">TLS {security.sslMode}</span>}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button size="sm" variant="destructive" onClick={onDelete} disabled={!onDelete} title={!onDelete ? 'Save the query before deleting it' : 'Delete query'}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
        </Button>
        <Button size="sm" variant="outline" onClick={onSave}>
          <Save className="mr-1.5 h-3.5 w-3.5" /> Save
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" disabled={!result} />}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => result && downloadResult(result, name, 'json')} className="cursor-pointer">JSON</DropdownMenuItem>
            <DropdownMenuItem onClick={() => result && downloadResult(result, name, 'csv')} className="cursor-pointer">CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
