import React from 'react';
import JSZip from 'jszip';
import CodeMirror from '@uiw/react-codemirror';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { php } from '@codemirror/lang-php';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Download, Loader2, Database, FileText, Image as ImageIcon, FileCode, FlaskConical } from 'lucide-react';
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

const TABS: { id: string; label: string; icon: React.ElementType; lang: string; isExperimental?: boolean }[] = [
  { id: 'typescript', label: 'TypeScript', icon: FileText, lang: 'typescript' },
  { id: 'prisma', label: 'Prisma', icon: FileText, lang: 'prisma' },
  { id: 'laravel_migration', label: 'Laravel Migration', icon: FileCode, lang: 'php' },
  { id: 'laravel_model', label: 'Laravel Model', icon: FileCode, lang: 'php' },
  { id: 'mysql', label: 'MySQL', icon: Database, lang: 'sql' },
  { id: 'postgresql', label: 'PostgreSQL', icon: Database, lang: 'sql' },
  { id: 'zod', label: 'Zod', icon: FileText, lang: 'typescript' },
  { id: 'pdf', label: 'PDF', icon: FileText, lang: '', isExperimental: true },
  { id: 'svg', label: 'SVG', icon: ImageIcon, lang: '', isExperimental: true },
];

export const ExportAllDialog = ({
  open,
  onOpenChange,
  nodes,
  edges,
  fileName,
  onExportPDF,
  onExportImage,
}: ExportAllDialogProps) => {
  const [activeTab, setActiveTab] = React.useState('mysql');
  const [copied, setCopied] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);

  const currentTab = TABS.find(t => t.id === activeTab);
  const isSingleFile = activeTab === 'mysql' || activeTab === 'postgresql';
  const isSchemaTab = !currentTab?.isExperimental;

  const generatedCode = React.useMemo(() => {
    if (!isSchemaTab) return '';
    return generateAllTablesCode(activeTab as AllExportFormat, nodes, edges, fileName) + '\n\n';
  }, [activeTab, nodes, edges, fileName, isSchemaTab]);

  const codeMirrorExtensions = React.useMemo(() => {
    const lang = currentTab?.lang;
    if (!lang) return [];
    switch (lang) {
      case 'sql': return [sqlLang()];
      case 'php': return [php()];
      case 'prisma':
      case 'typescript': return [javascript({ typescript: true })];
      default: return [];
    }
  }, [currentTab]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = async () => {
    setIsDownloading(true);
    try {
      if (isSingleFile) {
        const ext = getExtension(activeTab as AllExportFormat);
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
        const files = generateAllTablesFiles(activeTab as AllExportFormat, nodes, edges, fileName);
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
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="2xl"
        className="bg-popover border-border text-popover-foreground shadow-2xl"
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-6 pt-6 pb-0 border-b border-border">
          <DialogTitle className="text-xl font-bold tracking-tight">Export All</DialogTitle>
          <div className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest mt-1">
            {nodes.length} tables · {edges.length} relationships
          </div>

          <div className="pt-4 mb-3 overflow-x-auto scrollbar-hide">
            <div className="flex gap-1 bg-muted border border-border rounded-lg p-1 w-fit">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-all text-nowrap ${
                    activeTab === tab.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.isExperimental && (
                    <Badge className="ml-1 h-4 px-1 text-[7px] font-bold uppercase tracking-widest bg-amber-500/15 text-amber-400 border-amber-500/30 rounded-sm">
                      <FlaskConical className="w-2 h-2 mr-0.5" />
                      Exp
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>

          <DialogBody className="p-0 bg-muted relative flex-1 min-h-0 overflow-y-auto">
            {isSchemaTab ? (
              <div className="h-full min-h-[300px]">
                <CodeMirror
                  value={generatedCode}
                  extensions={codeMirrorExtensions}
                  theme={oneDark}
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
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted border border-border flex items-center justify-center mb-5">
                  {activeTab === 'pdf' ? (
                    <FileText className="w-8 h-8 text-red-400" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-purple-400" />
                  )}
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  Export as {currentTab?.label}
                </h3>
                <p className="text-sm text-muted-foreground/40 max-w-md mb-6">
                  Exports the entire ERD canvas as a{' '}
                  {activeTab === 'pdf' ? 'PDF document' : 'SVG image'}.
                  This feature generates a visual representation of all tables and
                  relationships as they appear on the canvas.
                </p>
                <Button
                  onClick={activeTab === 'pdf' ? onExportPDF : onExportImage}
                  className="h-10 px-6 bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-2"
                >
                  <Download className="w-4 h-4" />
                  Generate {currentTab?.label}
                </Button>
              </div>
            )}
          </DialogBody>

          {isSchemaTab && (
            <DialogFooter className="border-t border-border p-4 bg-muted/20 gap-3">
              <div className="flex items-center gap-2 mr-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadFile}
                  disabled={isDownloading}
                  className="h-9 px-4 border-border hover:bg-muted bg-muted/50 text-xs font-semibold"
                >
                  {isDownloading ? (
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-2" />
                  )}
                  {isSingleFile ? 'Download' : 'Download .zip'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                  disabled={!isSingleFile}
                  className="h-9 px-4 border-border hover:bg-muted bg-muted/50 text-xs font-semibold min-w-[90px] disabled:opacity-30 disabled:cursor-not-allowed"
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
          )}
      </DialogContent>
    </Dialog>
  );
};
