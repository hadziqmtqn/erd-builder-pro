import { useCallback } from 'react';
import { toPng, toSvg } from 'html-to-image';
import { useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

export function useImageExporter() {
  const { getNodes } = useReactFlow();

  const handleExport = useCallback(async (format: 'svg' | 'pdf', fileName: string = 'diagram') => {
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

        // 1. Calculate Workspace Bounds (Hand-Calculated for Precision)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        nodes.forEach((node) => {
          const x = node.position.x;
          const y = node.position.y;
          const w = node.measured?.width || 300;
          const h = node.measured?.height || 400;

          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x + w > maxX) maxX = x + w;
          if (y + h > maxY) maxY = y + h;
        });

        const padding = 100;
        const width = (maxX - minX) + (padding * 2);
        const height = (maxY - minY) + (padding * 2);

        // 2. Smart Resolution Scaling
        const totalArea = width * height;
        let pixelRatio = 2.5; 
        
        if (totalArea > 15000000) pixelRatio = 1.0;
        else if (totalArea > 8000000) pixelRatio = 1.5;
        else if (totalArea > 3000000) pixelRatio = 2.0;

        const options: any = {
          backgroundColor: bgColor,
          width: width,
          height: height,
          pixelRatio: pixelRatio,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${-minX + padding}px, ${-minY + padding}px) scale(1)`,
          },
          onClone: (clonedDoc: Document) => {
            const clonedViewport = clonedDoc.querySelector('.react-flow__viewport') as HTMLElement;
            if (!clonedViewport) return;

            clonedViewport.classList.remove('light', 'xy-theme-light');
            clonedViewport.classList.add('dark', 'xy-theme-dark');

            clonedViewport.style.setProperty('--xy-edge-stroke', edgeColor);
            clonedViewport.style.setProperty('--xy-edge-stroke-selected', edgeColor);
            clonedViewport.style.setProperty('--xy-node-background-color', '#111827');
            clonedViewport.style.setProperty('--xy-node-border-default', '2px solid #334155');

            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              .react-flow__handle, .react-flow__controls, .react-flow__attribution, .react-flow__background { 
                display: none !important; 
              }
              .react-flow__edge-path {
                stroke: ${edgeColor} !important;
                stroke-width: 2.5px !important;
                stroke-opacity: 1 !important;
              }
              .erd-node-container { 
                box-shadow: none !important; 
                background-color: #111827 !important;
                border: 2px solid #334155 !important;
              }
            `;
            clonedDoc.body.appendChild(style);

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

        // WebKit/Orion compatibility: Sometimes it needs a small delay or double-render
        // For SVG download, we use toSvg. For PDF, we use toPng for best compatibility.
        const dataUrl = isPdf ? await toPng(viewportElement, options) : await toSvg(viewportElement, options);

        if (isPdf) {
          const pdfWidth = width * 0.75;
          const pdfHeight = height * 0.75;

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
          link.download = `${fileName.replace(/\s+/g, '_').toLowerCase()}.svg`;
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
      loading: `Generating Sharp ${format.toUpperCase()}...`,
      success: 'Export successful!',
      error: 'Export failed.'
    });
  }, [getNodes]);

  const handleExportImage = useCallback((fileName: string) => {
    return handleExport('svg', fileName);
  }, [handleExport]);

  const handleExportPDF = useCallback((fileName: string) => {
    return handleExport('pdf', fileName);
  }, [handleExport]);

  return { handleExportImage, handleExportPDF };
}
