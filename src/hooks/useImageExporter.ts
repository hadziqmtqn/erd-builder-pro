import { useCallback } from 'react';
import { toPng, toSvg } from 'html-to-image';
import download from 'downloadjs';
import { getNodesBounds, useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';

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
        // Target the viewport specifically to avoid duplicates from other layers
        const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
        if (!viewport) {
          reject("Flow viewport not found");
          return;
        }

        // 1. Calculate the actual bounds of all nodes
        const bounds = getNodesBounds(nodes);
        
        // 2. Add generous padding
        const padding = 60;
        const width = bounds.width + padding * 2;
        const height = bounds.height + padding * 2;

        const options = {
          backgroundColor: '#09090b', // zinc-950
          width: width,
          height: height,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            // Shift the content so the top-left node is at the top-left of the image
            transform: `translate(${-bounds.x + padding}px, ${-bounds.y + padding}px) scale(1)`,
          },
          onClone: (clonedDoc: Document) => {
            // Force every SVG path to be visible and white
            const paths = clonedDoc.querySelectorAll('path.react-flow__edge-path');
            paths.forEach((path: any) => {
              path.setAttribute('stroke', '#ffffff');
              path.setAttribute('stroke-width', '3');
              path.setAttribute('stroke-opacity', '1');
              path.style.stroke = '#ffffff';
              path.style.strokeWidth = '3px';
              // Ensure consistent dashing for export
              path.setAttribute('stroke-dasharray', '6,6');
            });

            // Ensure edge labels are legible
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
              // Fix label positioning in clone
              label.style.pointerEvents = 'none';
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

  return { handleExportImage };
}
