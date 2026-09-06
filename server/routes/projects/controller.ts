import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { handleError } from "../../lib/utils.js";
import * as svc from "./service.js";

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
    if (!result.success) { res.status(403).json({ error: "Only the Project creator, a Team Manager, or the SuperAdmin can manage this Project." }); return; }
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
    if (!result.success) { res.status(403).json({ error: "Only the Project creator, a Team Manager, or the SuperAdmin can manage this Project." }); return; }
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
    if (!result.success) { res.status(403).json({ error: "Only the Project creator, a Team Manager, or the SuperAdmin can manage this Project." }); return; }
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
    if (!result.success) { res.status(403).json({ error: "Only the Project creator, a Team Manager, or the SuperAdmin can manage this Project." }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to permanently delete project");
  }
}

export async function siblings(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    res.json(await svc.getProjectSiblings(projectId, userId));
  } catch (err: any) {
    handleError(res, err, "Failed to fetch siblings");
  }
}

export async function summary(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    const includeDbClient = req.query.include_db_client !== "false";
    res.json(await svc.getProjectSummary(projectId, userId, includeDbClient));
  } catch (err: any) {
    handleError(res, err, "Failed to fetch project summary");
  }
}

export async function files(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const userId = (req as any).user.id;
    const includeDbClient = req.query.include_db_client !== "false";
    res.json(await svc.listProjectFiles(projectId, userId, includeDbClient));
  } catch (err: any) {
    handleError(res, err, "Failed to fetch project files");
  }
}
