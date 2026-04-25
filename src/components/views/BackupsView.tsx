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
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
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
import { useAuth } from '@/hooks/useAuth';

interface BackupRecord {
  id: string;
  name: string;
  download_url: string;
  file_path?: string;
  created_at: string;
  status: 'pending' | 'completed' | 'failed';
  file_size: number | null;
}

const ITEMS_PER_PAGE = 10;

export const BackupsView = () => {
  const { user } = useAuth();
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchBackups = async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      const offset = page * ITEMS_PER_PAGE;
      const res = await fetch(`/api/backups?limit=${ITEMS_PER_PAGE}&offset=${offset}`);
      
      if (res.ok) {
        const json = await res.json();
        setBackups(json.data || []);
        setTotalCount(json.total || 0);
      } else {
        throw new Error("Failed to fetch backups");
      }
    } catch (error: any) {
      toast.error("Failed to load backup history");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBackups();
    }
  }, [page, user]);

  const handleDownload = (backup: BackupRecord) => {
    if (backup.status !== 'completed' || !backup.file_path) return;
    
    // Trigger download di tab yang sama tanpa flicker tab baru
    window.location.href = `/api/backups/${backup.id}/download`;
  };

  const handleCreateBackup = async () => {
    if (!user) {
      toast.error("You must be logged in to create a backup");
      return;
    }

    setIsCreating(true);
    try {
      const name = `Backup_${format(new Date(), 'yyyyMMdd_HHmm')}`;
      
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        toast.success("Backup process started in the background");
        if (page === 0) {
          fetchBackups();
        } else {
          setPage(0);
        }
      } else {
        const err = await res.json();
        throw new Error(err.error || "Failed to create backup");
      }
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

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="flex-1 flex flex-col min-h-0 border rounded-xl bg-background overflow-hidden">
      {/* Header Area */}
      <div className="p-6 border-b shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Database size={24} className="text-muted-foreground" />
            Database Backup
          </h2>
          <p className="text-sm text-muted-foreground">Manage your database backups and disaster recovery records.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBackups}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            onClick={handleCreateBackup} 
            disabled={isCreating}
            size="sm"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Create Backup
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 h-0 overflow-y-auto custom-scrollbar">
        <div className="p-6">
          {loading && backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin opacity-50" />
              <p className="text-sm font-medium text-muted-foreground">Loading backup history...</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-24 border rounded-lg border-dashed text-muted-foreground flex flex-col items-center gap-4">
              <Database size={40} className="opacity-20" />
              <div>
                <p className="font-medium">No backups found</p>
                <p className="text-sm">Start your first backup to secure your data.</p>
              </div>
              <Button 
                variant="outline"
                size="sm"
                onClick={handleCreateBackup}
              >
                Start Backup
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="pl-6">Backup Name</TableHead>
                    <TableHead className="text-center">Size</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Date</TableHead>
                    <TableHead className="text-right pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.map((backup) => (
                    <TableRow key={backup.id} className="group">
                      <TableCell className="font-medium pl-6">
                        <div className="flex items-center gap-2">
                          <Database size={14} className="text-muted-foreground" />
                          {backup.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {formatFileSize(backup.file_size)}
                      </TableCell>
                      <TableCell className="text-center">
                        {backup.status === 'completed' && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 gap-1.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </Badge>
                        )}
                        {backup.status === 'pending' && (
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Processing
                          </Badge>
                        )}
                        {backup.status === 'failed' && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1.5">
                            <XCircle className="w-3 h-3" />
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {format(new Date(backup.created_at), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`h-8 w-8 ${backup.status === 'completed' && backup.file_path ? 'text-primary hover:text-primary hover:bg-primary/10' : 'text-muted-foreground opacity-50'}`}
                            disabled={backup.status !== 'completed' || !backup.file_path}
                            onClick={() => handleDownload(backup)}
                            title={
                              backup.status !== 'completed' ? 'Backup still in progress...' : 
                              !backup.file_path ? 'File path not recorded' : 
                              'Download backup'
                            }
                          >
                            {backup.status === 'completed' && backup.file_path ? (
                              <Download className="h-3.5 w-3.5" />
                            ) : (
                              <Lock className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalCount > ITEMS_PER_PAGE && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {page * ITEMS_PER_PAGE + 1} to {Math.min((page + 1) * ITEMS_PER_PAGE, totalCount)} of {totalCount} records
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || loading}
                  onClick={() => setPage(p => p - 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft size={16} />
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                    let pageNum = i;
                    if (totalPages > 5 && page > 2) {
                      pageNum = page - 2 + i;
                      if (pageNum >= totalPages) pageNum = totalPages - 5 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className="h-8 w-8 p-0 text-xs"
                      >
                        {pageNum + 1}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1 || loading}
                  onClick={() => setPage(p => p + 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
