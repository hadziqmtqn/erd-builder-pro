import { useCallback } from 'react';
import { toPng } from 'html-to-image';
import { getNodesBounds, useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

export function useImageExporter() {
  const { getNodes } = useReactFlow();

  const handleExport = useCallback(async (format: 'png' | 'pdf', fileName: string = 'diagram', exportTheme: 'light' | 'dark' = 'dark') => {
    const nodes = getNodes();
    if (nodes.length === 0) {
      toast.error("Canvas is empty");
      return;
    }

    const exportPromise = new Promise(async (resolve, reject) => {
      try {
        const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement;
        const containerElement = document.querySelector('.react-flow') as HTMLElement;
        
        if (!viewportElement || !containerElement) {
          reject("Flow elements not found");
          return;
        }

        const isPdf = format === 'pdf';
        
        // Final export colors (Dark Mode Only)
        const bgColor = '#09090b';
        const edgeColor = '#f8fafc';

        // 1. Calculate Workspace Bounds (Pixel-Perfect)
        const bounds = getNodesBounds(nodes);
        const padding = 50;
        
        // Calculate dimensions that tightly fit the diagram
        const exportWidth = bounds.width + (padding * 2);
        const exportHeight = bounds.height + (padding * 2);

        const options: any = {
          backgroundColor: bgColor,
          width: exportWidth,
          height: exportHeight,
          pixelRatio: 4, // Ultra-High Density for sharp text
          style: {
            width: `${exportWidth}px`,
            height: `${exportHeight}px`,
            // FIXED 1:1 Scale transform - No auto-shrinking
            transform: `translate(${-bounds.x + padding}px, ${-bounds.y + padding}px) scale(1)`,
          },
          onClone: (clonedDoc: Document) => {
            const clonedViewport = clonedDoc.querySelector('.react-flow__viewport') as HTMLElement;
            if (!clonedViewport) return;

            // Apply Dark Theme and Variables directly to the clone
            clonedViewport.classList.remove('light', 'xy-theme-light');
            clonedViewport.classList.add('dark', 'xy-theme-dark');

            // Force CSS Variables for Edges (Preserves visibility)
            clonedViewport.style.setProperty('--xy-edge-stroke', edgeColor);
            clonedViewport.style.setProperty('--xy-edge-stroke-selected', edgeColor);
            clonedViewport.style.setProperty('--xy-node-background-color', '#111827');
            clonedViewport.style.setProperty('--xy-node-border-default', '2px solid #334155');

            // Inject Custom Styling
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              .react-flow__handle, .react-flow__controls, .react-flow__attribution, .react-flow__background { 
                display: none !important; 
              }
              
              .react-flow__edge-path {
                stroke: ${edgeColor} !important;
                stroke-width: 2.5px !important;
                stroke-opacity: 1 !important;
                filter: none !important;
              }
              
              .erd-node-container { 
                box-shadow: none !important; 
                background-color: #111827 !important;
                border: 2px solid #334155 !important;
              }
            `;
            clonedDoc.body.appendChild(style);

            // Clone markers (arrows)
            const allDefs = containerElement.querySelectorAll('defs');
            const targetEdgeSvg = clonedDoc.querySelector('svg.react-flow__edges') as SVGElement;
            if (targetEdgeSvg && allDefs.length > 0) {
              allDefs.forEach(defs => {
                const clonedDefs = defs.cloneNode(true) as SVGDefsElement;
                clonedDefs.querySelectorAll('path').forEach(p => {
                  p.setAttribute('fill', edgeColor);
                  p.setAttribute('stroke', edgeColor);
                });
                targetEdgeSvg.prepend(clonedDefs);
              });
            }
          }
        };

        const dataUrl = await toPng(viewportElement, options);

        if (isPdf) {
          // pt to px (1pt = 1.333px)
          const pdfWidth = exportWidth * 0.75;
          const pdfHeight = exportHeight * 0.75;

          const pdf = new jsPDF({
            orientation: pdfWidth > pdfHeight ? 'l' : 'p',
            unit: 'pt',
            format: [pdfWidth, pdfHeight],
            compress: true
          });

          pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
          pdf.save(`${fileName.replace(/\s+/g, '_').toLowerCase()}.pdf`);
        } else {
          const link = document.createElement('a');
          link.download = `${fileName.replace(/\s+/g, '_').toLowerCase()}.png`;
          link.href = dataUrl;
          link.click();
        }
        
        resolve(true);
      } catch (err) {
        console.error("Export failed:", err);
        reject(err);
      }
    });

    toast.promise(exportPromise, {
      loading: `Generating High-Res ${exportTheme === 'light' ? 'Light' : 'Dark'} ${format.toUpperCase()}...`,
      success: 'Export successful!',
      error: 'Export failed.'
    });
  }, [getNodes]);

  const handleExportImage = useCallback((format: 'png', fileName: string, exportTheme: 'light' | 'dark') => {
    return handleExport('png', fileName, exportTheme);
  }, [handleExport]);

  const handleExportPDF = useCallback((fileName: string, exportTheme: 'light' | 'dark') => {
    return handleExport('pdf', fileName, exportTheme);
  }, [handleExport]);

  return { handleExportImage, handleExportPDF };
}
