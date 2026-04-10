import { jsPDF } from "jspdf";
import { toJpeg } from "html-to-image";
import { Note } from "@/types";
import { toast } from "sonner";

export interface ExportOptions {
  includeTitle: boolean;
  includeMetadata: boolean;
  includeOutline: boolean;
  preserveFormatting: boolean;
}

export type PageSize = "a4" | "letter";

export class NoteExporter {
  /**
   * Generates a PDF using the browser's native print engine (highest quality)
   */
  static printNote(note: Note): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const exportStyles = `
      body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.6; }
      h1 { font-size: 28pt; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px; color: #000; }
      .meta { display: flex; justify-content: space-between; color: #666; font-size: 10pt; margin-bottom: 30px; }
      img { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 20px auto; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      table td, table th { border: 1px solid #ddd; padding: 8px; text-align: left; }
      pre { background: #f8f8f8; padding: 15px; border-radius: 8px; font-family: monospace; white-space: pre-wrap; }
      @media print {
        @page { margin: 2cm; }
        body { padding: 0; }
      }
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>${note.title}</title>
          <style>${exportStyles}</style>
        </head>
        <body>
          <h1>${note.title}</h1>
          <div class="meta">
            <span>Project: ${note.projects?.name || 'Untitled'}</span>
            <span>Date: ${new Date(note.updated_at).toLocaleDateString()}</span>
          </div>
          <div>${note.content}</div>
          <script>
            setTimeout(() => {
              window.print();
              window.close();
            }, 1000);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  /**
   * Main entry point for PDF export (Automated Image-to-PDF)
   */
  static async exportToPDF(
    note: Note, 
    options: ExportOptions, 
    pageSize: PageSize = "a4"
  ): Promise<void> {
    const toastId = toast.loading("Processing document...");
    
    try {
      // 1. Setup the render stage
      const container = document.createElement("div");
      Object.assign(container.style, {
        position: 'fixed', top: '0', left: '0', width: pageSize === 'a4' ? '794px' : '816px',
        backgroundColor: '#ffffff', color: '#333333', padding: '50px', zIndex: '-5000',
        opacity: '0', pointerEvents: 'none'
      });
      container.className = "tiptap-editor export-root";
      
      // 2. Prepare content with CORS & Cache Busting
      const t = Date.now();
      const content = note.content.replace(/<img ([^>]*?)src=["']([^"']+)["']([^>]*?)>/g, 
        (_, p1, p2, p3) => `<img ${p1}src="${p2}${p2.includes('?') ? '&' : '?'}t_v=${t}" crossorigin="anonymous"${p3}>`);

      container.innerHTML = `
        <style>
          .export-body { font-family: sans-serif !important; line-height: 1.6 !important; background-color: #ffffff !important; color: #333333 !important; }
          .export-body h1 { font-size: 32px !important; font-weight: bold !important; margin-bottom: 24px !important; color: #000 !important; border-bottom: 2px solid #eee !important; padding-bottom: 12px !important; }
          .export-body p { margin-bottom: 16px !important; color: #333333 !important; }
          .export-body img { max-width: 100% !important; border-radius: 12px !important; margin: 24px 0 !important; display: block !important; }
          .export-body table { width: 100% !important; border-collapse: collapse !important; margin: 24px 0 !important; border: 1px solid #ddd !important; background-color: #ffffff !important; }
          .export-body table td { padding: 12px !important; border: 1px solid #eee !important; color: #333333 !important; }
          .export-body table th { background-color: #f8f8f8 !important; padding: 12px !important; border: 1px solid #ddd !important; font-weight: bold !important; }
        </style>
        <div class="export-body">
          ${options.includeTitle ? `<h1>${note.title}</h1>` : ''}
          <div style="background-color: white !important; color: black !important;">${content}</div>
        </div>
      `;
      document.body.appendChild(container);
      await new Promise(r => setTimeout(r, 2000)); 

      // 3. Automated Capture using toCanvas (more robust)
      const { toCanvas } = await import("html-to-image");
      const canvas = await toCanvas(container, { 
        backgroundColor: "#ffffff",
        cacheBust: true, 
        pixelRatio: 1.5,
        skipFonts: true // Many fonts cause blank screens in html-to-image
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: pageSize, compress: true });
      const [pW, pH] = [pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight()];
      const sH = (container.offsetHeight * pW) / container.offsetWidth;
      
      let remaining = sH;
      let pos = 0;

      while (remaining > 0) {
        pdf.addImage(imgData, 'PNG', 0, pos, pW, sH, undefined, 'MEDIUM');
        remaining -= pH;
        if (remaining > 0) {
          pdf.addPage();
          pos -= pH;
        }
      }

      pdf.save(`${note.title.toLowerCase().replace(/\s+/g, '_')}.pdf`);
      document.body.removeChild(container);
      toast.success("PDF (Compact) exported!", { id: toastId });
      
    } catch (error) {
      console.error("PDF Export failed:", error);
      toast.error("Export failed. Use 'High Quality (Print)' for better results.", { id: toastId });
    }
  }

  /**
   * Placeholder for Word export
   */
  static async exportToWord(
    note: Note,
    options: ExportOptions,
    pageSize: PageSize = "a4"
  ): Promise<void> {
    // This will follow a similar pattern but use a different underlying converter
    toast.info("Word export is being developed using the same modular core!");
  }
}
