import { prisma } from "../../lib/prisma.js";

/**
 * Resolve AI provider config when no apiKey is provided inline.
 * Returns resolved apiKey, baseUrl, model, and providerCode.
 */
export async function resolveAiConfig(params: {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  userId?: string;
  providerCode?: string;
}): Promise<{
  apiKey: string;
  baseUrl: string;
  model: string;
  providerCode?: string;
}> {
  let { apiKey, baseUrl, model, userId, providerCode } = params;

  // When no apiKey is provided, look up config from DB
  if (!apiKey) {
    if (!prisma) {
      throw new Error("Database not configured on server");
    }

    const where: any = {
      isEnabled: true,
      selectedModelId: { not: null },
    };
    if (userId) {
      where.userId = userId;
    }

    const config = await prisma.userAiConfig.findFirst({
      where,
      include: { provider: true },
      orderBy: { updatedAt: "desc" },
    });

    if (!config) {
      throw new Error("No AI provider configured. Configure AI in Settings.");
    }

    apiKey = config.apiKey;
    baseUrl = baseUrl || config.provider?.baseUrl || "https://api.openai.com/v1";

    if (!model && config.selectedModelId) {
      const modelData = await prisma.aiModel.findFirst({
        where: { id: config.selectedModelId },
        select: { modelIdentifier: true },
      });
      model = modelData?.modelIdentifier || "gpt-4o-mini";
    }

    providerCode = providerCode || config.provider?.code;
  }

  return {
    apiKey: apiKey!,
    baseUrl: baseUrl || "https://api.openai.com/v1",
    model: model || "gpt-4o-mini",
    providerCode,
  };
}

export function buildProxyUrl(
  baseUrl: string,
  providerCode?: string
): { fetchUrl: string; headers: Record<string, string> } {
  const isGemini =
    providerCode === "gemini" || baseUrl.includes("generativelanguage.googleapis.com");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Unlike fetchUrl/headers — made symmetric for both Gemini and OpenAI
  // Gemini: baseUrl defaults to https://generativelanguage.googleapis.com/v1beta
  // OpenAI: baseUrl defaults to https://api.openai.com/v1
  // Both use Authorization: Bearer for the OpenAI-compatible endpoint
  return { fetchUrl: "", headers }; // will be set below
}

export function getProxyFetchUrl(
  resolvedBaseUrl: string,
  isGemini: boolean
): string {
  if (isGemini) {
    return `${resolvedBaseUrl}/openai/chat/completions`;
  }
  return `${resolvedBaseUrl}/chat/completions`;
}
