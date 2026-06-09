import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { handleError } from "../lib/utils.js";

const router = Router();

const VALID_VIEW_TYPES = ['erd', 'notes', 'flowchart'];

const DEFAULT_RULES: Record<string, string> = {
  erd: '- Setiap tabel harus memiliki kolom created_at dan updated_at dengan tipe TIMESTAMP.\n- Gunakan snake_case untuk semua penamaan tabel dan kolom.\n- Setiap tabel harus memiliki PRIMARY KEY bernama id dengan tipe BIGSERIAL.\n- Gunakan FOREIGN KEY yang konsisten dengan nama kolom berakhiran _id.\n- Hindari ENUM — gunakan VARCHAR dengan CHECK constraint.\n- Tambahkan kolom deleted_at untuk soft delete pada tabel master.',
  notes: '- Gunakan bahasa Indonesia untuk isi catatan.\n- Struktur: gunakan heading, bullet points, dan code block.\n- Setiap catatan harus memiliki summary di awal.\n- Gunakan bahasa formal dan hindari slang.',
  flowchart: '- Gunakan label singkat dan jelas (maks 3 kata per simbol).\n- Setiap diagram harus memiliki minimal satu Start dan satu End node.\n- Beri nama yang deskriptif pada setiap cabang (decision label).',
};

// GET /api/ai/rules/:viewType — get rules for a view
router.get("/:viewType", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const { viewType } = req.params;
    if (!VALID_VIEW_TYPES.includes(viewType)) {
      return res.status(400).json({ error: `Invalid view type. Must be one of: ${VALID_VIEW_TYPES.join(', ')}` });
    }

    const userId = (req as any).user.id;

    let data = await prisma?.userAiRule.findFirst({
      where: { userId, viewType },
      select: { id: true, viewType: true, content: true, isEnabled: true, updatedAt: true }
    });

    // Auto-seed default rules on first access
    if (!data && prisma) {
      data = await prisma.userAiRule.create({
        data: { userId, viewType, content: DEFAULT_RULES[viewType] ?? '', isEnabled: true },
        select: { id: true, viewType: true, content: true, isEnabled: true, updatedAt: true }
      });
    }

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
