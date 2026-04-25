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
import { Copy, Check, Download, Database } from 'lucide-react';
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
import { cn } from '@/lib/utils';

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

  const currentCode = (generatedCode as any)[activeTab];
  
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
        className="max-w-5xl bg-[#0f0f14] border-white/10 text-white shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 border-b border-white/5">
            <DialogTitle className="text-xl font-bold tracking-tight">Generate Code Schema</DialogTitle>
            <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
              Table: {entity.name}
            </div>
            
            <TabsList variant="line" className="mt-4 flex-nowrap overflow-x-auto custom-scrollbar scrollbar-hide pb-0">
              <TabsTrigger value="mysql" data-variant="line">MySQL</TabsTrigger>
              <TabsTrigger value="postgresql" data-variant="line">PostgreSQL</TabsTrigger>
              <TabsTrigger value="laravel_migration" data-variant="line">Laravel Migration</TabsTrigger>
              <TabsTrigger value="laravel_model" data-variant="line">Laravel Model</TabsTrigger>
              <TabsTrigger value="typescript" data-variant="line">TypeScript</TabsTrigger>
              <TabsTrigger value="prisma" data-variant="line">Prisma</TabsTrigger>
              <TabsTrigger value="zod" data-variant="line">Zod</TabsTrigger>
            </TabsList>
          </DialogHeader>
          
          <div className="p-0 overflow-hidden bg-[#050508] relative">
            <div className="absolute top-4 right-6 px-2 py-1 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-white/20 uppercase tracking-widest z-10">
              {currentLanguage}
            </div>
            
            {Object.entries(generatedCode).map(([key, code]) => (
              <TabsContent key={key} value={key} className="mt-0">
                <pre className="p-6 overflow-auto max-h-[600px] text-[13px] font-mono leading-relaxed custom-scrollbar selection:bg-primary/40">
                  <code className="text-white/90 block">{code}</code>
                </pre>
              </TabsContent>
            ))}
          </div>
        </Tabs>

        <DialogFooter className="border-t border-white/5 p-4 bg-black/20 gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadFile}
              className="h-9 px-4 border-white/10 hover:bg-white/5 bg-white/5 text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5 mr-2" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              className="h-9 px-4 border-white/10 hover:bg-white/5 bg-white/5 text-xs font-semibold min-w-[90px]"
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
            className="h-9 px-6 bg-white text-black hover:bg-white/90 font-bold"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
