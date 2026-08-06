import React from 'react';
import type { Node } from '@xyflow/react';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { php } from '@codemirror/lang-php';
import { javascript } from '@codemirror/lang-javascript';
import { go } from '@codemirror/lang-go';
import { oneDark } from '@codemirror/theme-one-dark';
import { goHighlightExtensions } from '@/lib/codemirror-go-highlight';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Trash2, Table, FileCode, Database, FileText } from 'lucide-react';
import { Entity } from '@/types';
import { dbmlToERD, erdToDBML } from '@/lib/dbml-converter';
import {
  generateMySQL,
  generatePostgreSQL,
  generateLaravelMigration,
  generateTypeScript,
  generatePrisma,
  generateLaravelModel,
  generateZod,
  generateGoravelModel,
  generateGoravelMigration,
} from '@/lib/sql-generator';
import PropertiesPanel from '../PropertiesPanel';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { cn } from '@/lib/utils';

interface TableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity | null;
  defaultTab?: 'properties' | 'schema' | 'dbml';
}

const CATEGORIES = [
  {
    id: 'sql',
    label: 'SQL',
    formats: [
      { id: 'mysql', label: 'MySQL' },
      { id: 'postgresql', label: 'PostgreSQL' },
    ],
  },
  {
    id: 'laravel',
    label: 'Laravel',
    formats: [
      { id: 'laravel_migration', label: 'Migration' },
      { id: 'laravel_model', label: 'Model' },
    ],
  },
  {
    id: 'goravel',
    label: 'Goravel',
    formats: [
      { id: 'goravel', label: 'Model' },
      { id: 'goravel_migration', label: 'Migration' },
    ],
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    formats: [
      { id: 'typescript', label: 'Interface' },
      { id: 'zod', label: 'Zod' },
    ],
  },
  {
    id: 'prisma',
    label: 'Prisma',
    formats: [
      { id: 'prisma', label: 'Schema' },
    ],
  },
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
  mysql: 'sql',
  postgresql: 'sql',
  laravel_migration: 'php',
  laravel_model: 'php',
  goravel: 'go',
  goravel_migration: 'go',
  typescript: 'typescript',
  zod: 'typescript',
  prisma: 'prisma',
};

const FORMAT_EXTENSIONS: Record<string, string> = {
  sql: 'sql',
  mysql: 'sql',
  postgresql: 'sql',
  laravel_migration: 'php',
  laravel_model: 'php',
  goravel: 'go',
  goravel_migration: 'go',
  typescript: 'ts',
  zod: 'ts',
  prisma: 'prisma',
};

export const TableDialog = ({
  open,
  onOpenChange,
  entity,
  defaultTab = 'properties',
}: TableDialogProps) => {
  const [activeMainTab, setActiveMainTab] = React.useState<string>(defaultTab);
  const [activeCategory, setActiveCategory] = React.useState(CATEGORIES[0].id);
  const [activeTab, setActiveTab] = React.useState(CATEGORIES[0].formats[0].id);
  const [copied, setCopied] = React.useState(false);
  const [dbmlValue, setDbmlValue] = React.useState('');

  const {
    handleEntityUpdate,
    deleteEntity,
    setSelectedNodeId,
    setIsDeleteAlertOpen,
    resolvedTheme,
  } = useWorkspace();

  React.useEffect(() => {
    if (open) setActiveMainTab(defaultTab);
  }, [open, defaultTab]);

  const entityNode = React.useMemo<Node<Entity> | null>(() => entity ? ({
    id: entity.id,
    type: 'entity',
    position: { x: entity.x, y: entity.y },
    data: entity,
  }) : null, [entity]);
  const generatedDbml = React.useMemo(
    () => entityNode ? erdToDBML([entityNode], []) : '',
    [entityNode],
  );

  React.useEffect(() => {
    if (open && activeMainTab !== 'dbml') setDbmlValue(generatedDbml);
  }, [open, activeMainTab, generatedDbml]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setActiveMainTab(defaultTab);
    onOpenChange(nextOpen);
  };

  const currentCategory = CATEGORIES.find(c => c.id === activeCategory);
  const visibleFormats = currentCategory?.formats ?? [];
  const generateFn = FORMAT_GENERATORS[activeTab];
  const currentCode = entity ? generateFn(entity) : '';
  const currentLanguage = FORMAT_LANGUAGES[activeTab] || 'sql';

  const dbmlValidation = React.useMemo(() => {
    if (!entity) return { entity: null, error: 'No table selected.' };
    if (!dbmlValue.trim()) return { entity: null, error: 'DBML cannot be empty.' };
    try {
      const parsed = dbmlToERD(dbmlValue);
      if (parsed.nodes.length !== 1) {
        return { entity: null, error: 'DBML must contain exactly one Table block.' };
      }
      const parsedEntity = parsed.nodes[0].data;
      if (parsedEntity.name !== entity.name) {
        return { entity: null, error: `The Table name must be exactly "${entity.name}".` };
      }
      return { entity: parsedEntity, error: '' };
    } catch (error) {
      return { entity: null, error: error instanceof Error ? error.message : 'Invalid DBML.' };
    }
  }, [dbmlValue, entity]);
  const hasDbmlChanges = dbmlValue !== generatedDbml;

  const codeMirrorExtensions = React.useMemo(() => {
    const lang = FORMAT_LANGUAGES[activeTab] || '';
    switch (lang) {
      case 'sql': return [sqlLang()];
      case 'php': return [php()];
      case 'go': return [go(), ...goHighlightExtensions(resolvedTheme)];
      case 'prisma':
      case 'typescript': return [javascript({ typescript: true })];
      default: return [];
    }
  }, [activeTab, resolvedTheme]);

  if (!entity) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    const extension = FORMAT_EXTENSIONS[activeTab] || 'sql';
    const blob = new Blob([currentCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entity.name.toLowerCase()}_${activeTab}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCategoryChange = (catId: string) => {
    setActiveCategory(catId);
    const cat = CATEGORIES.find(c => c.id === catId);
    if (cat && cat.formats.length > 0) {
      setActiveTab(cat.formats[0].id);
    }
  };

  const applyDbml = () => {
    const parsedEntity = dbmlValidation.entity;
    if (!parsedEntity) return;

    const currentColumns = new Map(entity.columns.map(column => [column.name.toLowerCase(), column]));
    const updatedEntity: Entity = {
      ...entity,
      columns: parsedEntity.columns.map((column, index) => ({
        ...column,
        id: currentColumns.get(column.name.toLowerCase())?.id ?? crypto.randomUUID(),
        _is_fk: currentColumns.get(column.name.toLowerCase())?._is_fk,
        sort_order: index,
      })),
    };
    setDbmlValue(erdToDBML([{
      id: updatedEntity.id,
      type: 'entity',
      position: { x: updatedEntity.x, y: updatedEntity.y },
      data: updatedEntity,
    }], []));
    handleEntityUpdate(updatedEntity);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md bg-popover border-border text-popover-foreground shadow-2xl"
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full overflow-hidden min-h-0">
          <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
            <div className="flex items-center justify-between pr-8">
              <div className="space-y-1 text-left">
                <DialogTitle>
                  {activeMainTab === 'properties' ? 'Table Properties' : activeMainTab === 'dbml' ? 'Edit Table DBML' : 'Generate Code Schema'}
                </DialogTitle>
                <DialogDescription>
                  {activeMainTab === 'properties'
                    ? 'Customize your table name, theme, and column definitions.'
                    : activeMainTab === 'dbml' ? `Only the DBML for table "${entity.name}" can be edited.` : `Table: ${entity.name}`
                  }
                </DialogDescription>
              </div>
              {activeMainTab === 'properties' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsDeleteAlertOpen(true)}
                  className="text-destructive hover:bg-destructive/10 -mr-2 shadow-none"
                  title="Delete Table"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="flex w-full gap-1 mt-4 mb-4 rounded-lg bg-muted border border-border p-1" aria-label="Table editor sections">
              <button
                type="button"
                aria-pressed={activeMainTab === 'properties'}
                onClick={() => setActiveMainTab('properties')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                  activeMainTab === 'properties' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )}
              >
                <Table className="w-4 h-4" />
                Properties
              </button>
              <button
                type="button"
                aria-pressed={activeMainTab === 'schema'}
                onClick={() => setActiveMainTab('schema')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                  activeMainTab === 'schema' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )}
              >
                <FileCode className="w-4 h-4" />
                Schema
              </button>
              <button
                type="button"
                aria-pressed={activeMainTab === 'dbml'}
                onClick={() => setActiveMainTab('dbml')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors',
                  activeMainTab === 'dbml' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )}
              >
                <FileCode className="w-4 h-4" />
                DBML
              </button>
            </div>
          </DialogHeader>

          {activeMainTab === 'properties' && <div className="m-0 h-full flex flex-col overflow-hidden">
            <DialogBody className="p-0 overflow-hidden flex flex-col h-full">
              <PropertiesPanel
                selectedEntity={entity}
                onUpdateEntity={handleEntityUpdate}
                onDeleteEntity={(id) => {
                  deleteEntity(id);
                  setSelectedNodeId(null);
                  onOpenChange(false);
                }}
              />
            </DialogBody>
          </div>}

          {activeMainTab === 'schema' && <div className="m-0 flex flex-1 min-h-0 flex-col">
            <div className="px-6 pt-4 space-y-2 mb-3 overflow-x-auto scrollbar-hide w-full">
              {/* Category pills */}
              <div className="flex gap-1 bg-muted/40 border border-border rounded-lg p-0.5 w-fit">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-all text-nowrap ${
                      activeCategory === cat.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Format pills for active category */}
              <div className="flex gap-1 bg-muted border border-border rounded-lg p-1 w-fit mb-2">
                {visibleFormats.map(fmt => (
                  <button
                    key={fmt.id}
                    onClick={() => setActiveTab(fmt.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-all text-nowrap ${
                      activeTab === fmt.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-0 overflow-hidden bg-muted relative flex-1 min-h-0">
              <div className="h-[min(42vh,420px)] min-h-0">
                <CodeMirror
                  value={currentCode}
                  extensions={codeMirrorExtensions}
                  theme={resolvedTheme === 'dark' ? oneDark : undefined}
                  readOnly
                  height="100%"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: false,
                    highlightActiveLine: false,
                    highlightActiveLineGutter: false,
                    bracketMatching: false,
                    closeBrackets: false,
                    indentOnInput: false,
                  }}
                  className="text-[13px] text-foreground/90 h-full"
                  style={{ minHeight: '300px' }}
                />
              </div>
            </div>

            <DialogFooter className="sticky bottom-0 z-10 border-t border-border p-4 bg-muted/20 gap-3">
              <div className="flex items-center gap-2 mr-auto">
                <Button
                  variant="outline"
                  size="default"
                  onClick={downloadFile}
                  className="border-border hover:bg-muted bg-muted/50"
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Download
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  onClick={copyToClipboard}
                  className="border-border hover:bg-muted bg-muted/50 min-w-22.5"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-2 text-green-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <Button
                size="default"
                onClick={() => handleOpenChange(false)}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 font-bold"
              >
                Close
              </Button>
            </DialogFooter>
          </div>}

          {activeMainTab === 'dbml' && <div className="m-0 flex flex-1 min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-hidden bg-muted">
              <CodeMirror
                value={dbmlValue}
                onChange={setDbmlValue}
                extensions={[sqlLang()]}
                theme={resolvedTheme === 'dark' ? oneDark : undefined}
                height="100%"
                basicSetup={{ lineNumbers: true, foldGutter: false }}
                className="text-[13px] text-foreground/90 h-full"
                style={{ minHeight: '300px' }}
              />
            </div>
            <div className="px-6 py-2 text-xs text-destructive whitespace-pre-wrap min-h-8">
              {dbmlValidation.error}
            </div>
            <DialogFooter className="sticky bottom-0 z-10 border-t border-border p-4 bg-muted/20 gap-3">
              <Button
                size="default"
                onClick={applyDbml}
                disabled={!!dbmlValidation.error || !hasDbmlChanges}
                className="font-bold"
              >
                Apply DBML
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => handleOpenChange(false)}
                className="border-border"
              >
                Close
              </Button>
            </DialogFooter>
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  );
};
