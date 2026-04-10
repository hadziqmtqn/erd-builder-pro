/**
 * NoteImporter Service
 * Handles conversion of various file formats (DOCX, DOC, MD) into HTML for the editor.
 */

// CDN URL for Mammoth.js
const MAMMOTH_CDN = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";

export class NoteImporter {
  private static isMammothLoaded = false;

  /**
   * Dynamically loads Mammoth.js from CDN if not already loaded
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
      script.onerror = () => reject(new Error("Failed to load Mammoth.js from CDN"));
      document.head.appendChild(script);
    });
  }

  /**
   * Converts a Word (.docx) file to HTML with automatic image upload to R2
   */
  static async convertDocxToHtml(file: File): Promise<string> {
    try {
      const mammoth = await this.loadMammoth();
      const arrayBuffer = await file.arrayBuffer();
      const options = {
        convertImage: mammoth.images.imgElement(async (image: any) => {
          try {
            const imageBuffer = await image.read();
            const contentType = image.contentType;
            const blob = new Blob([imageBuffer], { type: contentType });
            const formData = new FormData();
            
            const extension = contentType.split('/')[1] || 'png';
            const fileName = `word_import_${Date.now()}.${extension}`;
            
            formData.append('image', blob, fileName);
            formData.append('feature', 'notes');

            const response = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
              credentials: 'include',
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            if (data.url) {
              return { src: data.url };
            }
            
            throw new Error('No URL returned from server');
          } catch (uploadError) {
            console.error("Failed to upload image during Word import:", uploadError);
            return {}; // Skip failed images
          }
        })
      };

      const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, options);
      
      if (result.messages.length > 0) {
        console.warn("Mammoth conversion messages:", result.messages);
      }
      
      return result.value; 
    } catch (error) {
      console.error("DOCX conversion error:", error);
      throw new Error("Could not parse Word document. Ensure it's a valid .docx file.");
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
    if (text.includes('<html') && (text.includes('xmlns:w') || text.includes('office:word'))) {
      // It's HTML-based, extract the content area if possible
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const content = doc.querySelector('.content') || doc.body;
      return content.innerHTML;
    }
    
    throw new Error("Binary .doc files (Word 97-2003) are not supported. Please save as .docx first.");
  }
}
