import { useCallback } from 'react';
import { toPng } from 'html-to-image';
import { getNodesBounds, useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

export function useImageExporter() {
  const { getNodes } = useReactFlow();

  // handleExportImage is temporarily disabled to focus on PDF
  const handleExportImage = useCallback(async (format: 'png' | 'svg', fileName: string = 'diagram') => {
    toast.error("Image export is temporarily disabled. Please use PDF.");
  }, []);

  const handleExportPDF = useCallback(async (fileName: string = 'diagram') => {
    const nodes = getNodes();
    if (nodes.length === 0) {
      toast.error("Canvas is empty");
      return;
    }

    const exportPromise = new Promise(async (resolve, reject) => {
      try {
        const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
        const root = document.querySelector('.react-flow') as HTMLElement;
        
        if (!viewport || !root) {
          reject("Flow elements not found");
          return;
        }

        // 1. Calculate bounds with a very generous safety margin (150px)
        const bounds = getNodesBounds(nodes);
        const padding = 150;
        const width = bounds.width + padding * 2;
        const height = bounds.height + padding * 2;

        const options: any = {
          backgroundColor: '#09090b',
          width: width,
          height: height,
          pixelRatio: 2,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transformOrigin: '0 0',
            transform: `translate(${-bounds.x + padding}px, ${-bounds.y + padding}px) scale(1)`,
          },
          onClone: (clonedDoc: Document) => {
            // A. INJECT ENHANCED CSS
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              .react-flow__edge-path, .xy-edge-path {
                stroke: #ffffff !important;
                stroke-width: 2.5px !important;
                stroke-opacity: 1 !important;
                stroke-dasharray: none !important; /* Force solid for export stability */
                fill: none !important;
                visibility: visible !important;
                display: block !important;
              }
              .react-flow__edges {
                overflow: visible !important;
                width: 100% !important;
                height: 100% !important;
                display: block !important;
              }
              .react-flow__nodes {
                overflow: visible !important;
              }
              .react-flow__edge-label {
                z-index: 100 !important;
              }
              /* Force markers (arrows) to be white and visible */
              [id^="react-flow__arrow"] path, 
              marker path {
                fill: #ffffff !important;
                stroke: #ffffff !important;
                stroke-width: 1px !important;
                opacity: 1 !important;
              }
            `;
            clonedDoc.head.appendChild(style);

            // B. SVG DEFS CLONING (Crucial for Arrows)
            const mainSvg = root.querySelector('svg.react-flow__container--svg');
            const defs = mainSvg?.querySelector('defs');
            const clonedSvg = clonedDoc.querySelector('svg.react-flow__edges') as SVGElement;
            
            if (clonedSvg) {
              // Ensure dimensions are correct on the SVG element itself
              clonedSvg.setAttribute('width', `${width}`);
              clonedSvg.setAttribute('height', `${height}`);
              clonedSvg.style.width = `${width}px`;
              clonedSvg.style.height = `${height}px`;

              // If markers exist, move them into the cloned edge container so they find their references
              if (defs) {
                const clonedDefs = defs.cloneNode(true) as SVGDefsElement;
                // Force white inside the cloned defs for paths
                clonedDefs.querySelectorAll('path').forEach(p => {
                    p.setAttribute('fill', '#ffffff');
                    p.setAttribute('stroke', '#ffffff');
                });
                clonedSvg.prepend(clonedDefs);
              }
            }

            // C. Final Path Sanitization
            const paths = clonedDoc.querySelectorAll('path.react-flow__edge-path, path.xy-edge-path');
            paths.forEach((path: any) => {
              path.setAttribute('stroke', '#ffffff');
              path.setAttribute('stroke-width', '2.5');
              path.setAttribute('stroke-dasharray', 'none');
              path.setAttribute('visibility', 'visible');
            });
          }
        };

        const dataUrl = await toPng(viewport, options);

        // Calculate PDF dimensions in points (1px = 0.75pt)
        const pdfWidth = width * 0.75;
        const pdfHeight = height * 0.75;

        // Create PDF with exactly matching dimensions
        const pdf = new jsPDF({
          orientation: pdfWidth > pdfHeight ? 'l' : 'p',
          unit: 'pt',
          format: [pdfWidth, pdfHeight],
          compress: true
        });

        pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        pdf.save(`${fileName.replace(/\s+/g, '_').toLowerCase()}_${new Date().getTime()}.pdf`);
        resolve(true);
      } catch (err) {
        console.error("PDF Export failed:", err);
        reject(err);
      }
    });

    toast.promise(exportPromise, {
      loading: 'Generating PDF...',
      success: 'PDF Export successful!',
      error: 'Failed to export PDF.'
    });
  }, [getNodes]);

  return { handleExportImage, handleExportPDF };
}
