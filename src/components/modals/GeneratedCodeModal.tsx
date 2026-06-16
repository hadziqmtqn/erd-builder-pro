import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download } from 'lucide-react';
import { Entity } from '../../types';
import {
  generateMySQL,
  generatePostgreSQL,
  generateLaravelMigration,
  generateTypeScript,
  generatePrisma,
  generateLaravelModel,
  generateZod
} from '../../lib/sql-generator';

interface GeneratedCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity | null;
}

export const GeneratedCodeModal = ({
  open,
  onOpenChange,
  entity,
}: GeneratedCodeModalProps) => {
  const [activeTab, setActiveTab] = React.useState<string>('mysql');
  const [copied, setCopied] = React.useState(false);

  if (!entity) return null;

  const generatedCode = React.useMemo(() => {
    return {
      mysql: generateMySQL(entity),
      postgresql: generatePostgreSQL(entity),
      laravel_migration: generateLaravelMigration(entity),
      laravel_model: generateLaravelModel(entity),
      typescript: generateTypeScript(entity),
      prisma: generatePrisma(entity),
      zod: generateZod(entity),
    };
  }, [entity]);

  const currentCode = (generatedCode as Record<string, string>)[activeTab];
  
  const getLanguage = (tab: string) => {
    if (tab === 'typescript' || tab === 'zod') return 'typescript';
    if (tab === 'prisma') return 'prisma';
    if (tab.startsWith('laravel')) return 'php';
    return 'sql';
  };

  const currentLanguage = getLanguage(activeTab);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    const extMap: Record<string, string> = {
      typescript: 'ts',
      zod: 'ts',
      prisma: 'prisma',
      laravel_migration: 'php',
      laravel_model: 'php',
      mysql: 'sql',
      postgresql: 'sql'
    };
    const extension = extMap[activeTab] || 'sql';
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-5xl bg-popover border-border text-popover-foreground shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-6 pt-6 pb-0 border-b border-border">
            <DialogTitle className="text-xl font-bold tracking-tight">Generate Code Schema</DialogTitle>
            <div className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-widest mt-1">
              Table: {entity.name}
            </div>
            
            <div className="flex gap-1 bg-muted border border-border rounded-lg p-1 w-fit">
              {[
                { id: 'mysql', label: 'MySQL' },
                { id: 'postgresql', label: 'PostgreSQL' },
                { id: 'laravel_migration', label: 'Laravel Migration' },
                { id: 'laravel_model', label: 'Laravel Model' },
                { id: 'typescript', label: 'TypeScript' },
                { id: 'prisma', label: 'Prisma' },
                { id: 'zod', label: 'Zod' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </DialogHeader>
          
          <DialogBody className="p-0 bg-muted relative flex-1 min-h-0 overflow-y-auto">
            <div className="absolute top-4 right-6 px-2 py-1 rounded bg-muted/50 border border-border text-[10px] font-mono text-muted-foreground/20 uppercase tracking-widest z-10">
              {currentLanguage}
            </div>
            
            <pre className="p-6 overflow-auto h-full text-[13px] font-mono leading-relaxed custom-scrollbar selection:bg-primary/40">
              <code className="text-foreground/90 block">{currentCode}</code>
            </pre>
          </DialogBody>

          <DialogFooter className="border-t border-border p-4 bg-muted/20 gap-3">
            <div className="flex items-center gap-2 mr-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadFile}
                className="h-9 px-4 border-border hover:bg-muted bg-muted/50 text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
                className="h-9 px-4 border-border hover:bg-muted bg-muted/50 text-xs font-semibold min-w-[90px]"
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
