import { useState, useEffect } from 'react';
import { apiFetch } from "@/lib/api";
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  Database,
  Download,
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
  Lock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Folder,
  FolderOpen,
  RotateCcw,
  Pencil,
  Check,
  X
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
import { Input } from "@/components/ui/input";
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

interface BackupFolderSettings {
  customFolder: string | null;
  defaultFolder: string;
  effectiveFolder: string;
}

const ITEMS_PER_PAGE = 10;

export const BackupsView = () => {
  const { user } = useAuth();
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Backup folder settings
  const [folderSettings, setFolderSettings] = useState<BackupFolderSettings | null>(null);
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [folderDraft, setFolderDraft] = useState('');
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  const isTauri = typeof window !== 'undefined' &&
    !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

  const fetchBackups = async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      const offset = page * ITEMS_PER_PAGE;
      const res = await apiFetch(`/api/backups?limit=${ITEMS_PER_PAGE}&offset=${offset}`);
      
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
      fetchFolderSettings();
    }
  }, [page, user]);

  const fetchFolderSettings = async () => {
    try {
      const res = await apiFetch('/api/backups/settings/folder');
      if (res.ok) {
        const json = await res.json();
        setFolderSettings(json);
      }
    } catch (error) {
      console.error('Failed to fetch folder settings:', error);
    }
  };

  const startEditFolder = () => {
    // Pre-fill with the current active path (custom if set, else default)
    // so the user edits from where they are, not from scratch.
    setFolderDraft(folderSettings?.effectiveFolder ?? folderSettings?.defaultFolder ?? '');
    setIsEditingFolder(true);
  };

  const cancelEditFolder = () => {
    setIsEditingFolder(false);
    setFolderDraft('');
  };

  const browseForFolder = async () => {
    if (!isTauri) return;
    setIsPickingFolder(true);
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select backup folder',
        defaultPath: folderDraft || folderSettings?.effectiveFolder || undefined,
      });
      if (typeof selected === 'string' && selected) {
        setFolderDraft(selected);
      }
    } catch (err) {
      console.error('Failed to open folder picker:', err);
      toast.error('Failed to open folder picker');
    } finally {
      setIsPickingFolder(false);
    }
  };

  const saveFolder = async (folder: string | null) => {
    setIsSavingFolder(true);
    try {
      const res = await apiFetch('/api/backups/settings/folder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      });
      if (res.ok) {
        const json = await res.json();
        setFolderSettings(json);
        setIsEditingFolder(false);
        toast.success(
          folder
            ? 'Backup folder updated.'
            : 'Backup folder reset to default.'
        );
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update folder');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update folder');
    } finally {
      setIsSavingFolder(false);
    }
  };

  const handleDownload = (backup: BackupRecord) => {
    if (backup.status !== 'completed' || !backup.file_path) return;

    // Trigger download (sama tab, tanpa flicker tab baru)
    window.location.href = `/api/backups/${backup.id}/download`;

    // The server serves the file from the user's configured backup folder.
    // In a regular browser the file is then re-saved to the OS Downloads dir;
    // in Tauri the WebView keeps the Content-Disposition path but the OS
    // download manager may still relocate it. Either way, the file's
    // canonical location is the server-side backup folder.
    const targetDir = folderSettings?.effectiveFolder;
    const filename = `${backup.name}.sql.gz`;
    const description = targetDir
      ? `File saved to ${targetDir}/${filename}`
      : 'File downloaded to your browser.';

    toast.success(`Backup "${backup.name}" downloaded successfully.`, {
      description,
      duration: 6000,
    });
  };

  const handleCreateBackup = async () => {
    if (!user) {
      toast.error("You must be logged in to create a backup");
      return;
    }

    setIsCreating(true);
    try {
      const name = `Backup_${format(new Date(), 'yyyyMMdd_HHmm')}`;
      
      const res = await apiFetch('/api/backups', {
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

      {/* Storage location panel */}
      <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
        {isEditingFolder ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Folder className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-foreground/80">Set backup folder</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                placeholder="Target folder path (e.g. /Users/john/Documents/Backups)"
                className="h-8 text-xs font-mono"
                disabled={isSavingFolder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveFolder(folderDraft.trim() || null);
                  if (e.key === 'Escape') cancelEditFolder();
                }}
                autoFocus
              />
              {isTauri && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={browseForFolder}
                  disabled={isSavingFolder || isPickingFolder}
                  className="h-8 px-2.5 text-xs shrink-0"
                  title="Browse for folder"
                >
                  {isPickingFolder ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                      Browse
                    </>
                  )}
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => void saveFolder(folderDraft.trim() || null)}
                disabled={isSavingFolder}
                className="h-8 px-3 text-xs shrink-0"
                title="Save"
              >
                {isSavingFolder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEditFolder}
                disabled={isSavingFolder}
                className="h-8 px-2 text-xs shrink-0"
                title="Cancel"
              >
                Cancel
              </Button>
            </div>
            {folderSettings?.defaultFolder && folderDraft !== folderSettings.defaultFolder && (
              <p className="text-[11px] text-muted-foreground">
                Default location: <code className="text-[11px] font-mono">{folderSettings.defaultFolder}</code>
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                <Folder className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium text-foreground/80">Storage location</span>
                {folderSettings?.customFolder && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                    Custom
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={startEditFolder}
                  className="h-7 px-2 text-xs"
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  Change
                </Button>
                {folderSettings?.customFolder && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void saveFolder(null)}
                    disabled={isSavingFolder}
                    className="h-7 px-2 text-xs"
                    title="Reset to default"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
            </div>
            <code
              className="text-xs font-mono text-foreground/80 break-all pl-5"
              title={folderSettings?.effectiveFolder}
            >
              {folderSettings?.effectiveFolder || 'Loading…'}
            </code>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 h-0 overflow-y-auto custom-scrollbar">
        <div className="p-6">
          {loading && backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
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
