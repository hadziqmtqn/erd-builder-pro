import { useCallback } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { localPersistence } from '@/lib/localPersistence';
import { DraftType } from '@/types';
import { useWorkspace } from '@/providers/WorkspaceContext';

type CommentRequest = { id: string; beforeContent: string; content: string };

function normalizeNoteHtml(html: string) {
  return html.replace(/\s*class=""\s*/g, '').replace(/<p><\/p>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizePrivateAssetUrls(html: string) {
  return html.replace(/(\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (whole, prefix, value, suffix) => {
    try {
      const url = value.replace(/&amp;/gi, '&');
      const parsed = new URL(url, window.location.origin);
      const keyStart = parsed.pathname.indexOf('erd-builder-pro/');
      if (!parsed.pathname.includes('/api/serve/') && !parsed.searchParams.has('X-Amz-Signature')) return whole;
      if (keyStart < 0) return whole;
      return `${prefix}/api/serve/${parsed.pathname.slice(keyStart)}${suffix}`;
    } catch {
      return whole;
    }
  });
}

async function sha256Hex(value: string) {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

interface UseNoteCommentPersistenceParams {
  noteUid: string | null;
  note: any;
  isReadOnly: boolean;
  handleNoteChange: (content: string) => void;
  saveNote: (note: any, options?: { syncPending?: boolean }) => Promise<boolean | void>;
}

export function useNoteCommentPersistence({ noteUid, note, isReadOnly, handleNoteChange, saveNote }: UseNoteCommentPersistenceParams) {
  const { projects, isGuest, syncDrafts, cancelPendingNoteSaves } = useWorkspace();
  const projectId = note?.project_id ?? note?.projectId;
  const project = projects.find(item => String(item.id) === String(projectId) || String(item.uid) === String(projectId));
  const enabled = !isGuest && !isReadOnly && Boolean(project?.team_id ?? project?.teamId);

  const persistCommentAnchor = useCallback(async ({ id, beforeContent, content }: CommentRequest) => {
    if (!enabled || !noteUid || !note) return false;

    const baseline = String(note.content ?? '');
    if (normalizeNoteHtml(beforeContent) !== normalizeNoteHtml(baseline)) {
      handleNoteChange(beforeContent);
      toast.info('Simpan perubahan Note sebelum menambahkan komentar.');
      return false;
    }

    cancelPendingNoteSaves();
    try {
      const draftId = note.uid || note.id || noteUid;
      if (await localPersistence.hasPendingSync(DraftType.NOTES, draftId)) {
        void syncDrafts();
        toast.info('Sinkronisasi Note sedang berjalan. Coba lagi setelah selesai.');
        return false;
      }

      const versionBaseline = normalizePrivateAssetUrls(baseline);
      const contentVersion = window.crypto?.subtle
        ? { expectedContentHash: await sha256Hex(versionBaseline) }
        : { expectedContent: versionBaseline };
      const response = await apiFetch(`/api/notes/${noteUid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, ...contentVersion }),
      });

      if (response.status === 409) {
        toast.error('Note berubah di sesi lain. Muat ulang sebelum menambahkan komentar.');
        return false;
      }
      if (!response.ok) {
        toast.error('Tidak dapat menyimpan anchor komentar pada Note.');
        return false;
      }

      const saved = await saveNote({ ...note, content }, { syncPending: false });
      if (saved === false) toast.error('Anchor tersimpan di server, tetapi cache lokal gagal diperbarui.');
      window.dispatchEvent(new CustomEvent('project-comment-open-request', {
        detail: { featureType: 'note', fileId: String(noteUid), type: 'block', id },
      }));
      return true;
    } catch {
      toast.error('Tidak dapat menambahkan komentar ke Note.');
      return false;
    }
  }, [cancelPendingNoteSaves, enabled, handleNoteChange, note, noteUid, saveNote, syncDrafts]);

  return enabled ? persistCommentAnchor : undefined;
}
