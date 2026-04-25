import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  Plus, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Lock,
  Calendar
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

interface BackupRecord {
  id: string;
  name: string;
  download_url: string;
  created_at: string;
  status: 'pending' | 'completed' | 'failed';
  file_size: number | null;
}

interface DatabaseBackupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DatabaseBackupModal = ({ open, onOpenChange }: DatabaseBackupModalProps) => {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('backups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBackups(data || []);
    } catch (error: any) {
      toast.error("Failed to load backup history");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchBackups();
    }
  }, [open]);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to create a backup");
        return;
      }

      const name = `Backup_${format(new Date(), 'yyyyMMdd_HHmm')}`;
      
      const { error } = await supabase
        .from('backups')
        .insert([{
          user_id: user.id,
          name: name,
          status: 'pending'
        }]);

      if (error) throw error;
      
      toast.success("Backup process started in the background");
      fetchBackups();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-[#0f0f14] border-white/10 text-white shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-6 border-b border-white/5">
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <Database className="w-6 h-6 text-primary" />
              Database Backup History
            </DialogTitle>
            <DialogDescription className="text-white/40 text-sm text-left">
              Manage your database backups and disaster recovery records.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="p-0 max-h-[500px] overflow-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-white/40 text-sm">Loading history...</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <Clock className="w-6 h-6 text-white/20" />
              </div>
              <div className="text-center">
                <p className="text-white/80 font-medium">No backups yet</p>
                <p className="text-white/40 text-xs mt-1">Start your first backup to secure your data.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-white/[0.02] sticky top-0 z-10 backdrop-blur-md">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-white/40 font-bold uppercase text-[10px] tracking-widest pl-6">Name</TableHead>
                  <TableHead className="text-white/40 font-bold uppercase text-[10px] tracking-widest text-center">Size</TableHead>
                  <TableHead className="text-white/40 font-bold uppercase text-[10px] tracking-widest text-center">Status</TableHead>
                  <TableHead className="text-white/40 font-bold uppercase text-[10px] tracking-widest text-center">Date</TableHead>
                  <TableHead className="text-white/40 font-bold uppercase text-[10px] tracking-widest text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((backup) => (
                  <TableRow key={backup.id} className="border-white/5 hover:bg-white/[0.02] transition-colors">
                    <TableCell className="font-medium pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <Database className="w-4 h-4 text-primary" />
                        </div>
                        <span className="truncate max-w-[200px]">{backup.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs text-white/60">
                      {formatFileSize(backup.file_size)}
                    </TableCell>
                    <TableCell className="text-center">
                      {backup.status === 'completed' && (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1.5 py-0.5">
                          <CheckCircle2 className="w-3 h-3" />
                          Completed
                        </Badge>
                      )}
                      {backup.status === 'pending' && (
                        <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1.5 py-0.5">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Pending
                        </Badge>
                      )}
                      {backup.status === 'failed' && (
                        <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1.5 py-0.5">
                          <XCircle className="w-3 h-3" />
                          Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-white/60 text-xs">
                      <div className="flex flex-col items-center">
                        <span className="font-medium">{format(new Date(backup.created_at), 'MMM dd, yyyy')}</span>
                        <span className="text-[10px] opacity-60 uppercase">{format(new Date(backup.created_at), 'HH:mm')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      {backup.download_url ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-primary hover:text-primary hover:bg-primary/10 transition-all font-bold text-[11px]"
                          onClick={() => window.open(backup.download_url, '_blank')}
                        >
                          <Download className="w-3.5 h-3.5 mr-2" />
                          Download
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          className="h-8 px-3 text-white/20 text-[11px] font-bold"
                        >
                          <Lock className="w-3.5 h-3.5 mr-2" />
                          Locked
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-white/5 p-4 bg-black/20 gap-3">
          <p className="text-[10px] text-white/20 mr-auto flex items-center gap-1.5 uppercase font-bold tracking-wider">
            <Lock className="w-3 h-3" />
            Downloads are protected by signed URLs
          </p>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="h-9 px-6 border-white/10 hover:bg-white/5 bg-white/5 text-xs font-bold"
            >
              Close
            </Button>
            <Button 
              onClick={handleCreateBackup} 
              disabled={isCreating}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-9 px-6 text-xs"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create Backup
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
