import { useCallback } from 'react';
import { toast } from 'sonner';
import { getMarkdownFromHtml, copyMarkdownToClipboard } from '../lib/markdownUtils';
import { NoteImporter } from '../lib/importers/note-importer';

interface FileOperationsProps {
  activeNote: any;
  activeNoteUid: number | string | null;
  activeProjectId: number | string | null;
  createNote: (title: string, projectId: number | string | null) => Promise<any>;
  saveNote: (note: any) => Promise<any>;
  setActiveNoteUid: (uid: string | null) => void;
  handleNoteChange: (content: string) => void;
  setIsExportNoteModalOpen: (open: boolean) => void;
  setIsImportNoteModalOpen: (open: boolean) => void;
}

export const useFileOperations = ({
  activeNote,
  activeNoteUid,
  activeProjectId,
  createNote,
  saveNote,
  setActiveNoteUid,
  handleNoteChange,
  setIsExportNoteModalOpen,
  setIsImportNoteModalOpen,
}: FileOperationsProps) => {
  const handleExportMarkdown = useCallback(() => {
    setIsExportNoteModalOpen(true);
  }, [setIsExportNoteModalOpen]);

  const handleImportMarkdown = useCallback(() => {
    setIsImportNoteModalOpen(true);
  }, [setIsImportNoteModalOpen]);

  const handleCopyMarkdown = useCallback(async () => {
    if (activeNote) {
      await copyMarkdownToClipboard(activeNote.content);
    }
  }, [activeNote]);

  const executeExportMarkdown = useCallback(() => {
    if (!activeNote) return;
    
    const markdown = getMarkdownFromHtml(activeNote.content);
    const fileName = `${(activeNote.title || 'Note').replace(/\s+/g, '_').toLowerCase()}.md`;
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Note exported to Markdown");
  }, [activeNote]);

  const executeImportMarkdown = useCallback(async (file: File) => {
    const toastId = toast.loading(`Importing ${file.name}...`);
    try {
      let html = '';
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'docx') {
        html = await NoteImporter.convertDocxToHtml(file);
      } else {
        html = await NoteImporter.convertMarkdownToHtml(file);
      }
      
      if (!activeNoteUid) {
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const newNote = await createNote(baseName, activeProjectId === 'all' ? null : activeProjectId);
        if (newNote) {
          await saveNote({ ...newNote, content: html });
          setActiveNoteUid(newNote.uid);
          toast.success(`Created new note from ${file.name}`, { id: toastId });
        }
      } else {
        const currentContent = activeNote?.content || '';
        const separator = currentContent ? '<p></p>' : '';
        const newContent = currentContent + separator + html;
        
        handleNoteChange(newContent);
        toast.success(`${file.name} imported successfully`, { id: toastId });
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to import file", { id: toastId });
    }
  }, [activeNoteUid, activeNote, activeProjectId, createNote, saveNote, setActiveNoteUid, handleNoteChange]);

  return {
    handleExportMarkdown,
    handleImportMarkdown,
    handleCopyMarkdown,
    executeExportMarkdown,
    executeImportMarkdown,
  };
};
