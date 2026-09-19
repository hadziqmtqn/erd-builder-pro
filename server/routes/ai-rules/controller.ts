import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { isValidViewType, getValidViewTypes, findRule, upsertRule, canEditRules, getRulesOwnerId } from "./service.js";
import { handleError } from "../../lib/utils.js";

export async function getRule(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { viewType } = req.params;
    if (!isValidViewType(viewType)) {
      res.status(400).json({
        error: `Invalid view type. Must be one of: ${getValidViewTypes().join(", ")}`,
      });
      return;
    }

    const user = (req as any).user || {};
    const userId = await getRulesOwnerId(String(user.id || ""));
    if (!userId) {
      res.status(503).json({ error: "SuperAdmin AI Rules are not configured." });
      return;
    }
    const data = await findRule(userId, viewType);
    const canEdit = canEditRules(Boolean(user.isSuperAdmin || user.is_super_admin));

    res.json(data ? { ...data, can_edit: canEdit } : { view_type: viewType, content: "", is_enabled: true, can_edit: canEdit });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch AI rules");
  }
}

export async function saveRule(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { viewType } = req.params;
    if (!isValidViewType(viewType)) {
      res.status(400).json({
        error: `Invalid view type. Must be one of: ${getValidViewTypes().join(", ")}`,
      });
      return;
    }

    const user = (req as any).user || {};
    const canEdit = canEditRules(Boolean(user.isSuperAdmin || user.is_super_admin));
    if (!canEdit) {
      res.status(403).json({ error: "Only the SuperAdmin can update shared AI Rules.", code: "SUPER_ADMIN_REQUIRED" });
      return;
    }

    const { content, is_enabled } = req.body;
    const userId = await getRulesOwnerId(String(user.id || ""));
    if (!userId) {
      res.status(503).json({ error: "SuperAdmin AI Rules are not configured." });
      return;
    }
    const result = await upsertRule(userId, viewType, content, is_enabled);

    res.json(result ? { ...result, can_edit: canEdit } : result);
  } catch (err: any) {
    handleError(res, err, "Failed to save AI rules");
  }
}
