import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { handleError } from "../../lib/utils.js";
import { requireAdmin } from "../../lib/security.js";
import * as aiService from "./service.js";

function getUserId(req: ExpressRequest): string {
  return (req as any).user.id;
}

// ── Providers ──

export async function listProviders(_req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    res.json(await aiService.listProviders());
  } catch (err: any) {
    handleError(res, err, "Failed to fetch providers");
  }
}

export async function updateProvider(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const { base_url } = req.body;
    const result = await aiService.updateProvider(Number(req.params.id), base_url);
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to update provider");
  }
}

// ── Configs ──

export async function listConfigs(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    res.json(await aiService.listConfigs(getUserId(req)));
  } catch (err: any) {
    handleError(res, err, "Failed to fetch configs");
  }
}

export async function saveConfig(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = getUserId(req);
    const { provider_id, api_key, selected_model_id, is_enabled } = req.body;
    if (!provider_id) { res.status(400).json({ error: "provider_id is required" }); return; }
    const result = await aiService.upsertConfig(userId, { provider_id: Number(provider_id), api_key, selected_model_id, is_enabled });
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to save config");
  }
}

export async function testConfigConnection(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = getUserId(req);
    const { provider_code, model_identifier } = req.body;
    if (!provider_code) { res.status(400).json({ error: "provider_code is required" }); return; }

    const result = await aiService.testConnection(userId, provider_code, model_identifier);
    if ((result as any).error) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Connection test failed");
  }
}

// ── Models ──

export async function listModels(_req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    res.json(await aiService.listModels());
  } catch (err: any) {
    handleError(res, err, "Failed to fetch models");
  }
}

export async function createModel(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    if (!requireAdmin(req, res)) return;
    const { provider_id, model_identifier, display_name } = req.body;
    if (provider_id && Number.isNaN(Number(provider_id))) { res.status(400).json({ error: "Invalid provider_id" }); return; }
    res.json(await aiService.createModel({ provider_id: Number(provider_id), model_identifier, display_name }));
  } catch (err: any) {
    handleError(res, err, "Failed to create model");
  }
}

export async function updateModel(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    if (!requireAdmin(req, res)) return;
    const modelId = Number(req.params.id);
    if (Number.isNaN(modelId)) { res.status(400).json({ error: "Invalid model id" }); return; }
    const { provider_id, model_identifier, display_name } = req.body;
    res.json(await aiService.updateModel(modelId, { provider_id: Number(provider_id), model_identifier, display_name }));
  } catch (err: any) {
    handleError(res, err, "Failed to update model");
  }
}

export async function deleteModel(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    if (!requireAdmin(req, res)) return;
    const modelId = Number(req.params.id);
    if (Number.isNaN(modelId)) { res.status(400).json({ error: "Invalid model id" }); return; }
    res.json(await aiService.deleteModel(modelId));
  } catch (err: any) {
    handleError(res, err, "Failed to delete model");
  }
}

// ── Prompts ──

export async function listPrompts(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    res.json(await aiService.listPrompts(getUserId(req)));
  } catch (err: any) {
    handleError(res, err, "Failed to fetch prompts");
  }
}

export async function savePrompt(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = getUserId(req);
    const isAdmin = !!requireAdmin(req, res); // contextual check
    const result = await aiService.savePrompt(userId, req.body, isAdmin);
    if ((result as any).notFound) { res.status(404).json({ error: "Prompt not found" }); return; }
    if ((result as any).forbidden) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to save prompt");
  }
}

export async function deletePrompt(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const userId = getUserId(req);
    const isAdmin = !!requireAdmin(req, res);
    const result = await aiService.deletePrompt(req.params.id, userId, isAdmin);
    if ((result as any).notFound) { res.status(404).json({ error: "Prompt not found" }); return; }
    if ((result as any).forbidden) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to delete prompt");
  }
}

export async function toggleDefaultPrompt(req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    const isAdmin = !!requireAdmin(req, res);
    const result = await aiService.toggleDefaultPrompt(req.params.id, req.body.is_default, isAdmin);
    if ((result as any).notFound) { res.status(404).json({ error: "Prompt not found" }); return; }
    if ((result as any).forbidden) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json(result);
  } catch (err: any) {
    handleError(res, err, "Failed to toggle default prompt");
  }
}

// ── Initialize ──

export async function initializeDefaults(_req: ExpressRequest, res: ExpressResponse): Promise<void> {
  try {
    if (!requireAdmin(_req, res)) return;
    res.json(await aiService.initializeDefaults());
  } catch (err: any) {
    handleError(res, err, "Failed to initialize AI settings");
  }
}
