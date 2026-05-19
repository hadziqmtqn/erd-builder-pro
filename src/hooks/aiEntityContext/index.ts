import { EntityContext, EntityContextData, EntityContextResult } from './types';
import { fetchNote, buildNoteContext } from './note';
import { fetchDiagram, buildDiagramContext } from './diagram';
import { fetchFlowchart, buildFlowchartContext } from './flowchart';
import { fetchDrawing, buildDrawingContext } from './drawing';
import { fetchSiblings } from './siblings';
import { formatContextText } from './format';

async function fetchCurrentEntity(ctx: EntityContext) {
  switch (ctx.entityType) {
    case 'note':
      return fetchNote(ctx.entityUid);
    case 'diagram':
      return fetchDiagram(ctx.entityUid);
    case 'drawing':
      return fetchDrawing(ctx.entityUid);
    case 'flowchart':
      return fetchFlowchart(ctx.entityUid);
    default:
      return null;
  }
}

export function buildEntityContextText(
  entityType: string,
  data: EntityContextData,
): string | null {
  switch (entityType) {
    case 'note':
      return buildNoteContext(data);
    case 'diagram':
      return buildDiagramContext(data);
    case 'flowchart':
      return buildFlowchartContext(data);
    case 'drawing':
      return buildDrawingContext(data);
    default:
      return null;
  }
}

export async function fetchEntityContext(
  ctx: EntityContext,
): Promise<EntityContextResult | null> {
  const entity = await fetchCurrentEntity(ctx);
  if (!entity) return null;

  const siblings = await fetchSiblings(
    ctx.entityType,
    ctx.entityUid,
    entity.projectId,
  );

  const contextText = formatContextText(ctx.entityType, entity, siblings);

  return {
    contextText,
    projectId: entity.projectId,
  };
}

export type { EntityContext, EntityContextResult, EntityContextData };
