import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress, ProgressValue } from "@/components/ui/progress";
import {
  AlertTriangle,
  Database,
  ShieldCheck,
  Check,
  Copy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export interface RestoreProgress {
  phase: "pre-restore" | "decompress" | "replace" | "cleanup";
  percent: number;
  message: string;
}

interface RestoreBackupDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The backup to restore (with name + dates for display) */
  backup: {
    id: string;
    name: string;
    created_at: string;
  } | null;
  /** Called when the user confirms. Receives progress events via the
   *  callback and should resolve with the final result on success or
   *  throw on failure. */
  onConfirm: (onProgress: (event: RestoreProgress) => void) => Promise<{
    auto_backup_id: string;
    auto_backup_name: string;
  }>;
  /** Optional: called with the auto-backup name when restore succeeds, for toast */
  onSuccess?: (result: { auto_backup_id: string; auto_backup_name: string }) => void;
}

const PHASE_LABELS: Record<RestoreProgress["phase"], string> = {
  "pre-restore": "Creating safety backup",
  decompress: "Decompressing backup",
  replace: "Replacing database",
  cleanup: "Cleaning up",
};

const PHASE_ORDER: RestoreProgress["phase"][] = [
  "pre-restore",
  "decompress",
  "replace",
  "cleanup",
];

/**
 * Destructive confirmation dialog for restoring a database backup.
 *
 * Requires the user to type the exact backup name to enable the confirm
 * button — the same UX pattern as GitHub/GitLab destructive branch ops.
 *
 * Once the user confirms, the dialog switches to a step-list view with
 * a live progress bar driven by NDJSON events streamed from the server.
 *
 * Notes on the flow:
 * - The server creates a `PreRestore_xxx` auto-backup BEFORE replacing
 *   the database, so this is non-destructive: if the restore goes wrong,
 *   the user can roll back by restoring the pre-restore backup.
 * - The user might need to re-login if the restored user table no longer
 *   contains the current user (we surface this in the dialog copy).
 */
export const RestoreBackupDialog: React.FC<RestoreBackupDialogProps> = ({
  isOpen,
  onOpenChange,
  backup,
  onConfirm,
  onSuccess,
}) => {
  const [confirmInput, setConfirmInput] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [nameCopied, setNameCopied] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens/closes + auto-focus the input
  useEffect(() => {
    if (isOpen) {
      setConfirmInput("");
      setIsRestoring(false);
      setNameCopied(false);
      setProgress(null);
      // Small delay so the dialog mounts first, then focus the input
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!backup) return null;

  const nameMatches = confirmInput.trim() === backup.name.trim();
  const canConfirm = nameMatches && !isRestoring;

  const copyBackupName = async () => {
    try {
      await navigator.clipboard.writeText(backup.name);
      setNameCopied(true);
      setTimeout(() => setNameCopied(false), 2000);
    } catch {
      toast.error("Failed to copy backup name");
    }
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsRestoring(true);
    setProgress({ phase: "pre-restore", percent: 0, message: "Starting..." });
    try {
      const result = await onConfirm((event) => setProgress(event));
      onSuccess?.(result);
      onOpenChange(false);
    } catch {
      // Keep the dialog open so the user can retry or cancel.
      // The caller is expected to show its own error toast.
    } finally {
      setIsRestoring(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canConfirm) {
      e.preventDefault();
      void handleConfirm();
    }
  };

  const formattedDate = new Date(backup.created_at).toLocaleString();
  const currentPhaseIdx = progress
    ? PHASE_ORDER.indexOf(progress.phase)
    : -1;

  return (
    <Dialog open={isOpen} onOpenChange={isRestoring ? undefined : onOpenChange}>
      <DialogContent size="md" showCloseButton={!isRestoring}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-md bg-destructive/10 shrink-0">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div className="min-w-0">
              <DialogTitle>
                {isRestoring ? "Restoring database..." : "Restore database from this backup?"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {isRestoring
                  ? `Replacing your database with the contents of "${backup.name}". Do not close this window.`
                  : "This will replace your entire database with the contents of this backup. Current data will be lost."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          {!isRestoring ? (
            <div className="space-y-4">
              {/* Safety net callout */}
              <div className="flex items-start gap-2.5 p-3 rounded-md bg-green-500/5 border border-green-500/20">
                <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-500 mt-0.5 shrink-0" />
                <div className="text-xs leading-relaxed">
                  <p className="font-medium text-foreground">A safety backup will be created first</p>
                  <p className="text-muted-foreground mt-0.5">
                    Before restoring, the server automatically backs up your current database so
                    you can roll back if something goes wrong.
                  </p>
                </div>
              </div>

              {/* Backup being restored */}
              <div className="flex items-start gap-2.5 p-3 rounded-md bg-muted/50 border">
                <Database className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-xs min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{backup.name}</p>
                  <p className="text-muted-foreground mt-0.5">Created {formattedDate}</p>
                </div>
              </div>

              {/* Re-login warning */}
              <div className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Note:</strong> if the restored database no longer
                contains your user account, you'll be asked to log in again. Any unsaved changes in
                the app will be lost.
              </div>

              {/* Type-to-confirm input */}
              <div className="space-y-1.5">
                <label htmlFor="restore-confirm" className="text-xs font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                  <span>Type</span>
                  <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded break-all">
                    {backup.name}
                  </code>
                  <span>to confirm</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void copyBackupName()}
                    disabled={isRestoring}
                    className="h-5 w-5 ml-0.5 text-muted-foreground hover:text-foreground"
                    title="Copy backup name"
                  >
                    {nameCopied ? (
                      <Check className="w-3 h-3 text-green-600" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span className="sr-only">Copy backup name</span>
                  </Button>
                </label>
                <Input
                  id="restore-confirm"
                  ref={inputRef}
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={backup.name}
                  disabled={isRestoring}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-xs"
                />
                {confirmInput.length > 0 && !nameMatches && (
                  <p className="text-[11px] text-destructive">
                    Name doesn't match. Type it exactly as shown above.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* ── In-progress: step list + progress bar ── */
            <div className="space-y-4">
              <div className="space-y-2">
                {PHASE_ORDER.map((phase, idx) => {
                  const isDone = currentPhaseIdx > idx || (currentPhaseIdx === idx && progress?.percent === 100);
                  const isActive = currentPhaseIdx === idx && progress?.percent !== 100;
                  const isPending = currentPhaseIdx < idx;
                  return (
                    <div key={phase} className="flex items-center gap-2.5 text-xs">
                      <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        {isDone && <Check className="w-4 h-4 text-green-600" />}
                        {isActive && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                        {isPending && <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />}
                      </div>
                      <span className={`flex-1 ${isDone ? "text-foreground" : isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {PHASE_LABELS[phase]}
                      </span>
                      {(isActive || isDone) && (
                        <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                          {isDone ? "100%" : `${progress?.percent ?? 0}%`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Progress value={progress?.percent ?? 0}>
                  <span className="text-zinc-500 truncate">{progress?.message ?? "Initializing..."}</span>
                  <ProgressValue value={progress?.percent ?? 0} />
                </Progress>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRestoring}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
          >
            <Database className="w-4 h-4 mr-2" />
            Restore Database
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
