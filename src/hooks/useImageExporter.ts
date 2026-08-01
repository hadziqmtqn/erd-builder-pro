import { useCallback } from 'react';
import { Edge, Node, useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';
import { downloadSVG } from '@/lib/downloadSVG';
import { generateErdSVG } from '@/lib/generateErdSVG';
import type { Entity } from '@/types';

export function useImageExporter() {
  const { getNodes, getEdges } = useReactFlow<Node<Entity>, Edge>();

  const handleExportImage = useCallback((fileName: string = 'diagram') => {
    const nodes = getNodes();
    if (nodes.length === 0) {
      toast.error("Canvas is empty");
      return;
    }

    try {
      const svg = generateErdSVG(nodes, getEdges(), document.documentElement.classList.contains('dark') ? 'dark' : 'light');
      downloadSVG(svg, `${fileName.replace(/\s+/g, '_').toLowerCase()}.svg`);
      toast.success('SVG exported successfully');
    } catch (error) {
      console.error('SVG export failed:', error);
      toast.error('SVG export failed.');
    }
  }, [getEdges, getNodes]);

  return { handleExportImage };
}
