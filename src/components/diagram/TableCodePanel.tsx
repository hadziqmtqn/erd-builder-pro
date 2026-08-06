import React from 'react';
import type { Node } from '@xyflow/react';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { php } from '@codemirror/lang-php';
import { javascript } from '@codemirror/lang-javascript';
import { go } from '@codemirror/lang-go';
import { oneDark } from '@codemirror/theme-one-dark';
import { Check, Copy, Download, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Entity } from '@/types';
import { dbmlToERD, erdToDBML } from '@/lib/dbml-converter';
import {
  generateGoravelMigration,
  generateGoravelModel,
  generateLaravelMigration,
  generateLaravelModel,
  generateMySQL,
  generatePostgreSQL,
  generatePrisma,
  generateTypeScript,
  generateZod,
} from '@/lib/sql-generator';
import { goHighlightExtensions } from '@/lib/codemirror-go-highlight';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { cn } from '@/lib/utils';

type TableCodeMode = 'schema' | 'dbml';

const CATEGORIES = [
  { id: 'sql', label: 'SQL', formats: [{ id: 'mysql', label: 'MySQL' }, { id: 'postgresql', label: 'PostgreSQL' }] },
  { id: 'laravel', label: 'Laravel', formats: [{ id: 'laravel_migration', label: 'Migration' }, { id: 'laravel_model', label: 'Model' }] },
  { id: 'goravel', label: 'Goravel', formats: [{ id: 'goravel', label: 'Model' }, { id: 'goravel_migration', label: 'Migration' }] },
  { id: 'typescript', label: 'TypeScript', formats: [{ id: 'typescript', label: 'Interface' }, { id: 'zod', label: 'Zod' }] },
  { id: 'prisma', label: 'Prisma', formats: [{ id: 'prisma', label: 'Schema' }] },
];

const FORMAT_GENERATORS: Record<string, (entity: Entity) => string> = {
  mysql: generateMySQL,
  postgresql: generatePostgreSQL,
  laravel_migration: generateLaravelMigration,
  laravel_model: generateLaravelModel,
  goravel: generateGoravelModel,
  goravel_migration: generateGoravelMigration,
  typescript: generateTypeScript,
  zod: generateZod,
  prisma: generatePrisma,
};

const FORMAT_LANGUAGES: Record<string, string> = {
  mysql: 'sql', postgresql: 'sql', laravel_migration: 'php', laravel_model: 'php',
  goravel: 'go', goravel_migration: 'go', typescript: 'typescript', zod: 'typescript', prisma: 'prisma',
};

const FORMAT_EXTENSIONS: Record<string, string> = {
  mysql: 'sql', postgresql: 'sql', laravel_migration: 'php', laravel_model: 'php',
  goravel: 'go', goravel_migration: 'go', typescript: 'ts', zod: 'ts', prisma: 'prisma',
};

interface TableCodePanelProps {
  entity: Entity;
  mode: TableCodeMode;
  onUpdateEntity: (entity: Entity) => void;
}

export default function TableCodePanel({ entity, mode, onUpdateEntity }: TableCodePanelProps) {
  const { resolvedTheme } = useWorkspace();
  const [activeCategory, setActiveCategory] = React.useState(CATEGORIES[0].id);
  const [activeFormat, setActiveFormat] = React.useState(CATEGORIES[0].formats[0].id);
  const [copied, setCopied] = React.useState(false);
  const entityNode = React.useMemo<Node<Entity>>(() => ({
    id: entity.id,
    type: 'entity',
    position: { x: entity.x, y: entity.y },
    data: entity,
  }), [entity]);
  const generatedDbml = React.useMemo(() => erdToDBML([entityNode], []), [entityNode]);
  const [dbmlValue, setDbmlValue] = React.useState(generatedDbml);

  React.useEffect(() => setDbmlValue(generatedDbml), [entity.id, generatedDbml]);

  const currentCategory = CATEGORIES.find(category => category.id === activeCategory) ?? CATEGORIES[0];
  const currentCode = FORMAT_GENERATORS[activeFormat](entity);
  const currentLanguage = FORMAT_LANGUAGES[activeFormat] || 'sql';
  const dbmlValidation = React.useMemo(() => {
    if (!dbmlValue.trim()) return { entity: null, error: 'DBML cannot be empty.' };
    try {
      const parsed = dbmlToERD(dbmlValue);
      if (parsed.nodes.length !== 1) return { entity: null, error: 'DBML must contain exactly one Table block.' };
      const parsedEntity = parsed.nodes[0].data;
      if (parsedEntity.name !== entity.name) return { entity: null, error: `The table name must be exactly "${entity.name}".` };
      return { entity: parsedEntity, error: '' };
    } catch (error) {
      return { entity: null, error: error instanceof Error ? error.message : 'Invalid DBML.' };
    }
  }, [dbmlValue, entity]);

  const extensions = React.useMemo(() => {
    if (mode === 'dbml') return [sqlLang()];
    switch (currentLanguage) {
      case 'sql': return [sqlLang()];
      case 'php': return [php()];
      case 'go': return [go(), ...goHighlightExtensions(resolvedTheme)];
      case 'typescript':
      case 'prisma': return [javascript({ typescript: true })];
      default: return [];
    }
  }, [currentLanguage, mode, resolvedTheme]);

  const copyCode = async () => {
    await navigator.clipboard.writeText(currentCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const downloadCode = () => {
    const blob = new Blob([currentCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${entity.name.toLowerCase()}_${activeFormat}.${FORMAT_EXTENSIONS[activeFormat] || 'txt'}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const applyDbml = () => {
    const parsedEntity = dbmlValidation.entity;
    if (!parsedEntity) return;
    const currentColumns = new Map(entity.columns.map(column => [column.name.toLowerCase(), column]));
    const remapColumnIds = (columnIds: string[] = []) => columnIds.map(id => {
      const parsedColumn = parsedEntity.columns.find(column => column.id === id);
      return parsedColumn ? currentColumns.get(parsedColumn.name.toLowerCase())?.id ?? id : id;
    });
    const updatedEntity: Entity = {
      ...entity,
      comment: parsedEntity.comment,
      columns: parsedEntity.columns.map((column, index) => ({
        ...column,
        id: currentColumns.get(column.name.toLowerCase())?.id ?? crypto.randomUUID(),
        _is_fk: currentColumns.get(column.name.toLowerCase())?._is_fk,
        sort_order: index,
      })),
      constraints: (parsedEntity.constraints || []).map(constraint => ({
        ...constraint,
        entity_id: entity.id,
        column_ids: remapColumnIds(constraint.column_ids),
      })),
      indexes: (parsedEntity.indexes || []).map(index => ({
        ...index,
        entity_id: entity.id,
        column_ids: remapColumnIds(index.column_ids),
      })),
    };
    onUpdateEntity(updatedEntity);
    setDbmlValue(erdToDBML([{
      id: updatedEntity.id,
      type: 'entity',
      position: { x: updatedEntity.x, y: updatedEntity.y },
      data: updatedEntity,
    }], []));
  };

  if (mode === 'dbml') {
    const hasChanges = dbmlValue !== generatedDbml;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Table DBML</p>
          <p className="mt-1 text-xs text-muted-foreground">Only the DBML for “{entity.name}” can be edited.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-muted">
          <CodeMirror
            value={dbmlValue}
            onChange={setDbmlValue}
            extensions={extensions}
            theme={resolvedTheme === 'dark' ? oneDark : undefined}
            height="100%"
            basicSetup={{ lineNumbers: true, foldGutter: false }}
            className="h-full text-[13px] text-foreground/90"
          />
        </div>
        <div className="min-h-8 px-4 py-2 text-xs text-destructive">{dbmlValidation.error}</div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 p-3">
          <Button variant="outline" onClick={() => setDbmlValue(generatedDbml)}>Reset</Button>
          <Button onClick={applyDbml} disabled={!!dbmlValidation.error || !hasChanges}>Apply DBML</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {CATEGORIES.map(category => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                setActiveCategory(category.id);
                setActiveFormat(category.formats[0].id);
              }}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap',
                activeCategory === category.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {category.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {currentCategory.formats.map(format => (
            <button
              key={format.id}
              type="button"
              onClick={() => setActiveFormat(format.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap',
                activeFormat === format.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <FileCode className="size-3.5" />
              {format.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-muted">
        <CodeMirror
          value={currentCode}
          extensions={extensions}
          theme={resolvedTheme === 'dark' ? oneDark : undefined}
          readOnly
          height="100%"
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false }}
          className="h-full text-[13px] text-foreground/90"
        />
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/20 p-3">
        <Button variant="outline" onClick={downloadCode}><Download className="mr-2 size-3.5" />Download</Button>
        <Button variant="outline" onClick={copyCode}>
          {copied ? <Check className="mr-2 size-3.5 text-green-500" /> : <Copy className="mr-2 size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
