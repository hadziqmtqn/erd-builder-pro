import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { handleError } from "../lib/utils.js";

const router = Router();

const VALID_VIEW_TYPES = ['erd', 'notes', 'flowchart'];

// GET /api/ai/rules/:viewType — get rules for a view
router.get("/:viewType", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { viewType } = req.params;
    if (!VALID_VIEW_TYPES.includes(viewType)) {
      return res.status(400).json({ error: `Invalid view type. Must be one of: ${VALID_VIEW_TYPES.join(', ')}` });
    }

    const data = await prisma?.userAiRule.findFirst({
      where: {
        userId: (req as any).user.id,
        viewType,
      },
      select: { id: true, viewType: true, content: true, isEnabled: true, updatedAt: true }
    });

    res.json(data || { view_type: viewType, content: '', is_enabled: true });
  } catch (err: any) {
    handleError(res, err, "Failed to fetch AI rules");
  }
});

// PUT /api/ai/rules/:viewType — upsert rules
router.put("/:viewType", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { viewType } = req.params;
    if (!VALID_VIEW_TYPES.includes(viewType)) {
      return res.status(400).json({ error: `Invalid view type. Must be one of: ${VALID_VIEW_TYPES.join(', ')}` });
    }

    const { content, is_enabled } = req.body;
    const userId = (req as any).user.id;

    const existing = await prisma?.userAiRule.findFirst({
      where: { userId, viewType },
      select: { id: true }
    });

    let result;
    if (existing) {
      result = await prisma?.userAiRule.update({
        where: { id: existing.id },
        data: { content, isEnabled: is_enabled ?? true, updatedAt: new Date() }
      });
    } else {
      result = await prisma?.userAiRule.create({
        data: { userId, viewType, content, isEnabled: is_enabled ?? true }
      });
    }

    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to save AI rules");
  }
});

export default router;
