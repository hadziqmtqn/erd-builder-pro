import { useWorkspace } from '@/providers/WorkspaceProvider';
import React from 'react';
import JSZip from 'jszip';
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
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Loader2, Database, FileCode, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Node, Edge } from '@xyflow/react';
import { Entity } from '@/types';
import { generateAllTablesCode, generateAllTablesFiles, AllExportFormat, getExtension } from '@/lib/sql-generator-all';

interface ExportAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: Node<Entity>[];
  edges: Edge[];
  fileName: string;
  onExportPDF: () => void;
  onExportImage: () => void;
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

const SINGLE_FILE_TABS = new Set(['mysql', 'postgresql', 'prisma']);

export const ExportAllDialog = ({
  open,
  onOpenChange,
  nodes,
  edges,
  fileName,
  onExportPDF,
  onExportImage,
}: ExportAllDialogProps) => {
  const [activeCategory, setActiveCategory] = React.useState(CATEGORIES[0].id);
  const [activeTab, setActiveTab] = React.useState(CATEGORIES[0].formats[0].id);
  const [copied, setCopied] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [downloaded, setDownloaded] = React.useState(false);
  const { resolvedTheme } = useWorkspace();

  const currentCategory = CATEGORIES.find(c => c.id === activeCategory);
  const visibleFormats = currentCategory?.formats ?? [];
  const format = activeTab as AllExportFormat;
  const isSingleFile = SINGLE_FILE_TABS.has(activeTab);

  const generatedCode = React.useMemo(() => {
    return generateAllTablesCode(format, nodes, edges, fileName) + '\n\n';
  }, [format, nodes, edges, fileName]);

  const codeMirrorExtensions = React.useMemo(() => {
    const getLang = (tab: string) => {
      if (tab === 'mysql' || tab === 'postgresql') return 'sql';
      if (tab === 'laravel_migration' || tab === 'laravel_model') return 'php';
      if (tab === 'goravel' || tab === 'goravel_migration') return 'go';
      if (tab === 'typescript' || tab === 'zod') return 'typescript';
      if (tab === 'prisma') return 'prisma';
      return '';
    };
    const lang = getLang(activeTab);
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
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = async () => {
    setIsDownloading(true);
    const toastId = toast.loading(isSingleFile ? 'Downloading...' : 'Creating archive...');
    try {
      if (isSingleFile) {
        const ext = getExtension(format);
        const blob = new Blob([generatedCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName.toLowerCase().replace(/\s+/g, '_')}_schema.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const files = generateAllTablesFiles(format, nodes, edges, fileName);
        const zip = new JSZip();
        files.forEach(f => zip.file(f.filename, f.content));
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName.toLowerCase().replace(/\s+/g, '_')}_schema.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      setDownloaded(true);
      toast.success(isSingleFile ? 'File downloaded successfully' : 'Archive downloaded successfully', { id: toastId });
      setTimeout(() => setDownloaded(false), 2000);
    } catch (err) {
      toast.error('Failed to download file', { id: toastId });
    } finally {
      setIsDownloading(false);
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
        size="2xl"
        className="bg-popover border-border text-popover-foreground shadow-2xl"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-6 pt-6 pb-0 border-b border-border space-y-3">
          <div>
            <DialogTitle className="text-xl font-bold tracking-tight">Export All</DialogTitle>
            <div className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest mt-1">
              {nodes.length} tables · {edges.length} relationships
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
                value={generatedCode}
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
                disabled={isDownloading || downloaded}
                className="h-9 px-4 border-border hover:bg-muted bg-muted/50 text-xs font-semibold"
              >
                {downloaded ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-2 text-green-400" />
                    Downloaded
                  </>
                ) : isDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-2" />
                )}
                {!downloaded && (isSingleFile ? 'Download' : 'Download .zip')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                disabled={!isSingleFile}
                className="h-9 px-4 border-border hover:bg-muted bg-muted/50 text-xs font-semibold min-w-22.5 disabled:opacity-30 disabled:cursor-not-allowed"
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
