import { prisma } from "../../lib/prisma.js";
import { safeAiBaseUrl } from "../../lib/ai-security.js";
import { protectAiApiKey, revealAiApiKey } from "../../lib/ai-credentials.js";

function providerDto(p: any) {
  return p && {
    id: p.id,
    name: p.name,
    code: p.code,
    base_url: p.baseUrl,
    is_active: p.isActive,
    created_at: p.createdAt,
  };
}

function modelDto(m: any) {
  return m && {
    id: m.id,
    provider_id: m.providerId,
    model_identifier: m.modelIdentifier,
    display_name: m.displayName,
    context_window: m.contextWindow,
    is_active: m.isActive,
    created_at: m.createdAt,
  };
}

function configDto(c: any) {
  return c && {
    id: c.id,
    user_id: c.userId,
    provider_id: c.providerId,
    selected_model_id: c.selectedModelId,
    api_key: c.apiKey ? "***" : null,
    is_enabled: c.isEnabled,
    updated_at: c.updatedAt,
  };
}

// ── Providers ──

export async function listProviders() {
  const providers = await prisma?.aiProvider.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  }) || [];
  return providers.map(providerDto);
}

export async function updateProvider(providerId: number, baseUrl: string) {
  const safeBaseUrl = await safeAiBaseUrl(baseUrl, "https://api.openai.com/v1");
  await prisma?.aiProvider.update({
    where: { id: providerId as any },
    data: { baseUrl: safeBaseUrl },
  });
  return { success: true };
}

// ── User Configs ──

export async function listConfigs(userId: string) {
  const data = await prisma?.userAiConfig.findMany({
    where: { userId },
  }) || [];
  return data.map(configDto);
}

export async function upsertConfig(
  userId: string,
  body: { provider_id: number; api_key?: string; selected_model_id?: number; is_enabled?: boolean }
) {
  const providerId = Number(body.provider_id);
  const selectedModelId = body.selected_model_id != null ? Number(body.selected_model_id) || null : null;
  const apiKey = body.api_key?.trim();
  const hasApiKey = !!(apiKey && apiKey !== "***");
  const encryptedApiKey = hasApiKey ? protectAiApiKey(apiKey) : undefined;

  // Check if config already exists — if creating, api_key is required (NOT NULL)
  const existing = await prisma?.userAiConfig.findUnique({
    where: { userId_providerId: { userId, providerId } },
    select: { id: true },
  });

  if (!existing && !hasApiKey) {
    throw new Error("API key is required when creating a new configuration");
  }

  const data = await prisma?.userAiConfig.upsert({
    where: { userId_providerId: { userId, providerId } },
    create: {
      userId,
      providerId,
      ...(encryptedApiKey ? { apiKey: encryptedApiKey } : {}),
      ...(selectedModelId != null ? { selectedModelId } : {}),
      ...(body.is_enabled != null ? { isEnabled: body.is_enabled } : {}),
    } as any,
    update: {
      ...(encryptedApiKey ? { apiKey: encryptedApiKey } : {}),
      ...(selectedModelId != null ? { selectedModelId } : {}),
      ...(body.is_enabled != null ? { isEnabled: body.is_enabled } : {}),
      updatedAt: new Date(),
    } as any,
  });
  return configDto(data);
}

// ── Models ──

export async function listModels() {
  const models = await prisma?.aiModel.findMany({
    where: { isActive: true },
    orderBy: [{ providerId: "asc" }, { displayName: "asc" }],
  }) || [];
  return models.map(modelDto);
}

export async function createModel(data: {
  provider_id?: number; model_identifier: string; display_name: string;
}) {
  const providerId = data.provider_id ? Number(data.provider_id) : null;
  const model = await prisma?.aiModel.create({
    data: {
      providerId: providerId || null,
      modelIdentifier: data.model_identifier,
      displayName: data.display_name,
      isActive: true,
    },
  });
  return modelDto(model);
}

export async function updateModel(modelId: number, data: {
  provider_id?: number; model_identifier?: string; display_name?: string;
}) {
  const providerId = data.provider_id ? Number(data.provider_id) : null;
  const model = await prisma?.aiModel.update({
    where: { id: modelId as any },
    data: {
      ...(providerId != null ? { providerId: providerId || null } : {}),
      ...(data.model_identifier !== undefined ? { modelIdentifier: data.model_identifier } : {}),
      ...(data.display_name !== undefined ? { displayName: data.display_name } : {}),
    },
  });
  return modelDto(model);
}

export async function deleteModel(modelId: number) {
  await prisma?.aiModel.delete({
    where: { id: modelId as any },
  });
  return { success: true };
}

export async function ensureModel(data: {
  provider_id: number; model_identifier: string; display_name?: string;
}) {
  const providerId = Number(data.provider_id);
  const identifier = String(data.model_identifier || "").trim();
  if (!providerId || !identifier) throw new Error("provider_id and model_identifier are required");

  const existing = await prisma?.aiModel.findFirst({
    where: { providerId, modelIdentifier: identifier },
  });
  if (existing) {
    if (existing.isActive) return modelDto(existing);
    return modelDto(await prisma?.aiModel.update({
      where: { id: existing.id },
      data: { isActive: true },
    }));
  }

  const model = await prisma?.aiModel.create({
    data: {
      providerId,
      modelIdentifier: identifier,
      displayName: data.display_name || identifier,
      isActive: true,
    },
  });
  return modelDto(model);
}

export async function fetchProviderModels(body: {
  user_id: string; provider_id?: number; provider_code: string; base_url?: string; api_key?: string;
}) {
  if (body.provider_code !== "openai_compatible" && body.provider_code !== "openai") {
    return [];
  }

  let apiKey = body.api_key && body.api_key !== "***" ? body.api_key : "";
  if (!apiKey && body.provider_id) {
    const config = await prisma?.userAiConfig.findUnique({
      where: { userId_providerId: { userId: body.user_id, providerId: Number(body.provider_id) } },
      select: { apiKey: true },
    });
    apiKey = config?.apiKey ? revealAiApiKey(config.apiKey) : "";
  }
  if (!apiKey) throw new Error("API key is required to fetch models");

  const baseUrl = await safeAiBaseUrl(body.base_url, "https://api.openai.com/v1");
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API Error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  return (Array.isArray(data.data) ? data.data : [])
    .map((m: any) => String(m.id || "").trim())
    .filter(Boolean)
    .sort()
    .map((id: string) => ({ model_identifier: id, display_name: id }));
}

// ── Prompts ──

export async function listPrompts(userId: string) {
  return prisma?.aiSystemPrompt.findMany({
    where: { OR: [{ userId }, { userId: null }] },
    orderBy: { createdAt: "desc" },
  }) || [];
}

export async function savePrompt(
  userId: string,
  body: {
    id?: string; name: string; content: string;
    category?: string; is_default?: boolean;
  },
  isAdmin: boolean
) {
  if (body.id) {
    const existing = await prisma?.aiSystemPrompt.findFirst({
      where: { id: body.id },
      select: { id: true, userId: true, isBuiltIn: true },
    });
    if (!existing) return { notFound: true };
    if (existing.userId !== userId && !isAdmin) return { forbidden: true };
    if (existing.isBuiltIn && !isAdmin) return { forbidden: true };
    if (body.is_default && !isAdmin) return { forbidden: true };

    return prisma?.aiSystemPrompt.update({
      where: { id: body.id },
      data: {
        name: body.name,
        content: body.content,
        category: body.category,
        isDefault: body.is_default,
        updatedAt: new Date(),
      },
    });
  } else {
    if (body.is_default && !isAdmin) return { forbidden: true };
    return prisma?.aiSystemPrompt.create({
      data: {
        name: body.name,
        content: body.content,
        category: body.category,
        isDefault: body.is_default,
        userId,
      },
    });
  }
}

export async function deletePrompt(promptId: string, userId: string, isAdmin: boolean) {
  const existing = await prisma?.aiSystemPrompt.findFirst({
    where: { id: promptId },
    select: { id: true, userId: true, isBuiltIn: true },
  });
  if (!existing) return { notFound: true };
  if (existing.userId !== userId && !isAdmin) return { forbidden: true };
  if (existing.isBuiltIn && !isAdmin) return { forbidden: true };

  await prisma?.aiSystemPrompt.delete({ where: { id: promptId } });
  return { success: true };
}

export async function toggleDefaultPrompt(promptId: string, isDefault: boolean, isAdmin: boolean) {
  if (!isAdmin) return { forbidden: true };

  const existing = await prisma?.aiSystemPrompt.findFirst({
    where: { id: promptId },
  });
  if (!existing) return { notFound: true };

  if (isDefault) {
    await prisma?.aiSystemPrompt.updateMany({
      where: { id: { not: promptId } },
      data: { isDefault: false },
    });
  }
  return prisma?.aiSystemPrompt.update({
    where: { id: promptId },
    data: { isDefault: !!isDefault },
  });
}

// ── Initialize ──

export async function initializeDefaults() {
  const defaultProviders = [
    { name: "OpenAI", code: "openai", baseUrl: "https://api.openai.com/v1", isActive: true },
    { name: "Google Gemini", code: "gemini", baseUrl: null, isActive: true },
    { name: "OpenAI Compatible", code: "openai_compatible", baseUrl: "https://ai.paas.id", isActive: true },
  ];

  await prisma?.aiProvider.createMany({
    data: defaultProviders,
  });

  const providers = await prisma?.aiProvider.findMany({
    where: { code: { in: defaultProviders.map(p => p.code) } },
  }) || [];

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
    } else if (p.code === "openai_compatible") {
      modelsToInsert.push(
        { providerId: p.id, modelIdentifier: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", isActive: true }
      );
    }
  });

  if (modelsToInsert.length > 0) {
    await prisma?.aiModel.createMany({ data: modelsToInsert });
  }

  return { success: true };
}

// ── Test Connection ──

export async function testConnection(
  userId: string,
  providerCode: string,
  modelIdentifier?: string
) {
  const config = await prisma?.userAiConfig.findFirst({
    where: { userId, provider: { code: providerCode } },
    include: { provider: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!config || !config.apiKey) {
    return { error: "No API key configured for this user" };
  }

  const apiKey = revealAiApiKey(config.apiKey);

  const provider = config.provider;
  const modelId = modelIdentifier || (
    providerCode === "openai" ? "gpt-4o-mini" : "gemini-1.5-flash"
  );

  if (providerCode === "openai" || providerCode === "openai_compatible") {
    const baseUrl = await safeAiBaseUrl(provider?.baseUrl, "https://api.openai.com/v1");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return { error: errData.error?.message || `API Error: ${response.status} ${response.statusText}` };
    }
    return { success: true };
  }

  if (providerCode === "gemini") {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return { error: errData.error?.message || `API Error: ${response.status} ${response.statusText}` };
    }
    return { success: true };
  }

  return { error: `Unsupported provider: ${providerCode}` };
}
