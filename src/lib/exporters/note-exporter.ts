import { pdf } from '@react-pdf/renderer';
import { Packer } from 'docx';
import { Note } from "@/types";
import { toast } from "sonner";
import { createNotePdfDocument } from './note-pdf-document';
import { createNoteDocxDocument } from './note-docx-document';

export interface ExportOptions {
  includeTitle: boolean;
  includeMetadata: boolean;
  preserveFormatting: boolean;
}

export type PageSize = "a4" | "letter";

const exportStyles = `
  * { box-sizing: border-box; }
  body { color: #18181b; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.6; }
  .note-export { max-width: 800px; margin: 0 auto; }
  .note-export h1, .note-export h2, .note-export h3, .note-export h4, .note-export h5, .note-export h6 { color: #18181b; font-weight: 700; break-after: avoid-page; }
  .note-export h1 { font-size: 28pt; line-height: 1.2; margin: 2.5rem 0 1.25rem; }
  .note-export h2 { font-size: 23pt; line-height: 1.3; margin: 2.25rem 0 1rem; }
  .note-export h3 { font-size: 18pt; line-height: 1.4; margin: 2rem 0 .85rem; }
  .note-export h4 { font-size: 15pt; margin: 1.75rem 0 .75rem; }
  .note-export h5, .note-export h6 { font-size: 13pt; margin: 1.5rem 0 .65rem; }
  .note-export p { margin: .5rem 0; }
  .note-export ul, .note-export ol { margin: .25rem 0; padding-left: 2rem; }
  .note-export li { margin: .1rem 0; }
  .note-export li p { margin: 0; }
  .note-export ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  .note-export ul[data-type="taskList"] li { display: flex; gap: .5rem; align-items: flex-start; }
  .note-export ul[data-type="taskList"] input { accent-color: #18181b; margin-top: .38rem; }
  .note-export ul[data-type="taskList"] li[data-checked="true"] > div, .note-export ul[data-type="taskList"] li[data-checked="true"] > p { color: #71717a; text-decoration: line-through; }
  .note-export blockquote { margin: 1rem 0; border-left: 4px solid #d4d4d8; padding: .5rem 1rem; color: #52525b; font-style: italic; }
  .note-export code { border: 1px solid #e4e4e7; border-radius: .25rem; background: #f4f4f5; padding: .1rem .3rem; color: #be123c; font-family: "JetBrains Mono", Consolas, monospace; font-size: .9em; }
  .note-export pre { margin: 1rem 0; overflow-x: auto; border-radius: .5rem; background: #18181b; padding: 1rem; color: #f4f4f5; break-inside: avoid; }
  .note-export pre code { border: 0; background: transparent; padding: 0; color: inherit; }
  .note-export a { color: inherit; text-decoration: underline; }
  .note-export img { display: block; max-width: 100%; height: auto; margin: 1.5rem auto; border-radius: .5rem; break-inside: avoid; }
  .note-export table { width: 100%; margin: 1rem 0; border-collapse: collapse; break-inside: avoid; }
  .note-export th, .note-export td { border: 1px solid #d4d4d8; padding: .5rem .75rem; text-align: left; vertical-align: top; }
  .note-export th { background: #f4f4f5; font-weight: 600; }
  .note-export hr { border: 0; border-top: 1px solid #e4e4e7; margin: 1.5rem 0; }
  .note-export [data-type="badge"] { display: inline-block; border-radius: 999px; background: #f4f4f5; padding: .1rem .5rem; font-size: .85em; }
  .note-export .tiptap-toggle { margin: .75rem 0; border: 1px solid #e4e4e7; border-radius: .5rem; padding: .5rem .75rem; }
  .note-export .tiptap-toggle-content { padding: .5rem 0 0; }
  .export-title { margin-top: 0 !important; border-bottom: 1px solid #e4e4e7; padding-bottom: .75rem; }
  .export-meta { margin: 0 0 1.5rem; color: #71717a; font-size: 9pt; }
  @media print { @page { margin: 18mm; } body { margin: 0; } .note-export { max-width: none; } }
`;

export class NoteExporter {
  private static options(options?: ExportOptions): ExportOptions {
    return { includeTitle: true, includeMetadata: true, preserveFormatting: true, ...options };
  }

  private static escape(value: string): string {
    const node = document.createElement('div');
    node.textContent = value;
    return node.innerHTML;
  }

  static buildExportHtml(note: Note, options?: ExportOptions, content = note.content || ''): string {
    const opts = this.options(options);
    const title = opts.includeTitle ? `<h1 class="export-title">${this.escape(note.title)}</h1>` : '';
    const meta = opts.includeMetadata ? `<p class="export-meta">Project: ${this.escape(note.projects?.name || 'Untitled')} &middot; Updated: ${this.escape(new Date(note.updated_at).toLocaleDateString())}</p>` : '';
    const preservedContent = opts.preserveFormatting ? content : this.escape(new DOMParser().parseFromString(content, 'text/html').body.textContent || '');
    return `<!doctype html><html><head><meta charset="utf-8"><style>${exportStyles}</style></head><body><article class="note-export">${title}${meta}<div class="tiptap-editor">${preservedContent}</div></article></body></html>`;
  }

  private static async inlineExternalImages(content: string): Promise<string> {
    const documentFragment = new DOMParser().parseFromString(content, 'text/html');
    await Promise.all(Array.from(documentFragment.images).map(async (image) => {
      if (!/^https?:/.test(image.src)) return;
      try {
        const response = await fetch(image.src);
        if (!response.ok) return;
        const data = await response.blob();
        image.src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(data);
        });
      } catch {
        // Keep the original URL when it cannot be embedded.
      }
    }));
    return documentFragment.body.innerHTML;
  }

  static printNote(note: Note, options?: ExportOptions): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(this.buildExportHtml(note, options));
    printWindow.document.close();
    printWindow.addEventListener('load', () => {
      printWindow.print();
      printWindow.close();
    }, { once: true });
  }

  static async exportToPDF(note: Note, options?: ExportOptions, pageSize: PageSize = 'a4'): Promise<void> {
    if (!note.content) return void toast.error('No content to export');
    const toastId = toast.loading('Generating PDF...');
    try {
      const opts = this.options(options);
      const content = opts.preserveFormatting
        ? await this.inlineExternalImages(note.content)
        : new DOMParser().parseFromString(note.content, 'text/html').body.textContent || '';
      const blob = await pdf(createNotePdfDocument({ note, options: opts, content, pageSize })).toBlob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${note.title.toLowerCase().replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      toast.success('PDF exported', { id: toastId });
    } catch (error) {
      console.error('PDF export failed:', error);
      toast.error('Failed to generate PDF', { id: toastId });
    }
  }

  static async exportToWord(note: Note, options?: ExportOptions): Promise<void> {
    if (!note.content) return void toast.error('No content to export');
    const toastId = toast.loading('Generating DOCX...');
    try {
      const opts = this.options(options);
      const content = opts.preserveFormatting ? await this.inlineExternalImages(note.content) : new DOMParser().parseFromString(note.content, 'text/html').body.textContent || '';
      const blob = await Packer.toBlob(createNoteDocxDocument(note, opts, content));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${note.title.toLowerCase().replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('DOCX exported', { id: toastId });
    } catch (error) {
      console.error('DOCX export failed:', error);
      toast.error('Failed to generate DOCX', { id: toastId });
    }
  }
}
