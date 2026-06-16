import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { isValidViewType, getValidViewTypes, findRule, upsertRule } from "./service.js";
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

    const userId = (req as any).user.id;
    const data = await findRule(userId, viewType);

    res.json(
      data || { view_type: viewType, content: "", is_enabled: true }
    );
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

    const { content, is_enabled } = req.body;
    const userId = (req as any).user.id;
    const result = await upsertRule(userId, viewType, content, is_enabled);

    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to save AI rules");
  }
}
