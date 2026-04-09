import React, { useState } from 'react';
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

interface ImportSQLModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (nodes: any[], edges: any[]) => void;
}

export function ImportSQLModal({ isOpen, onOpenChange, onImport }: ImportSQLModalProps) {
  const [sql, setSql] = useState('');

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
          <DialogTitle>Import SQL (Reverse Engineering)</DialogTitle>
          <DialogDescription>
            Paste your SQL <code className="text-[10px] bg-muted px-1 rounded">CREATE TABLE</code> statements below to automatically generate ERD nodes.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <Textarea 
              placeholder="CREATE TABLE users (&#10;  id SERIAL PRIMARY KEY,&#10;  email VARCHAR(255) NOT NULL&#10;);" 
              className="min-h-[300px] font-mono text-xs leading-relaxed"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground italic">
              * Supports PostgreSQL and MySQL syntax. Ensure each statement ends with a semicolon (;).
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={!sql.trim()}>Process SQL</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
