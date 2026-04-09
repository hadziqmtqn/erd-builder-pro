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
            // A. NUCLEAR OPTION: Inject global CSS into the clone
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              .react-flow__edge-path, .xy-edge-path {
                stroke: #ffffff !important;
                stroke-width: 3px !important;
                stroke-opacity: 1 !important;
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
              /* Ensure markers (arrows) are white */
              marker path {
                fill: #ffffff !important;
                stroke: #ffffff !important;
              }
            `;
            clonedDoc.head.appendChild(style);

            // B. SVG Normalization
            const rootSvg = root.querySelector('svg.react-flow__container--svg') || root.querySelector(':scope > svg');
            const defs = rootSvg?.querySelector('defs');
            const targetSvg = clonedDoc.querySelector('svg.react-flow__edges') as SVGElement;
            
            if (targetSvg) {
              targetSvg.setAttribute('width', `${width}`);
              targetSvg.setAttribute('height', `${height}`);
              targetSvg.style.width = `${width}px`;
              targetSvg.style.height = `${height}px`;

              if (defs) {
                const clonedDefs = defs.cloneNode(true);
                targetSvg.prepend(clonedDefs);
              }
            }

            // C. Force visibility on every path just in case
            const paths = clonedDoc.querySelectorAll('path.react-flow__edge-path, path.xy-edge-path');
            paths.forEach((path: any) => {
              path.setAttribute('stroke', '#ffffff');
              path.setAttribute('stroke-width', '3');
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
