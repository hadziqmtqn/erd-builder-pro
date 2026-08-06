import { Dispatch, SetStateAction } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { StructureDraft, StructureTarget } from '@/hooks/useStructureEditor';

type Props = {
  target: StructureTarget;
  draft: StructureDraft;
  tableColumns: any[];
  setDraft: Dispatch<SetStateAction<StructureDraft | null>>;
};

const patchDraft = (setDraft: Props['setDraft'], patch: Partial<StructureDraft>) => {
  setDraft(current => current ? { ...current, ...patch } : current);
};

export function DataViewerStructureIndexFields({ target, draft, tableColumns, setDraft }: Props) {
  if (target.kind === 'index' || target.kind === 'addIndex') {
    return <>
      <div className="space-y-1.5">
        <Label htmlFor="structure-index-name">Index name</Label>
        <Input id="structure-index-name" value={draft.indexName} onChange={e => patchDraft(setDraft, { indexName: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={draft.indexUnique} onCheckedChange={checked => patchDraft(setDraft, { indexUnique: checked })} />
        Unique
      </label>
      <div className="space-y-1.5">
        <Label>Algorithm</Label>
        <Select value={draft.indexAlgorithm || 'default'} onValueChange={value => patchDraft(setDraft, { indexAlgorithm: value === 'default' ? '' : value ?? '' })}>
          <SelectTrigger><SelectValue>{draft.indexAlgorithm ? draft.indexAlgorithm.toUpperCase() : 'Default'}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="btree">BTREE</SelectItem>
            <SelectItem value="hash">HASH</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Columns</Label>
        <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-2">
          {tableColumns.map((column: any) => (
            <label key={column.name} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.indexColumns.includes(column.name)}
                onCheckedChange={checked => patchDraft(setDraft, {
                  indexColumns: checked ? [...draft.indexColumns, column.name] : draft.indexColumns.filter(name => name !== column.name),
                })}
              />
              <span className="font-mono">{column.name}</span>
            </label>
          ))}
        </div>
      </div>
    </>;
  }

  return <>
    <div className="space-y-1.5">
      <Label htmlFor="structure-check-name">Constraint name</Label>
      <Input id="structure-check-name" value={draft.checkName} placeholder="check_name" onChange={e => patchDraft(setDraft, { checkName: e.target.value })} />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="structure-check-expression">Expression</Label>
      <Textarea id="structure-check-expression" value={draft.checkExpression} placeholder="price >= 0" onChange={e => patchDraft(setDraft, { checkExpression: e.target.value })} />
      <p className="text-xs text-muted-foreground">SQL expression without a trailing semicolon.</p>
    </div>
  </>;
}
