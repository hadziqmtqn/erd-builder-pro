import { jsPDF } from "jspdf";
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
  static printNote(note: Note, options?: ExportOptions): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const opts: ExportOptions = {
      includeTitle: true,
      includeMetadata: true,
      includeOutline: false,
      preserveFormatting: true,
      ...options,
    };

    const content = note.content || '';
    const title = opts.includeTitle ? `<h1 style="margin-top: 0;">${note.title}</h1>` : '';

    // Build outline from headings if requested
    let outlineHtml = '';
    if (opts.includeOutline) {
      const headingMatches = [...content.matchAll(/<h([1-3])[^>]*>(.*?)<\/h\1>/gi)];
      if (headingMatches.length > 0) {
        outlineHtml = '<h2>Table of Contents</h2><ol style="margin-bottom:24px">';
        for (const match of headingMatches) {
          const level = parseInt(match[1]);
          const text = match[2].replace(/<[^>]*>/g, '');
          outlineHtml += `<li style="margin-${level === 1 ? 'left:0' : level === 2 ? 'left:20px' : 'left:40px'}; list-style-type:${level === 1 ? 'decimal' : level === 2 ? 'lower-alpha' : 'circle'}">${text}</li>`;
        }
        outlineHtml += '</ol><hr style="margin-bottom:20px"/>';
      }
    }

    const metaBlock = opts.includeMetadata ? `
      <div class="meta">
        <span>Project: ${note.projects?.name || 'Untitled'}</span>
        <span>Date: ${new Date(note.updated_at).toLocaleDateString()}</span>
      </div>
    ` : '';

    const exportStyles = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

      body { 
        font-family: 'Inter', -apple-system, blinkmacsystemfont, 'Segoe UI', roboto, oxygen, ubuntu, cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; 
        padding: 40px; 
        color: #111; 
        line-height: 1.4; 
        max-width: 800px; 
        margin: 0 auto; 
        background: white;
      }
      
      h1 { font-size: 32pt; font-weight: 800; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; margin-bottom: 20px; color: #000; letter-spacing: -0.02em; }
      h2 { font-size: 22pt; font-weight: 700; margin-top: 24px; margin-bottom: 12px; color: #111; letter-spacing: -0.01em; }
      h3 { font-size: 16pt; font-weight: 600; margin-top: 20px; margin-bottom: 8px; color: #222; }
      
      .meta { display: flex; justify-content: space-between; color: #888; font-size: 10pt; margin-bottom: 20px; border-bottom: 1px solid #f5f5f5; padding-bottom: 10px; font-weight: 500; }
      
      p { margin-bottom: 1em; font-size: 11pt; color: #374151; }
      
      blockquote { 
        border-left: 4px solid #e5e7eb; 
        padding: 8px 20px; 
        margin: 16px 0; 
        background: #f9fafb; 
        font-style: italic; 
        color: #4b5563; 
        border-radius: 0 8px 8px 0;
      }
      
      /* Task List Styling */
      ul[data-type="taskList"] { list-style: none; padding: 0; margin: 16px 0; }
      /* ... rest of the existing styles remained similar but with slightly reduced margins ... */
      ul[data-type="taskList"] li { display: flex; align-items: flex-start; margin-bottom: 6px; }
      ul[data-type="taskList"] input[type="checkbox"] { 
        appearance: none;
        width: 18px; 
        height: 18px; 
        border: 2px solid #d1d5db; 
        border-radius: 4px;
        margin-right: 12px;
        margin-top: 2px;
        position: relative;
        background: white;
      }
      ul[data-type="taskList"] li[data-checked="true"] input[type="checkbox"] {
        background: #111;
        border-color: #111;
      }
      ul[data-type="taskList"] li[data-checked="true"] input[type="checkbox"]::after {
        content: '✓';
        position: absolute;
        color: white;
        font-size: 12px;
        left: 3px;
        top: -1px;
      }
      ul[data-type="taskList"] li[data-checked="true"] > div > p {
        text-decoration: none;
        color: #a1a1aa;
      }

      /* Lists */
      ul:not([data-type="taskList"]), ol { padding-left: 24px; margin-bottom: 1em; }
      li { margin-bottom: 0.4em; }

      /* Tables */
      table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
      table th { background: #f9fafb; font-weight: 600; text-align: left; color: #111; padding: 10px 14px; border-bottom: 1px solid #e5e7eb; }
      table td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; color: #4b5563; font-size: 10.5pt; }
      table tr:last-child td { border-bottom: none; }

      /* Code Blocks */
      code { 
        font-family: 'JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', monospace; 
        background: #f3f4f6; 
        padding: 2px 4px; 
        border-radius: 4px; 
        font-size: 0.9em; 
        color: #e11d48;
      }
      pre { 
        background: #111827; 
        padding: 20px; 
        border-radius: 12px; 
        margin: 20px 0; 
        overflow-x: auto;
      }
      pre code { 
        background: transparent; 
        padding: 0; 
        color: #f3f4f6; 
        font-size: 10pt;
        line-height: 1.5;
      }

      img { max-width: 100%; height: auto; border-radius: 10px; display: block; margin: 20px auto; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }

      @media print {
        @page { margin: 2cm; }
        body { padding: 0; }
        pre, blockquote, table, img { page-break-inside: avoid; }
        a { color: #111; text-decoration: none; }
      }
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>${note.title}</title>
          <style>${exportStyles}</style>
        </head>
        <body class="tiptap">
          ${title}
          ${metaBlock}
          ${outlineHtml}
          <div class="content">${content}</div>
          <script>
            // Handle task list rendering in print window
            document.querySelectorAll('ul[data-type="taskList"] li').forEach(li => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                if (li.getAttribute('data-checked') === 'true') {
                    checkbox.checked = true;
                }
                li.prepend(checkbox);
            });

            window.onload = () => {
              setTimeout(() => {
                window.print();
                window.close();
              }, 800);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  /**
   * Helper to fetch and convert image to Base64
   */
  private static async getImageData(url: string): Promise<{ data: string, format: string } | null> {
    try {
      // Add cache buster and crossOrigin
      const proxyUrl = `${url}${url.includes('?') ? '&' : '?'}t_pdf=${Date.now()}`;
      const response = await fetch(proxyUrl);
      const blob = await response.blob();
      
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const data = reader.result as string;
          const format = blob.type.includes('png') ? 'PNG' : 'JPEG';
          resolve({ data, format });
        };
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn("Failed to fetch image for PDF:", url);
      return null;
    }
  }

  /**
   * Main entry point for PDF export (Object-Based Engine)
   */
  static async exportToPDF(
    note: Note, 
    options: ExportOptions, 
    pageSize: PageSize = "a4"
  ): Promise<void> {
    const toastId = toast.loading("Generating PDF Objects...");
    
    try {
      const content = note.content;
      if (!content) {
        toast.error("No content to export", { id: toastId });
        return;
      }

      const opts: ExportOptions = {
        includeTitle: options.includeTitle ?? true,
        includeMetadata: options.includeMetadata ?? true,
        includeOutline: options.includeOutline ?? false,
        preserveFormatting: options.preserveFormatting ?? true,
      };

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: pageSize,
        compress: true
      });

      const margin = 40;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidth = pageWidth - (margin * 2);
      let currentY = margin;

      const checkNewPage = (heightNeeded: number) => {
        if (currentY + heightNeeded > pageHeight - margin) {
          pdf.addPage();
          currentY = margin;
          return true;
        }
        return false;
      };

      // 1. Add Title & Metadata
      if (opts.includeTitle) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(24);
        const titleLines = pdf.splitTextToSize(note.title, contentWidth);
        pdf.text(titleLines, margin, currentY + 20);
        currentY += (titleLines.length * 30) + 10;
        
        // Horizontal Line
        pdf.setDrawColor(230);
        pdf.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 20;
      }

      if (opts.includeMetadata) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        const metaText = `Project: ${note.projects?.name || 'Untitled'}  |  Updated: ${new Date(note.updated_at).toLocaleDateString()}`;
        pdf.text(metaText, margin, currentY);
        currentY += 25;
        pdf.setTextColor(0); // Reset
      }

      // 2a. Table of Contents (if requested)
      if (opts.includeOutline) {
        const headingRegex = /<h([1-4])[^>]*>(.*?)<\/h\1>/gi;
        const headingMatches: { level: number; text: string }[] = [];
        let match;
        while ((match = headingRegex.exec(content)) !== null) {
          headingMatches.push({
            level: parseInt(match[1]),
            text: match[2].replace(/<[^>]*>/g, ''),
          });
        }

        if (headingMatches.length > 0) {
          checkNewPage(40);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(14);
          pdf.text("Table of Contents", margin, currentY + 12);
          currentY += 22;

          for (const h of headingMatches) {
            const indent = (h.level - 1) * 12;
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(10);
            pdf.setTextColor(80);
            pdf.text(`${h.level === 1 ? '•' : '-'} ${h.text}`, margin + indent, currentY + 9);
            currentY += 14;
          }
          currentY += 10;
          pdf.setTextColor(0);

          // Separator
          pdf.setDrawColor(230);
          pdf.line(margin, currentY, pageWidth - margin, currentY);
          currentY += 16;
        }
      }

      // 2. Parse HTML Content
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      const nodes = Array.from(doc.body.childNodes);

      for (const node of nodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tag = el.tagName.toLowerCase();

          // Heading Handler
          if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
            const size = opts.preserveFormatting
              ? (tag === 'h1' ? 20 : tag === 'h2' ? 16 : 14)
              : 12;
            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(size);
            const lines = pdf.splitTextToSize(el.innerText, contentWidth);
            const h = lines.length * (size * 1.3);
            
            checkNewPage(h + 10);
            pdf.text(lines, margin, currentY + size);
            currentY += h + 20;
          }

          // Image Handler
          else if (tag === 'img' || el.querySelector('img')) {
            const imgEl = tag === 'img' ? (el as HTMLImageElement) : el.querySelector('img')!;
            const src = imgEl.getAttribute('src');
            
            if (src) {
              const imgData = await this.getImageData(src);
              if (imgData) {
                // Approximate size (simple scaling)
                const imgW = contentWidth;
                const imgH = (imgW * 0.6); // Aspect ratio placeholder or calculated
                
                checkNewPage(imgH + 20);
                pdf.addImage(imgData.data, imgData.format, margin, currentY, imgW, imgH, undefined, 'FAST');
                currentY += imgH + 20;
              }
            }
          }

          // Table Handler
          else if (['table', 'figure'].includes(tag) && (tag === 'figure' ? !!el.querySelector('table') : true)) {
            const tableEl = tag === 'table' ? el : el.querySelector('table')!;
            
            const rows = Array.from(tableEl.querySelectorAll<HTMLElement>('tr'));
            if (rows.length === 0) continue;

            // Count columns
            let numCols = 0;
            rows.forEach(row => {
              const cells = Array.from(row.querySelectorAll('th, td'));
              numCols = Math.max(numCols, cells.length);
            });
            if (numCols === 0) continue;

            const colWidth = contentWidth / numCols;
            const cellPad = 5;
            const minRowH = 22;

            // Pre-calculate row heights
            let totalTableH = 0;
            const rowHeights: number[] = [];
            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll<HTMLElement>('th, td'));
              let maxH = minRowH;
              pdf.setFontSize(9);
              for (const cell of cells) {
                const text = cell.innerText.trim();
                if (text) {
                  const lines = pdf.splitTextToSize(text, colWidth - cellPad * 2);
                  maxH = Math.max(maxH, lines.length * 11 + cellPad * 2);
                }
              }
              rowHeights.push(maxH);
              totalTableH += maxH;
            }

            checkNewPage(totalTableH + 20);

            // Render table
            let yStart = currentY + 8;
            let rowIdx = 0;
            pdf.setFontSize(9);

            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll<HTMLElement>('th, td'));
              const isHeader = row.closest('thead') !== null || cells.some(c => c.tagName.toLowerCase() === 'th');
              const rHeight = rowHeights[rowIdx] || minRowH;
              let xStart = margin;

              for (const cell of cells) {
                const text = cell.innerText.trim();
                const w = colWidth;

                // Background
                if (isHeader) {
                  pdf.setFillColor(248, 249, 250);
                  pdf.rect(xStart, yStart, w, rHeight, 'F');
                }

                // Border
                pdf.setDrawColor(210);
                pdf.setLineWidth(0.3);
                pdf.rect(xStart, yStart, w, rHeight, 'S');

                // Text
                if (text) {
                  pdf.setTextColor(isHeader ? 10 : 70);
                  pdf.setFont("helvetica", isHeader ? "bold" : "normal");
                  const lines = pdf.splitTextToSize(text, w - cellPad * 2);
                  pdf.text(lines, xStart + cellPad, yStart + cellPad + 9);
                }

                xStart += w;
              }

              yStart += rHeight;
              rowIdx++;
            }

            currentY = yStart + 16;
            pdf.setTextColor(0);
            pdf.setFont("helvetica", "normal");
          }

          // Paragraph / List Item Handler
          else if (['p', 'li', 'div', 'blockquote'].includes(tag)) {
            const isTask = el.getAttribute('data-type') === 'taskItem' || el.classList.contains('task-item');
            const isChecked = el.getAttribute('data-checked') === 'true';
            const isBullet = tag === 'li' && !isTask;
            const isQuote = tag === 'blockquote';
            const useQuoteStyle = isQuote && opts.preserveFormatting;
            
            const indent = (isBullet || isTask) ? 20 : useQuoteStyle ? 15 : 0;
            const text = el.innerText.trim();
            
            if (text) {
              pdf.setFont("helvetica", useQuoteStyle ? "oblique" : "normal");
              pdf.setFontSize(opts.preserveFormatting ? (isQuote ? 10 : 11) : 10);
              
              if (useQuoteStyle) {
                pdf.setDrawColor(200);
                pdf.setLineWidth(2);
                pdf.line(margin, currentY, margin, currentY + 15); // Simple left border
              }

              const lines = pdf.splitTextToSize(text, contentWidth - indent);
              const h = lines.length * 14;
              
              checkNewPage(h + 10);
              
              if (isBullet) {
                pdf.text("•", margin + 5, currentY + 11);
              } else if (isTask) {
                pdf.setDrawColor(150);
                pdf.rect(margin + 2, currentY + 2, 10, 10);
                if (isChecked) {
                  pdf.setFont("helvetica", "bold");
                  pdf.text("L", margin + 4, currentY + 10); // Simple checkmark
                  pdf.setFont("helvetica", "normal");
                }
              }
              
              pdf.text(lines, margin + indent, currentY + 11);
              currentY += h + 12;
            }
          }
          
          // Horizontal Rule
          else if (tag === 'hr') {
            checkNewPage(20);
            pdf.setDrawColor(240);
            pdf.line(margin, currentY + 10, pageWidth - margin, currentY + 10);
            currentY += 20;
          }
        }
      }

      pdf.save(`${note.title.toLowerCase().replace(/\s+/g, '_')}.pdf`);
      toast.success("PDF Exported!", { id: toastId });
      
    } catch (error) {
      console.error("Manual PDF Export failed:", error);
      toast.error("Generation failed. Use 'High Quality' option.", { id: toastId });
    }
  }

  /**
   * Dynamically loads html-docx-js from CDN
   */
  private static async loadHtmlDocx(): Promise<any> {
    if ((window as any).htmlDocx) return (window as any).htmlDocx;

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js";
      script.onload = () => resolve((window as any).htmlDocx);
      script.onerror = () => reject(new Error("Failed to load html-docx-js from CDN"));
      document.head.appendChild(script);
    });
  }

  /**
   * Sanitizes HTML to be XML-compliant for html-docx-js (requires valid XML)
   */
  private static sanitizeHtmlForDocx(html: string): string {
    return html
      // Self-closing tags: <br> → <br/>, <hr> → <hr/>
      .replace(/<(br|hr)(\s[^>]*)?>/gi, '<$1$2 />')
      // <img ...> → <img ... /> (skip if already has trailing /)
      .replace(/<img\s([^>]*?)\s*>/gi, (match, attrs) => {
        if (attrs.endsWith('/')) return match;
        return `<img ${attrs} />`;
      })
      // Escape stray & that aren't valid HTML entities
      .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
  }

  /**
   * Main entry point for Word export (Binary .docx Engine)
   * This generates a true .docx file compatible with Notion, MS Word, and Google Docs.
   */
  static async exportToWord(
    note: Note,
    options: ExportOptions,
  ): Promise<void> {
    const toastId = toast.loading("Generating binary .docx document...");
    
    try {
      const content = note.content;
      if (!content) {
        toast.error("No content to export", { id: toastId });
        return;
      }

      const opts: ExportOptions = {
        includeTitle: options.includeTitle ?? true,
        includeMetadata: options.includeMetadata ?? true,
        includeOutline: options.includeOutline ?? false,
        preserveFormatting: options.preserveFormatting ?? true,
      };

      const htmlDocx = await this.loadHtmlDocx();

      // 1. Convert all images to Base64 Data URIs (required for embedding in .docx)
      let exportedContent: string = content;
      const imgRegex = /<img [^>]*src=["']([^"']+)["'][^>]*>/g;
      const matches = Array.from(exportedContent.matchAll(imgRegex));
      
      if (matches.length > 0) {
        toast.loading(`Processing ${matches.length} images for document...`, { id: toastId });
        for (const match of matches) {
          const url = match[1];
          if (url.startsWith('http')) {
            const imgData = await this.getImageData(url);
            if (imgData) {
              exportedContent = exportedContent.replace(url, imgData.data);
            }
          }
        }
      }

      // 2. Sanitize content for XML compliance (html-docx-js requires XML)
      exportedContent = NoteExporter.sanitizeHtmlForDocx(exportedContent);

      // 3. Wrap content in a clean HTML structure
      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Times New Roman', Times, serif; }
            h1 { font-size: 24pt; font-weight: bold; }
            h2 { font-size: 18pt; font-weight: bold; }
            p { font-size: 11pt; line-height: 1.5; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid black; padding: 5px; }
            blockquote { border-left: 3px solid #ccc; padding-left: 15px; ${opts.preserveFormatting ? 'font-style: italic;' : ''} }
            img { max-width: 100%; height: auto; }
            .toc ul { list-style: none; padding-left: 0; }
            .toc li { margin-bottom: 4px; font-size: 10pt; }
          </style>
        </head>
        <body>
          ${opts.includeTitle ? `<h1>${note.title}</h1>` : ''}
          ${opts.includeMetadata ? `
            <p style="color: #666; font-size: 9pt;">
              Project: ${note.projects?.name || 'Untitled'} | Updated: ${new Date(note.updated_at).toLocaleDateString()}
            </p>
            <hr />
          ` : ''}
          ${opts.includeOutline ? `
            <div class="toc">
              <h2>Table of Contents</h2>
              <ul>
                ${[...(content.matchAll(/<h([1-4])[^>]*>(.*?)<\/h\1>/gi))]
                  .map(m => {
                    const level = parseInt(m[1]);
                    const text = m[2].replace(/<[^>]*>/g, '');
                    return `<li style="margin-left:${(level-1)*20}px; list-style-type:${level===1?'decimal':level===2?'lower-alpha':'circle'}">${text}</li>`;
                  }).join('\n                ')
                }
              </ul>
              <hr />
            </div>
          ` : ''}
          <div class="content">${exportedContent}</div>
        </body>
        </html>
      `;

      // 3. Convert to binary .docx
      const blob = htmlDocx.asBlob(fullHtml, {
        orientation: 'portrait',
        margins: { top: 720, right: 720, bottom: 720, left: 720 }
      });

      // 4. Download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${note.title.toLowerCase().replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Standard .docx exported successfully!", { id: toastId });
      
    } catch (error) {
      console.error("Binary Word Export failed:", error);
      toast.error("Failed to generate standard Word document", { id: toastId });
    }
  }
}
