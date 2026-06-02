import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/middleware.js";
import { handleError } from "../lib/utils.js";
import { requireAdmin } from "../lib/security.js";

const router = Router();

function getUserId(req: ExpressRequest): string {
  return (req as any).user.id;
}

// GET /api/ai/settings/providers
router.get("/providers", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const data = await prisma?.aiProvider.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' }
    });
    res.json(data || []);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch providers");
  }
});

// GET /api/ai/settings/configs
router.get("/configs", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const data = await prisma?.userAiConfig.findMany({
      where: { userId: getUserId(req) }
    });
    res.json((data || []).map((c: any) => ({
      ...c,
      apiKey: c.apiKey ? '***' : null,
    })));
  } catch (err: any) {
    handleError(res, err, "Failed to fetch configs");
  }
});

// POST /api/ai/settings/configs
router.post("/configs", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = getUserId(req);
    const { provider_id, api_key, selected_model_id, is_enabled } = req.body;
    const providerId = provider_id;

    const data = await prisma?.userAiConfig.upsert({
      where: { userId_providerId: { userId, providerId } },
      create: {
        userId,
        providerId,
        apiKey: api_key,
        selectedModelId: selected_model_id,
        isEnabled: is_enabled ?? true,
      },
      update: {
        apiKey: api_key,
        selectedModelId: selected_model_id,
        isEnabled: is_enabled ?? true,
        updatedAt: new Date(),
      }
    });
    res.json(data ? { ...data, apiKey: data.apiKey ? '***' : null } : null);
  } catch (err: any) {
    handleError(res, err, "Failed to save config");
  }
});

// GET /api/ai/settings/models
router.get("/models", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    const data = await prisma?.aiModel.findMany({
      where: { isActive: true }
    });
    res.json(data || []);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch models");
  }
});

// POST /api/ai/settings/models
router.post("/models", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { provider_id, model_identifier, display_name } = req.body;
    const data = await prisma?.aiModel.create({
      data: {
        providerId: provider_id,
        modelIdentifier: model_identifier,
        displayName: display_name,
        isActive: true,
      }
    });
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to create model");
  }
});

// PUT /api/ai/settings/models/:id
router.put("/models/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { provider_id, model_identifier, display_name } = req.body;
    await prisma?.aiModel.update({
      where: { id: BigInt(req.params.id) },
      data: {
        providerId: provider_id,
        modelIdentifier: model_identifier,
        displayName: display_name,
      }
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update model");
  }
});

// DELETE /api/ai/settings/models/:id
router.delete("/models/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(req, res)) return;
    await prisma?.aiModel.delete({
      where: { id: BigInt(req.params.id) }
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete model");
  }
});

// GET /api/ai/settings/prompts
router.get("/prompts", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = getUserId(req);
    const data = await prisma?.aiSystemPrompt.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      orderBy: { createdAt: 'desc' }
    });
    res.json(data || []);
  } catch (err: any) {
    handleError(res, err, "Failed to fetch prompts");
  }
});

// POST /api/ai/settings/prompts
router.post("/prompts", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = getUserId(req);
    const { id, name, content, category, is_default } = req.body;
    if (id) {
      const existing = await prisma?.aiSystemPrompt.findFirst({
        where: { id },
        select: { id: true, userId: true, isBuiltIn: true },
      });
      if (!existing) return res.status(404).json({ error: "Prompt not found" });
      if (existing.userId !== userId && !requireAdmin(req, res)) return;
      if (existing.isBuiltIn && !requireAdmin(req, res)) return;
      if (is_default && !requireAdmin(req, res)) return;

      const data = await prisma?.aiSystemPrompt.update({
        where: { id },
        data: {
          name,
          content,
          category,
          isDefault: is_default,
          updatedAt: new Date(),
        }
      });
      res.json(data);
    } else {
      if (is_default && !requireAdmin(req, res)) return;
      const data = await prisma?.aiSystemPrompt.create({
        data: {
          name,
          content,
          category,
          isDefault: is_default,
          userId,
        }
      });
      res.json(data);
    }
  } catch (err: any) {
    handleError(res, err, "Failed to save prompt");
  }
});

// DELETE /api/ai/settings/prompts/:id
router.delete("/prompts/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    const userId = getUserId(req);
    const existing = await prisma?.aiSystemPrompt.findFirst({
      where: { id: req.params.id },
      select: { id: true, userId: true, isBuiltIn: true },
    });
    if (!existing) return res.status(404).json({ error: "Prompt not found" });
    if (existing.userId !== userId && !requireAdmin(req, res)) return;
    if (existing.isBuiltIn && !requireAdmin(req, res)) return;
    await prisma?.aiSystemPrompt.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to delete prompt");
  }
});

// PUT /api/ai/settings/prompts/:id/toggle-default
router.put("/prompts/:id/toggle-default", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(req, res)) return;
    const userId = getUserId(req);
    const existing = await prisma?.aiSystemPrompt.findFirst({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: "Prompt not found" });

    const { is_default } = req.body;
    if (is_default) {
      await prisma?.aiSystemPrompt.updateMany({
        where: { id: { not: req.params.id } },
        data: { isDefault: false }
      });
    }
    const data = await prisma?.aiSystemPrompt.update({
      where: { id: req.params.id },
      data: { isDefault: !!is_default }
    });
    res.json(data);
  } catch (err: any) {
    handleError(res, err, "Failed to toggle default prompt");
  }
});

// POST /api/ai/settings/initialize
router.post("/initialize", authenticate, async (_req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(_req, res)) return;
    const defaultProviders = [
      { name: "OpenAI", code: "openai", baseUrl: "https://api.openai.com/v1", isActive: true },
      { name: "Google Gemini", code: "gemini", baseUrl: null, isActive: true },
      { name: "OpenAI Compatible", code: "openai_compatible", baseUrl: "https://api.sumopod.com/v1", isActive: true }
    ];

    await prisma?.aiProvider.createMany({
      data: defaultProviders,
      skipDuplicates: true
    });

    const providers = await prisma?.aiProvider.findMany({
      where: { code: { in: defaultProviders.map(p => p.code) } }
    });

    if (providers && providers.length > 0) {
      const modelsToInsert: any[] = [];
      providers.forEach((p: any) => {
        if (p.code === "openai") {
          modelsToInsert.push(
            { providerId: p.id, modelIdentifier: "gpt-4o", displayName: "GPT-4o (Smartest)", isActive: true },
            { providerId: p.id, modelIdentifier: "gpt-4o-mini", displayName: "GPT-4o Mini (Fast)", isActive: true }
          );
        } else if (p.code === "gemini") {
          modelsToInsert.push(
            { providerId: p.id, modelIdentifier: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", isActive: true },
            { providerId: p.id, modelIdentifier: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", isActive: true }
          );
        }
      });

      if (modelsToInsert.length > 0) {
        await prisma?.aiModel.createMany({
          data: modelsToInsert,
          skipDuplicates: true
        });
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to initialize AI settings");
  }
});

// PUT /api/ai/settings/providers/:id
router.put("/providers/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { base_url } = req.body;
    await prisma?.aiProvider.update({
      where: { id: BigInt(req.params.id) },
      data: { baseUrl: base_url }
    });
    res.json({ success: true });
  } catch (err: any) {
    handleError(res, err, "Failed to update provider");
  }
});

export default router;
