import { prisma } from "../../lib/prisma.js";

export type CommentFeature = "diagram" | "note" | "drawing" | "flowchart";
export type CommentAnchor = "table" | "relationship" | "block" | "shape" | "point";
export type CommentFile = { id: number; projectId: number | bigint; label: string; featureType: CommentFeature };

function decodeData(value: string | null): any {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function shortLabel(value: unknown, fallback: string): string {
  const label = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return (label || fallback).slice(0, 120);
}

export async function resolveCommentAnchorLabel(file: CommentFile | null, type: string, id: string | undefined): Promise<string | null> {
  if (!prisma || !file || !id || id.length > 128) return null;

  if (file.featureType === "diagram") {
    if (type === "table") {
      const rows = await prisma.$queryRawUnsafe<Array<{ label: string }>>(
        'SELECT "name" AS "label" FROM "entities" WHERE "id" = $1 AND "diagram_id" = $2 LIMIT 1', id, file.id,
      );
      return rows[0]?.label || null;
    }
    if (type === "relationship") {
      const rows = await prisma.$queryRawUnsafe<Array<{ label: string }>>(`
        SELECT COALESCE(NULLIF(r."label", ''), NULLIF(concat_ws(' → ', source."name", target."name"), ''), 'Relationship') AS "label"
        FROM "relationships" r
        LEFT JOIN "entities" source ON source."id" = r."source_entity_id"
        LEFT JOIN "entities" target ON target."id" = r."target_entity_id"
        WHERE r."id" = $1 AND r."diagram_id" = $2
        LIMIT 1
      `, id, file.id);
      return rows[0]?.label || null;
    }
    return null;
  }

  if (file.featureType === "note") {
    if (type !== "block" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const rows = await prisma.$queryRawUnsafe<Array<{ content: string | null }>>(
      'SELECT "content" FROM "notes" WHERE "id" = $1 AND "project_id" = $2 LIMIT 1', file.id, file.projectId,
    );
    return rows[0]?.content?.includes(`data-comment-anchor-id="${id}"`) ? `${file.label} · Block` : null;
  }

  if (file.featureType === "drawing") {
    if (type !== "point") return null;
    const rows = await prisma.$queryRawUnsafe<Array<{ data: string | null }>>(
      'SELECT "data" FROM "drawings" WHERE "id" = $1 AND "project_id" = $2 LIMIT 1', file.id, file.projectId,
    );
    const data = decodeData(rows[0]?.data ?? null);
    const elements = Array.isArray(data) ? data : data?.elements;
    const element = Array.isArray(elements) ? elements.find((item: any) => String(item.id) === id && item.isDeleted !== true) : null;
    return element ? `${file.label} · ${shortLabel(element.text || element.type, "Drawing point")}` : null;
  }

  if (type !== "shape") return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ data: string | null }>>(
    'SELECT "data" FROM "flowcharts" WHERE "id" = $1 AND "project_id" = $2 LIMIT 1', file.id, file.projectId,
  );
  const data = decodeData(rows[0]?.data ?? null);
  const node = Array.isArray(data?.nodes) ? data.nodes.find((item: any) => String(item.id) === id) : null;
  return node ? `${file.label} · ${shortLabel(node.data?.label, "Flowchart shape")}` : null;
}
