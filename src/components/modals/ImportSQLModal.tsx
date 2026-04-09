import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseSQLToERD } from '@/lib/sqlParser';
import { toast } from 'sonner';
import { FileCode, Upload, AlertCircle } from 'lucide-react';

interface ImportSQLModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (nodes: any[], edges: any[]) => void;
}

export function ImportSQLModal({ isOpen, onOpenChange, onImport }: ImportSQLModalProps) {
  const [sql, setSql] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.sql')) {
      setError("Invalid file format. Please upload a .sql file.");
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSql(content);
      toast.success(`Successfully loaded ${file.name}`);
    };
    reader.readAsText(file);
    
    // Reset input value so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = () => {
    if (!sql.trim()) return;
    
    try {
      const { nodes, edges } = parseSQLToERD(sql);
      if (nodes.length === 0) {
        toast.error("No valid CREATE TABLE statements found.");
        return;
      }
      
      onImport(nodes, edges);
      toast.success(`Successfully imported ${nodes.length} tables!`);
      setSql('');
      setError(null);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to parse SQL. Check your syntax.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle>Import SQL (Reverse Engineering)</DialogTitle>
              <DialogDescription>
                Paste your SQL or upload a <code className="text-[10px] bg-muted px-1 rounded">.sql</code> file below.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SQL Schema Editor</label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs font-bold border-dashed border-primary/50 hover:border-primary hover:bg-primary/5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3 h-3 mr-2" />
                  Upload .sql File
                </Button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".sql" 
                  onChange={handleFileChange} 
                />
              </div>

              <Textarea 
                placeholder="CREATE TABLE users (&#10;  id SERIAL PRIMARY KEY,&#10;  email VARCHAR(255) NOT NULL&#10;);" 
                className="min-h-[300px] font-mono text-xs leading-relaxed focus-visible:ring-primary shadow-inner"
                value={sql}
                onChange={(e) => {
                  setSql(e.target.value);
                  if (error) setError(null);
                }}
              />

              {error && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[11px] animate-in fade-in slide-in-from-top-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {error}
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground italic bg-muted/30 p-2 rounded-md border border-border/50">
              * Supports PostgreSQL and MySQL syntax. Ensure each statement ends with a semicolon (;).
            </p>
          </div>
        </DialogBody>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-xs font-semibold">Cancel</Button>
          <Button onClick={handleImport} disabled={!sql.trim()} className="text-xs font-bold shadow-lg shadow-primary/20">
            <FileCode className="w-3.5 h-3.5 mr-2" />
            Process SQL Schema
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
