import React from 'react';
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
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Database, FileCode, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import { Entity } from '../../types';
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
} from '../../lib/sql-generator';

interface GeneratedCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity | null;
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

export const GeneratedCodeModal = ({
  open,
  onOpenChange,
  entity,
}: GeneratedCodeModalProps) => {
  const [activeCategory, setActiveCategory] = React.useState(CATEGORIES[0].id);
  const [activeTab, setActiveTab] = React.useState(CATEGORIES[0].formats[0].id);
  const [copied, setCopied] = React.useState(false);
  const [downloaded, setDownloaded] = React.useState(false);
  const { resolvedTheme } = useWorkspace();

  if (!entity) return null;

  const currentCategory = CATEGORIES.find(c => c.id === activeCategory);
  const visibleFormats = currentCategory?.formats ?? [];
  const generateFn = FORMAT_GENERATORS[activeTab];
  const currentCode = generateFn ? generateFn(entity) : '';
  const currentLanguage = FORMAT_LANGUAGES[activeTab] || 'sql';

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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    const extension = FORMAT_EXTENSIONS[activeTab] || 'sql';
    const toastId = toast.loading('Preparing download...');
    try {
      const blob = new Blob([currentCode], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entity.name.toLowerCase()}_${activeTab}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      toast.success(`${entity.name}_${activeTab}.${extension} downloaded successfully`, { id: toastId });
      setTimeout(() => setDownloaded(false), 2000);
    } catch (err) {
      toast.error('Failed to download file', { id: toastId });
    }
  };

  const handleCategoryChange = (catId: string) => {
    setActiveCategory(catId);
    const cat = CATEGORIES.find(c => c.id === catId);
    if (cat && cat.formats.length > 0) {
      setActiveTab(cat.formats[0].id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl bg-popover border-border text-popover-foreground shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-6 pt-6 pb-0 border-b border-border space-y-3">
          <div>
            <DialogTitle className="text-xl font-bold tracking-tight">Generate Code Schema</DialogTitle>
            <div className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest mt-1">
              Table: {entity.name}
            </div>
          </div>

          {/* Category pills */}
          <div className="overflow-x-auto scrollbar-hide w-full">
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
          </div>

          {/* Format pills for active category */}
          <div className="overflow-x-auto scrollbar-hide w-full -mt-1 mb-2">
            <div className="flex gap-1 bg-muted border border-border rounded-lg p-1 w-fit">
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
        </DialogHeader>

        <DialogBody className="p-0 bg-muted relative flex-1 min-h-0 overflow-y-auto">
          <div className="h-full min-h-75">
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
        </DialogBody>

        <DialogFooter className="border-t border-border p-4 bg-muted/20 gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadFile}
              className="h-9 px-4 border-border hover:bg-muted bg-muted/50 text-xs font-semibold"
            >
              {downloaded ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-2 text-green-400" />
                  Downloaded
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Download
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              className="h-9 px-4 border-border hover:bg-muted bg-muted/50 text-xs font-semibold min-w-22.5"
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
            onClick={() => onOpenChange(false)}
            className="h-9 px-6 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-bold"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
