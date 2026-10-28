import { Eye } from 'lucide-react';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { readOnlyNotice } from '@/lib/fileOwnership';
import { Button } from './ui/button';

/** Access notice shown inside the pane of a file the user cannot edit, whichever pane has focus (BUG-023). */
export function ReadOnlyFileNotice() {
  const { activeDocument, isReadOnlyFile, getFileAccessRole, handleDuplicate, isGuest, isPublicView, view } = useWorkspace();
  if (isPublicView || !activeDocument || !isReadOnlyFile(activeDocument)) return null;
  const notice = readOnlyNotice(getFileAccessRole(activeDocument), activeDocument.user?.name || activeDocument.user?.email || 'another member');
  if (!notice) return null;
  const split = notice.indexOf(' · ');
  const label = notice.slice(0, split);
  const detail = notice.slice(split + 3);
  // Duplication exists for Notes and Drawings only; elsewhere the action just reports that it is disabled.
  const canDuplicate = !isGuest && (view === 'notes' || view === 'drawings');
  return <div role="status" className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
    <Eye className="size-3.5 shrink-0" aria-hidden="true" />
    <p className="min-w-0 flex-1"><span className="font-medium text-foreground">{label}</span> · {detail}</p>
    {canDuplicate && <Button type="button" variant="ghost" size="xs" onClick={handleDuplicate}>Duplicate to edit</Button>}
  </div>;
}
