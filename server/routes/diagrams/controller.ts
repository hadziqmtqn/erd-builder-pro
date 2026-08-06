import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase } from "../../lib/config.js";
import { handleError } from "../../lib/utils.js";
import { resolveOwnedProjectId } from "../../lib/security.js";
import { decrypt } from "../../lib/crypto.js";
import { prisma } from "../../lib/prisma.js";
import * as diagService from "./service.js";
import * as saveService from "./save-service.js";
import type { ConnectionInfo } from "../../lib/db-connectors/types.js";

export async function list(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const projectId = req.query.project_id as string;
    const q = req.query.q as string;
    const rawPublic = req.query.is_public as string;
    const isPublic = rawPublic === "true" ? true : rawPublic === "false" ? false : null;
    const rawSourceType = req.query.source_type as string;
    const sourceType = rawSourceType === "blank" || rawSourceType === "production_db" ? rawSourceType : undefined;
    const userId = (req as any).user.id;

    const result = await diagService.listDiagrams(userId, { limit, offset, projectId, q, isPublic, sourceType });
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch diagrams");
  }
}

export async function create(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    if (!prisma) { res.status(500).json({ error: "Database connection not available" }); return; }
    const userId = (req as any).user.id;
    const { name, project_id, uid } = req.body;
    const resolvedProjectId = await resolveOwnedProjectId(prisma, userId, project_id);

    const diagram = await diagService.createDiagram({
      name, projectId: resolvedProjectId, userId, uid,
    });
    res.json(diagram);
  } catch (err: any) {
    handleError(res, err, "Failed to create diagram");
  }
}

export async function get(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await saveService.getDiagramWithData(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Diagram not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch diagram");
  }
}

export async function update(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { name } = req.body;

    const result = await diagService.updateDiagram(req.params.uid, userId, { name });
    if (!result) { res.status(404).json({ error: "Diagram not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update diagram");
  }
}

export async function remove(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await diagService.softDeleteDiagram(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Diagram not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to delete diagram");
  }
}

export async function restore(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const result = await diagService.restoreDiagram(req.params.uid, userId);
    if (!result) { res.status(404).json({ error: "Diagram not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to restore diagram");
  }
}

export async function permanentDelete(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const diagram = await diagService.getDiagram(req.params.uid, userId);
    if (!diagram) { res.status(404).json({ error: "Diagram not found" }); return; }

    await diagService.permanentDeleteDiagram(Number(diagram.id));
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete diagram");
  }
}

export async function updateShare(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { uid } = req.params;
    const { is_public, share_token, expiry_date } = req.body;
    const userId = (req as any).user.id;

    const result = await diagService.updateDiagramShare(uid, userId, {
      isPublic: is_public,
      shareToken: share_token,
      expiryDate: expiry_date ? new Date(expiry_date) : null,
    });
    if (!result) { res.status(404).json({ error: "Diagram not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update share settings");
  }
}

export async function moveToProject(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const raw = req.body.project_id;
    const projectId = (raw === null || raw === undefined || raw === '' || raw === 'none' || raw === 'uncategorized')
      ? null
      : Number(raw);

    const result = await diagService.updateDiagram(req.params.uid, userId, { projectId });
    if (!result) { res.status(404).json({ error: "Diagram not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to move diagram to project");
  }
}

export async function getPublic(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const diagram = await diagService.getPublicDiagram(req.params.uid);
    if (!diagram) { res.status(404).json({ error: "Diagram not found" }); return; }

    if (diagram.project?.isDeleted) {
      res.status(404).json({ error: "Diagram not found (associated project deleted)" }); return;
    }
    if (diagram.isDeleted) {
      res.status(404).json({ error: "Diagram not found" }); return;
    }
    if (!diagram.isPublic) {
      res.status(403).json({ error: "This document is private" }); return;
    }

    let isOwner = false;
    const sessionToken = req.cookies.token;
    if (sessionToken) {
      const { data: { user } } = await supabase.auth.getUser(sessionToken);
      if (user && user.id === diagram.userId) isOwner = true;
    }

    if (!isOwner) {
      if (diagram.expiryDate && new Date(diagram.expiryDate) < new Date()) {
        res.status(403).json({ error: "This share link has expired" }); return;
      }
      const providedToken = (req.headers["x-share-token"] as string) || (req.query.token as string);
      if (diagram.shareToken && diagram.shareToken !== providedToken) {
        res.status(401).json({ error: "Invalid access token", requiresToken: true }); return;
      }
    }

    // Full diagram with entities for public view
    const diagramId = Number(diagram.id);
    const entities = await prisma!.entity.findMany({ where: { diagramId } });
    const relationships = await prisma!.relationship.findMany({ where: { diagramId } });

    const entitiesWithColumns = await Promise.all(
      entities.map(async (entity: any) => {
        const columns = await prisma!.column.findMany({
          where: { entityId: entity.id },
          orderBy: { sortOrder: "asc" },
        });
        return {
          ...entity,
          columns: columns.map((column: any) => ({
            ...column,
            enum_values: column.enumValues ?? column.enum_values ?? '',
            max_length: column.maxLength ?? column.max_length ?? null,
            numeric_precision: column.numericPrecision ?? column.numeric_precision ?? null,
            numeric_scale: column.numericScale ?? column.numeric_scale ?? null,
          })),
        };
      })
    );

    res.json({ ...diagram, entities: entitiesWithColumns, relationships });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch public diagram");
  }
}

// ── Save (entities/relationships/columns CRUD + versioning) ──

export async function save(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const identifier = req.params.uid;

    const result = await saveService.saveDiagram(identifier, userId, req.body);

    if (!result) { res.status(404).json({ error: "Diagram not found" }); return; }
    if ((result as any).conflict) {
      res.status(409).json(result);
      return;
    }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to save diagram");
  }
}

// ── DB Connect: external schema ──

export async function fetchSchema(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { type, host, port, user, password, password_encrypted, database } = req.body as Partial<ConnectionInfo> & { password_encrypted?: string };

    if (!type || !database) {
      res.status(400).json({ error: "type and database are required" });
      return;
    }

    let finalPassword = password;
    if (!finalPassword && password_encrypted) {
      try { finalPassword = decrypt(password_encrypted); } catch (e) { /* ignore */ }
    }

    const connInfo: ConnectionInfo = {
      type: type as "postgresql" | "mysql" | "sqlite",
      host: host || undefined,
      port: port || undefined,
      user: user || undefined,
      password: finalPassword || undefined,
      database,
    };

    const tables = await saveService.fetchDBSchema(connInfo);
    res.json({ schema: tables });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch schema");
  }
}

export async function testDbConnection(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { type, host, port, user, password, database } = req.body as Partial<ConnectionInfo>;

    if (!type || !database) {
      res.status(400).json({ error: "type and database are required" });
      return;
    }

    const connInfo: ConnectionInfo = {
      type: type as "postgresql" | "mysql" | "sqlite",
      host: host || undefined,
      port: port || undefined,
      user: user || undefined,
      password: password || undefined,
      database,
    };

    const result = await saveService.testDBConnection(connInfo);
    res.json({ success: true, message: result });
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
}

export async function createFromDb(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const { name, type, host, port, user, password, database } = req.body;

    if (!name?.trim()) {
      res.status(400).json({ error: "Diagram name is required" });
      return;
    }
    if (!type || !database) {
      res.status(400).json({ error: "type and database are required" });
      return;
    }

    const result = await saveService.createDiagramFromDB({
      name, type, host, port, user, password, database, userId,
    });
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to create diagram from DB");
  }
}
