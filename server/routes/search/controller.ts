import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { handleError } from "../../lib/utils.js";
import * as service from "./service.js";

export async function list(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const query = String(req.query.q || "").trim();
    if (query.length < 2) {
      res.json({ data: [] });
      return;
    }
    if (query.length > 100) {
      res.status(400).json({ error: "Search query is too long" });
      return;
    }
    const data = await service.searchDocuments((req as any).user.id, query);
    res.json({ data });
  } catch (err: any) {
    handleError(res, err, "Failed to search workspace");
  }
}

export async function listFiles(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const data = await service.listMentionFiles((req as any).user.id);
    res.json({ data });
  } catch (err: any) {
    handleError(res, err, "Failed to list workspace files");
  }
}

export async function recent(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const data = await service.listRecentFiles((req as any).user.id);
    res.json({ data });
  } catch (err: any) {
    handleError(res, err, "Failed to load recent files");
  }
}
