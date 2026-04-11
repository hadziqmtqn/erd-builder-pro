/**
 * NoteImporter Service
 * Handles conversion of various file formats (DOCX, DOC, MD) into HTML for the editor.
 */

import { compressImage } from '../image-compression';

// CDN URLs
const MAMMOTH_CDN = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

export class NoteImporter {
  private static isMammothLoaded = false;
  private static isJSZipLoaded = false;
  private static uploadQueue: Promise<any> = Promise.resolve();

  /**
   * Dynamically loads Mammoth.js from CDN
   */
  private static async loadMammoth(): Promise<any> {
    if (this.isMammothLoaded && (window as any).mammoth) {
      return (window as any).mammoth;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MAMMOTH_CDN;
      script.onload = () => {
        this.isMammothLoaded = true;
        resolve((window as any).mammoth);
      };
      script.onerror = () => reject(new Error("Failed to load Mammoth.js"));
      document.head.appendChild(script);
    });
  }

  /**
   * Dynamically loads JSZip from CDN
   */
  private static async loadJSZip(): Promise<any> {
    if (this.isJSZipLoaded && (window as any).JSZip) {
      return (window as any).JSZip;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = JSZIP_CDN;
      script.onload = () => {
        this.isJSZipLoaded = true;
        resolve((window as any).JSZip);
      };
      script.onerror = () => reject(new Error("Failed to load JSZip"));
      document.head.appendChild(script);
    });
  }

  /**
   * Converts a Word (.docx) file to HTML with AltChunk detection and R2 upload
   */
  static async convertDocxToHtml(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // 1. Try to detect and extract AltChunk using OpenXML relationships
      // This is the most reliable way to find embedded HTML
      try {
        const JSZip = await this.loadJSZip();
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // Step A: Check the main relationships file
        const relsFile = zip.file("word/_rels/document.xml.rels");
        if (relsFile) {
          const relsXml = await relsFile.async("string");
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(relsXml, "text/xml");
          
          // Step B: Look for aFChunk relationships
          const relationships = xmlDoc.getElementsByTagName("Relationship");
          let altChunkPath = "";
          
          for (let i = 0; i < relationships.length; i++) {
            const rel = relationships[i];
            const type = rel.getAttribute("Type");
            if (type && type.includes("aFChunk")) {
              const target = rel.getAttribute("Target");
              if (target) {
                altChunkPath = target.startsWith("/") ? target.substring(1) : `word/${target}`;
                break;
              }
            }
          }

          if (altChunkPath) {
            const altChunkFile = zip.file(altChunkPath);
            if (altChunkFile) {
              let html = await altChunkFile.async("string");
              
              // Extract body content if it's a full HTML doc
              if (html.toLowerCase().includes('<body')) {
                const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                if (bodyMatch) html = bodyMatch[1];
              }
              
              if (html && html.trim().length > 0) {
                return this.processHtmlForEditor(html);
              }
            }
          }
        }
      } catch (zipError) {
        console.warn("Standard Word Relationship check failed, falling back to Mammoth:", zipError);
      }

      // 2. Standard Mammoth.js conversion for normal Word documents
      const mammoth = await this.loadMammoth();
      const options = {
        convertImage: mammoth.images.imgElement(async (image: any) => {
          // Use sequential queue to prevent parallel upload congestion
          return this.uploadQueue = this.uploadQueue.then(async () => {
            try {
              const imageBuffer = await image.read();
              const contentType = image.contentType || 'image/png';
              
              // Create a File object from the buffer
              const extension = contentType.split('/')[1] || 'png';
              const originalFileName = `word_import_${Date.now()}.${extension}`;
              const file = new File([imageBuffer], originalFileName, { type: contentType });

              // Compress/Standardize the image (like TiptapEditor does)
              const processedFile = await compressImage(file, { maxWidth: 1280, quality: 0.9 });
              
              const formData = new FormData();
              formData.append('image', processedFile);
              formData.append('feature', 'notes');

              const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include',
              });

              if (!response.ok) throw new Error(`Upload failed with status: ${response.status}`);

              const data = await response.json();
              if (data.url) {
                return { src: data.url };
              }
              
              throw new Error('No URL returned from server');
            } catch (uploadError) {
              console.error("Failed to process/upload image during Word import:", uploadError);
              return {}; // Skip failed images
            }
          }).catch(err => {
            console.error("Queue error:", err);
            return {};
          });
        })
      };

      const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, options);
      
      if (result.messages.length > 0) {
        console.warn("Mammoth conversion messages:", result.messages);
      }
      
      return this.processHtmlForEditor(result.value); 
    } catch (error) {
      console.error("DOCX conversion error:", error);
      throw new Error("Could not parse Word document. Ensure it's a valid .docx file.");
    }
  }

  /**
   * Post-processes HTML content to ensure compatibility with Tiptap and stable image storage.
   * 1. Migrates Base64/Relative images to R2
   * 2. Sanitizes table structures (<thead>, <tbody>)
   * 3. Removes problematic inline styles
   */
  private static async processHtmlForEditor(html: string): Promise<string> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const container = doc.body;

    // 1. Repair Tables
    const tables = container.querySelectorAll("table");
    tables.forEach(table => {
      // Ensure there's a tbody
      if (!table.querySelector("tbody")) {
        const tbody = doc.createElement("tbody");
        const rows = Array.from(table.querySelectorAll("tr"));
        rows.forEach(row => tbody.appendChild(row));
        table.appendChild(tbody);
      }

      // Remove problematic inline styles that cause layout issues
      table.style.width = "100%";
      table.style.tableLayout = "fixed";
      table.removeAttribute("width");
      
      const cells = table.querySelectorAll("td, th");
      cells.forEach(cell => {
        const htmlCell = cell as HTMLElement;
        htmlCell.style.width = ""; // Reset forced widths
        htmlCell.style.height = "";
        htmlCell.removeAttribute("width");
        htmlCell.removeAttribute("height");
      });
    });

    // 2. Migrate Images (Base64 -> R2)
    const images = Array.from(container.querySelectorAll("img"));
    for (const img of images) {
      const src = img.getAttribute("src");
      if (src && src.startsWith("data:image")) {
        // Enqueue image upload sequentially
        await (this.uploadQueue = this.uploadQueue.then(async () => {
          try {
            const res = await fetch(src);
            const blob = await res.blob();
            const type = blob.type || "image/png";
            const ext = type.split("/")[1] || "png";
            const fileName = `imported_img_${Date.now()}.${ext}`;
            const file = new File([blob], fileName, { type });

            const processedFile = await compressImage(file, { maxWidth: 1280, quality: 0.9 });
            
            const formData = new FormData();
            formData.append("image", processedFile);
            formData.append("feature", "notes");

            const uploadRes = await fetch("/api/upload", {
              method: "POST",
              body: formData,
              credentials: "include",
            });

            if (uploadRes.ok) {
              const data = await uploadRes.json();
              if (data.url) {
                img.setAttribute("src", data.url);
              }
            }
          } catch (err) {
            console.error("Failed to migrate base64 image to R2:", err);
          }
        }));
      }
    }

    // 3. Repair Task Lists (convert standard HTML checkboxes OR text patterns [ ] / [x] to Tiptap taskList)
    container.querySelectorAll('li').forEach(li => {
      // Method A: Find the checkbox tag (marked often wraps it in a label)
      const checkbox = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      
      // Method B: Fallback - look for text patterns [ ] or [x] at the very start
      const textPatternRegex = /^[\s-]*\[([ xX])\]\s*/;
      let matchedPattern = null;
      let targetTextNode: Text | null = null;

      if (!checkbox) {
        // Find the first text node to check for patterns
        const walk = doc.createTreeWalker(li, NodeFilter.SHOW_TEXT, null);
        let node;
        while (node = walk.nextNode() as Text) {
          const match = node.textContent?.match(textPatternRegex);
          if (match) {
            matchedPattern = match;
            targetTextNode = node;
            break;
          }
          // Only check the very first meaningful text content
          if (node.textContent?.trim()) break; 
        }
      }

      if (checkbox || matchedPattern) {
        // Record the state
        const isChecked = checkbox ? checkbox.checked : (matchedPattern![1].toLowerCase() === 'x');
        
        // Find or mark the parent list as a taskList (important for hiding bullets)
        const parentList = li.closest('ul, ol');
        if (parentList) {
          parentList.setAttribute("data-type", "taskList");
          (parentList as HTMLElement).style.listStyle = "none"; // Hard-override style to be safe
        }

        // Set attributes for Tiptap TaskItem extension
        li.setAttribute("data-type", "taskItem"); // CRITICAL for Tiptap recognition
        li.setAttribute("data-checked", isChecked ? "true" : "false");
        
        // --- CLEANUP MARKERS ---
        if (checkbox) {
          checkbox.remove();
        } else if (targetTextNode && matchedPattern) {
          // Remove the characters "[x] " from the beginning of the text node
          targetTextNode.textContent = targetTextNode.textContent!.replace(textPatternRegex, "");
        }
        
        // Prepare the clean content wrapper
        const p = doc.createElement('p');
        
        // Move all remaining children (text, links, spans, etc.) into the P
        const nodesToMove = Array.from(li.childNodes);
        nodesToMove.forEach(node => {
          // Skip if the node is empty text or the checkbox (already removed)
          if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim() && nodesToMove.length > 1) {
            // Drop empty space nodes to keep it clean
          } else {
            p.appendChild(node);
          }
        });
        
        // Final trim for the first text node in P to ensure alignment
        if (p.firstChild && p.firstChild.nodeType === Node.TEXT_NODE) {
          p.firstChild.textContent = p.firstChild.textContent?.trimStart() || "";
        }
        
        // Clean LI and insert our standard P
        li.innerHTML = '';
        li.appendChild(p);
      }
    });

    return container.innerHTML;
  }

  /**
   * Converts a Markdown file to HTML with task list support and R2 upload
   */
  static async convertMarkdownToHtml(file: File): Promise<string> {
    try {
      const text = await file.text();
      // @ts-ignore - marked is available globally or via import
      const marked = (window as any).marked || (await import('marked')).marked;
      const html = await marked.parse(text);
      return this.processHtmlForEditor(html);
    } catch (error) {
      console.error("Markdown conversion error:", error);
      throw new Error("Could not parse Markdown file.");
    }
  }

  /**
   * Handles legacy .doc files
   * If it's the HTML-wrapped version (like our export), it parses as HTML.
   * Otherwise, it warns the user.
   */
  static async convertDocToHtml(file: File): Promise<string> {
    const text = await file.text();
    
    // Check if it's our HTML-based .doc export
    if (text.includes("<html") && (text.includes("xmlns:w") || text.includes("office:word"))) {
      // It's HTML-based, extract the content area if possible
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const content = doc.querySelector(".content") || doc.body;
      return this.processHtmlForEditor(content.innerHTML);
    }
    
    throw new Error("Binary .doc files (Word 97-2003) are not supported. Please save as .docx first.");
  }
}
