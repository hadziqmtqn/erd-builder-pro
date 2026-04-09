import { useCallback } from 'react';
import { toPng, toSvg } from 'html-to-image';
import download from 'downloadjs';
import { getNodesBounds, useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

export function useImageExporter() {
  const { getNodes } = useReactFlow();

  const handleExportImage = useCallback(async (format: 'png' | 'svg', fileName: string = 'diagram') => {
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

        // 1. Calculate bounds with a generous safety margin
        const bounds = getNodesBounds(nodes);
        const padding = 100;
        
        // Account for node width/height often being slightly larger than reported
        const width = bounds.width + padding * 2;
        const height = bounds.height + padding * 2;

        const options: any = {
          backgroundColor: '#09090b',
          width: width,
          height: height,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            // Set transform origin and ensure scale(1)
            transformOrigin: '0 0',
            transform: `translate(${-bounds.x + padding}px, ${-bounds.y + padding}px) scale(1)`,
          },
          onClone: (clonedDoc: Document) => {
            // CRITICAL: Clone SVG defs (arrows) into the viewport's SVG
            const rootSvg = root.querySelector(':scope > svg');
            const defs = rootSvg?.querySelector('defs');
            const targetSvg = clonedDoc.querySelector('svg.react-flow__edges');
            
            if (defs && targetSvg) {
              const clonedDefs = defs.cloneNode(true);
              targetSvg.prepend(clonedDefs);
            }

            // Style edges aggressively
            const paths = clonedDoc.querySelectorAll('path.react-flow__edge-path');
            paths.forEach((path: any) => {
              path.setAttribute('stroke', '#ffffff');
              path.setAttribute('stroke-width', '2.5');
              path.setAttribute('fill', 'none');
              path.style.stroke = '#ffffff';
              path.style.strokeWidth = '2.5px';
              path.style.fill = 'none';
              path.style.opacity = '1';
              path.setAttribute('visibility', 'visible');
            });

            // Ensure nodes and their content are fully visible
            const nodesContainer = clonedDoc.querySelector('.react-flow__nodes');
            if (nodesContainer instanceof HTMLElement) {
              nodesContainer.style.overflow = 'visible';
            }

            // Fix edge labels
            const labels = clonedDoc.querySelectorAll('.react-flow__edge-label');
            labels.forEach((label: any) => {
              const innerDiv = label.querySelector('div');
              if (innerDiv) {
                innerDiv.style.background = '#1e293b';
                innerDiv.style.color = '#ffffff';
                innerDiv.style.padding = '4px 8px';
                innerDiv.style.borderRadius = '6px';
                innerDiv.style.fontSize = '12px';
                innerDiv.style.fontWeight = 'bold';
                innerDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
              }
            });
          }
        };

        let dataUrl = '';
        if (format === 'png') {
          dataUrl = await toPng(viewport, options);
        } else {
          dataUrl = await toSvg(viewport, options);
        }

        download(dataUrl, `${fileName.replace(/\s+/g, '_').toLowerCase()}_${new Date().getTime()}.${format}`);
        resolve(true);
      } catch (err) {
        console.error("Export failed:", err);
        reject(err);
      }
    });

    toast.promise(exportPromise, {
      loading: `Generating ${format.toUpperCase()}...`,
      success: 'Export successful!',
      error: 'Failed to export image.'
    });
  }, [getNodes]);

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

        const bounds = getNodesBounds(nodes);
        const padding = 100;
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
            const rootSvg = root.querySelector(':scope > svg');
            const defs = rootSvg?.querySelector('defs');
            const targetSvg = clonedDoc.querySelector('svg.react-flow__edges');
            
            if (defs && targetSvg) {
              const clonedDefs = defs.cloneNode(true);
              targetSvg.prepend(clonedDefs);
            }

            const paths = clonedDoc.querySelectorAll('path.react-flow__edge-path');
            paths.forEach((path: any) => {
              path.setAttribute('stroke', '#ffffff');
              path.setAttribute('stroke-width', '2.5');
              path.setAttribute('fill', 'none');
              path.style.stroke = '#ffffff';
              path.style.strokeWidth = '2.5px';
            });

            const labels = clonedDoc.querySelectorAll('.react-flow__edge-label');
            labels.forEach((label: any) => {
              const innerDiv = label.querySelector('div');
              if (innerDiv) {
                innerDiv.style.background = '#1e293b';
                innerDiv.style.color = '#ffffff';
                innerDiv.style.padding = '4px 8px';
                innerDiv.style.borderRadius = '6px';
                innerDiv.style.fontSize = '12px';
                innerDiv.style.fontWeight = 'bold';
              }
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
