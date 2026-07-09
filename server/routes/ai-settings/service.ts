import { prisma } from "../../lib/prisma.js";

function getUserId(req: any): string {
  return req.user.id;
}

// ── Providers ──

export async function listProviders() {
  return prisma?.aiProvider.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  }) || [];
}

export async function updateProvider(providerId: number, baseUrl: string) {
  await prisma?.aiProvider.update({
    where: { id: providerId as any },
    data: { baseUrl },
  });
  return { success: true };
}

// ── User Configs ──

export async function listConfigs(userId: string) {
  const data = await prisma?.userAiConfig.findMany({
    where: { userId },
  }) || [];
  return data.map((c: any) => ({
    ...c,
    apiKey: c.apiKey ? "***" : null,
  }));
}

export async function upsertConfig(
  userId: string,
  body: { provider_id: number; api_key?: string; selected_model_id?: number; is_enabled?: boolean }
) {
  const providerId = Number(body.provider_id);
  const selectedModelId = body.selected_model_id != null ? Number(body.selected_model_id) || null : null;
  const hasApiKey = !!(body.api_key && body.api_key !== "***");

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
      ...(hasApiKey ? { apiKey: body.api_key! } : {}),
      ...(selectedModelId != null ? { selectedModelId } : {}),
      ...(body.is_enabled != null ? { isEnabled: body.is_enabled } : {}),
    } as any,
    update: {
      ...(hasApiKey ? { apiKey: body.api_key! } : {}),
      ...(selectedModelId != null ? { selectedModelId } : {}),
      ...(body.is_enabled != null ? { isEnabled: body.is_enabled } : {}),
      updatedAt: new Date(),
    } as any,
  });
  return data ? { ...data, apiKey: data.apiKey ? "***" : null } : null;
}

// ── Models ──

export async function listModels() {
  return prisma?.aiModel.findMany({
    where: { isActive: true },
  }) || [];
}

export async function createModel(data: {
  provider_id?: number; model_identifier: string; display_name: string;
}) {
  const providerId = data.provider_id ? Number(data.provider_id) : null;
  return prisma?.aiModel.create({
    data: {
      providerId: providerId || null,
      modelIdentifier: data.model_identifier,
      displayName: data.display_name,
      isActive: true,
    },
  });
}

export async function updateModel(modelId: number, data: {
  provider_id?: number; model_identifier?: string; display_name?: string;
}) {
  const providerId = data.provider_id ? Number(data.provider_id) : null;
  await prisma?.aiModel.update({
    where: { id: modelId as any },
    data: {
      ...(providerId != null ? { providerId: providerId || null } : {}),
      ...(data.model_identifier !== undefined ? { modelIdentifier: data.model_identifier } : {}),
      ...(data.display_name !== undefined ? { displayName: data.display_name } : {}),
    },
  });
  return { success: true };
}

export async function deleteModel(modelId: number) {
  await prisma?.aiModel.delete({
    where: { id: modelId as any },
  });
  return { success: true };
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
    where: { userId, isEnabled: true },
    include: { provider: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!config || !config.apiKey) {
    return { error: "No API key configured for this user" };
  }

  const provider = config.provider;
  const modelId = modelIdentifier || (
    providerCode === "openai" ? "gpt-4o-mini" : "gemini-1.5-flash"
  );

  if (providerCode === "openai" || providerCode === "openai_compatible") {
    let baseUrl = provider?.baseUrl || "https://api.openai.com/v1";
    baseUrl = baseUrl.replace(/\/+$/, "");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
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
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${config.apiKey}`,
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
