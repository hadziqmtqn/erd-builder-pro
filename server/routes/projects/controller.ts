import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { handleError } from "../../lib/utils.js";
import * as svc from "./service.js";
import { clearProjectAccess, isGrantableRole, listProjectAccess, setProjectAccess, type AccessResult } from "./access.js";

export async function list(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const q = req.query.q as string;
    const userId = (req as any).user.id;

    const result = await svc.listProjects(userId, { limit, offset, q });
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch projects");
  }
}

export async function selectable(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    res.json({ data: await svc.listSelectableProjects((req as any).user.id) });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch selectable projects");
  }
}

export async function create(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { name } = req.body;
    const userId = (req as any).user.id;
    const project = await svc.createProject(name, userId);
    if (!project) { res.status(500).json({ error: "Failed to create project" }); return; }
    res.json(project);
  } catch (err: any) {
    handleError(res, err, "Failed to create project");
  }
}

export async function update(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { name } = req.body;
    const userId = (req as any).user.id;
    const result = await svc.updateProject(Number(req.params.id), userId, name);
    if (!result.success) { res.status(403).json({ error: "Only the Project creator can rename this Project." }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update project");
  }
}

export async function remove(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    const result = await svc.softDeleteProject(projectId, userId);
    if (!result.success) { res.status(403).json({ error: "Only the Project creator can delete this Project and its files." }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to delete project");
  }
}

export async function restore(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    const result = await svc.restoreProject(projectId, userId);
    if (!result.success) { res.status(403).json({ error: "Only the Project creator can restore this Project and its files." }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to restore project");
  }
}

export async function permanentDelete(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    const result = await svc.permanentDeleteProject(projectId, userId);
    if (!result.success) { res.status(403).json({ error: "Only the Project creator can permanently delete this Project and its files." }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete project");
  }
}

export async function siblings(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    const result = await svc.getProjectSiblings(projectId, userId);
    if (!result) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch siblings");
  }
}

export async function summary(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    const includeDbClient = req.query.include_db_client !== "false";
    const result = await svc.getProjectSummary(projectId, userId, includeDbClient);
    if (!result) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch project summary");
  }
}

export async function files(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    const includeDbClient = req.query.include_db_client !== "false";
    const result = await svc.listProjectFiles(projectId, userId, includeDbClient);
    if (!result) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch project files");
  }
}

const PAGE_SIZES = [10, 20, 50, 100];

/** GET /api/projects/files — one page of a Project's files for the Project page (COL-008). */
export async function filePage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = String(req.query.project_id ?? "");
    const type = String(req.query.type ?? "all");
    if (projectId !== "null" && !/^\d+$/.test(projectId)) { res.status(400).json({ error: "Invalid project_id" }); return; }
    if (type !== "all" && !(svc.PROJECT_FILE_TYPES as readonly string[]).includes(type)) { res.status(400).json({ error: "Invalid type" }); return; }
    const limit = PAGE_SIZES.includes(Number(req.query.limit)) ? Number(req.query.limit) : 10;
    const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
    const result = await svc.listProjectFilePage((req as any).user.id, {
      projectId,
      type: type as svc.ProjectFileType | "all",
      limit,
      offset,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      includeDbClient: req.query.include_db_client === "true",
    });
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch project files");
  }
}

// ── Project access (COL-004) ──

function sendAccess<T>(res: ExpressResponse, result: AccessResult<T>): void {
  if ("data" in result) res.json(result.data);
  else res.status(result.status).json({ error: result.error });
}

export async function listAccess(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    sendAccess(res, await listProjectAccess(Number(req.params.id), (req as any).user.id));
  } catch (err: any) {
    handleError(res, err, "Failed to load project access");
  }
}

export async function setAccess(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    if (!isGrantableRole(req.body?.role)) { res.status(400).json({ error: "Role must be editor, commenter or viewer" }); return; }
    sendAccess(res, await setProjectAccess(Number(req.params.id), (req as any).user.id, req.params.userId, req.body.role));
  } catch (err: any) {
    handleError(res, err, "Failed to update project access");
  }
}

export async function clearAccess(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    sendAccess(res, await clearProjectAccess(Number(req.params.id), (req as any).user.id, req.params.userId));
  } catch (err: any) {
    handleError(res, err, "Failed to remove project access");
  }
}
