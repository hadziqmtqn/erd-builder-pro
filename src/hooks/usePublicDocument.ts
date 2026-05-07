import { useState } from 'react';
import { Node, Edge, useReactFlow } from '@xyflow/react';
import { toast } from 'sonner';
import { Entity } from '../types';

export interface ForbiddenDoc {
  title: string;
  message: string;
  status: number;
}

export function usePublicDocument(
  setView: (view: any) => void
) {
  const [isPublicView, setIsPublicView] = useState(false);
  const [publicData, setPublicData] = useState<any>(null);
  const [isPublicLoading, setIsPublicLoading] = useState(false);
  const [forbiddenDoc, setForbiddenDoc] = useState<ForbiddenDoc | null>(null);
  const { setViewport, fitView } = useReactFlow();

  const fetchPublicDocument = async (type: string, uid: string, setNodes?: any, setEdges?: any, token?: string): Promise<boolean> => {
    setIsPublicLoading(true);
    setForbiddenDoc(null);
    try {
      const endpoint = type === 'erd' ? 'files' : (type === 'flowchart' ? 'flowcharts' : type);
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['x-share-token'] = token;
      
      const res = await fetch(`/api/${endpoint}/public/${uid}`, { 
        headers,
        credentials: 'include'
      });
      
      if (!res.ok) {
        let errorMessage = "Document not found or access denied";
        let errorTitle = "Access Denied";
        
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
          if (res.status === 404) errorTitle = "Not Found";
          else if (res.status === 401 || res.status === 403) errorTitle = "Access Denied";
        } catch (e) {}

        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setForbiddenDoc({ title: errorTitle, message: errorMessage, status: res.status });
          return false;
        }
        throw new Error(errorMessage);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Received invalid response from server");
      }

      const data = await res.json();
      
      setPublicData(data);
      setView(type as any);
      
      if (type === 'erd') {
        const flowNodes: Node<Entity>[] = data.entities.map((e: any) => ({
          id: e.id,
          type: 'entity',
          position: { x: e.x, y: e.y },
          data: e,
        }));

        const flowEdges: Edge[] = data.relationships.map((r: any) => {
          const sourceEntity = data.entities.find((e: any) => String(e.id) === String(r.source_entity_id));
          const targetEntity = data.entities.find((e: any) => String(e.id) === String(r.target_entity_id));
          
          let sHandle = r.source_handle;
          let tHandle = r.target_handle;

          if (!sHandle && sourceEntity && targetEntity) {
            const sx = Number(sourceEntity.x) || 0;
            const tx = Number(targetEntity.x) || 0;
            sHandle = sx < tx ? `col-${r.source_column_id}-source` : `col-${r.source_column_id}-source-l`;
          }

          if (!tHandle && sourceEntity && targetEntity) {
            const sx = Number(sourceEntity.x) || 0;
            const tx = Number(targetEntity.x) || 0;
            tHandle = sx < tx ? `col-${r.target_column_id}-target` : `col-${r.target_column_id}-target-r`;
          }

          return {
            id: r.id,
            source: r.source_entity_id,
            target: r.target_entity_id,
            sourceHandle: sHandle || (r.source_column_id ? `col-${r.source_column_id}-source` : undefined),
            targetHandle: tHandle || (r.target_column_id ? `col-${r.target_column_id}-target` : undefined),
            label: r.label,
            type: 'smoothstep',
            animated: true,
          };
        });

        setNodes(flowNodes);
        setEdges(flowEdges);
        const applyViewport = (duration: number = 0) => {
          if (data.viewport_x !== undefined && (data.viewport_x !== 0 || data.viewport_y !== 0)) {
            setViewport({ x: data.viewport_x, y: data.viewport_y, zoom: data.viewport_zoom || 1 }, { duration });
          } else if (flowNodes.length > 0) {
            fitView({ padding: 0.2, duration });
          }
        };

        setTimeout(() => applyViewport(0), 50);
        setTimeout(() => applyViewport(0), 300);
      } else if (type === 'flowchart') {
        try {
          const parsedData = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
          setNodes(parsedData.nodes || []);
          setEdges(parsedData.edges || []);
          
          const applyViewport = (duration: number = 0) => {
            if (data.viewport_x !== undefined && (data.viewport_x !== 0 || data.viewport_y !== 0)) {
              setViewport({ x: data.viewport_x, y: data.viewport_y, zoom: data.viewport_zoom || 1 }, { duration });
            } else if (parsedData.nodes?.length > 0) {
              fitView({ padding: 0.2, duration });
            }
          };

          setTimeout(() => applyViewport(0), 50);
          setTimeout(() => applyViewport(0), 300);
        } catch (e) {
          console.error("Failed to parse flowchart data:", e);
        }
      } else {
        setNodes([]);
        setEdges([]);
      }
      return true;
    } catch (err: any) {
      toast.error(err.message || "Failed to load shared document");
      setTimeout(() => window.location.href = '/', 3000);
      return false;
    } finally {
      setIsPublicLoading(false);
    }
  };

  return {
    isPublicView,
    setIsPublicView,
    publicData,
    isPublicLoading,
    forbiddenDoc,
    fetchPublicDocument
  };
}
