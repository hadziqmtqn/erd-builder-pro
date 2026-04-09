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

  const handleExportPDF = useCallback(async (fileName: string = 'diagram', exportTheme: 'light' | 'dark' = 'dark') => {
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

        // 2. DYNAMIC QUALITY: Scale down resolution for very large diagrams to prevent browser freezing
        // Threshold: > 25 nodes starts scaling down from 2x
        let pixelRatio = 2;
        if (nodes.length > 50) pixelRatio = 1.0;
        else if (nodes.length > 25) pixelRatio = 1.5;

        const isLight = exportTheme === 'light';
        const bgColor = isLight ? '#ffffff' : '#09090b';
        const edgeColor = isLight ? '#475569' : '#ffffff';
        const textColor = isLight ? '#0f172a' : '#ffffff';

        const options: any = {
          backgroundColor: bgColor,
          width: width,
          height: height,
          pixelRatio: pixelRatio,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transformOrigin: '0 0',
            transform: `translate(${-bounds.x + padding}px, ${-bounds.y + padding}px) scale(1)`,
            backgroundColor: bgColor, // Force background in style object too
          },
          onClone: (clonedDoc: Document) => {
            // A. INJECT ENHANCED THEME-AWARE CSS
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              body { background-color: ${bgColor} !important; }
              .react-flow__edge-path, .xy-edge-path {
                stroke: ${edgeColor} !important;
                stroke-width: 2.5px !important;
                stroke-opacity: 1 !important;
                stroke-dasharray: none !important;
                fill: none !important;
              }
              /* LIGHT MODE OVERRIDES for nodes */
              ${isLight ? `
                .react-flow__node-entity { 
                  background-color: #ffffff !important; 
                  border-color: #e2e8f0 !important;
                  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
                }
                .react-flow__node-entity [class*="text-foreground"], 
                .react-flow__node-entity .text-white,
                .react-flow__node-entity [class*="text-white"],
                .react-flow__node-entity [class*="font-bold"] { 
                  color: #0f172a !important; 
                }
                .react-flow__node-entity hr,
                .react-flow__node-entity .border-t {
                  border-color: #e2e8f0 !important;
                }
                /* PK/FK Badge adjustments for light mode */
                .react-flow__node-entity .text-indigo-400 { color: #4f46e5 !important; }
                .react-flow__node-entity .text-pink-400 { color: #db2777 !important; }
                .react-flow__node-entity .text-amber-400 { color: #d97706 !important; }
                .react-flow__node-entity .bg-muted\\/50 { background-color: #f8fafc !important; }
              ` : ''}

              .react-flow__edges { overflow: visible !important; }
              /* Force markers (arrows) to be theme-colored and visible */
              [id^="react-flow__arrow"] path, 
              marker path {
                fill: ${edgeColor} !important;
                stroke: ${edgeColor} !important;
                stroke-width: 1px !important;
                opacity: 1 !important;
              }
            `;
            clonedDoc.head.appendChild(style);

            // B. SVG DEFS CLONING
            const mainSvg = root.querySelector('svg.react-flow__container--svg');
            const defs = mainSvg?.querySelector('defs');
            const clonedSvg = clonedDoc.querySelector('svg.react-flow__edges') as SVGElement;
            
            if (clonedSvg) {
              clonedSvg.setAttribute('width', `${width}`);
              clonedSvg.setAttribute('height', `${height}`);
              if (defs) {
                const clonedDefs = defs.cloneNode(true) as SVGDefsElement;
                clonedDefs.querySelectorAll('path').forEach(p => {
                    p.setAttribute('fill', edgeColor);
                    p.setAttribute('stroke', edgeColor);
                });
                clonedSvg.prepend(clonedDefs);
              }
            }
          }
        };

        const dataUrl = await toPng(viewport, options);

        const pdfWidth = width * 0.75;
        const pdfHeight = height * 0.75;

        const pdf = new jsPDF({
          orientation: pdfWidth > pdfHeight ? 'l' : 'p',
          unit: 'pt',
          format: [pdfWidth, pdfHeight],
          compress: true
        });

        pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        pdf.save(`${fileName.replace(/\s+/g, '_').toLowerCase()}_${exportTheme}_${new Date().getTime()}.pdf`);
        resolve(true);
      } catch (err) {
        console.error("PDF Export failed:", err);
        reject(err);
      }
    });

    toast.promise(exportPromise, {
      loading: `Generating ${exportTheme === 'light' ? 'Light' : 'Dark'} PDF...`,
      success: 'PDF Export successful!',
      error: 'Failed to export PDF.'
    });
  }, [getNodes]);

  return { handleExportImage, handleExportPDF };
}
