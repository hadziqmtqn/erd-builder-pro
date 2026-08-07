import { prisma } from "../../lib/prisma.js";
import { safeAiBaseUrl } from "../../lib/ai-security.js";
import { isProtectedAiApiKey, protectAiApiKey, revealAiApiKey } from "../../lib/ai-credentials.js";

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
    if (!userId) {
      throw new Error("Authenticated user required for stored AI configuration");
    }

    if (!prisma) {
      throw new Error("Database not configured on server");
    }

    const where: any = {
      isEnabled: true,
      selectedModelId: { not: null },
    };
    where.userId = userId;

    const config = await prisma.userAiConfig.findFirst({
      where,
      include: { provider: true, selectedModel: true },
      orderBy: { updatedAt: "desc" },
    });

    if (!config) {
      throw new Error("No AI provider configured. Configure AI in Settings.");
    }

    if (!config.provider || config.provider.isActive !== true) {
      throw new Error("Selected AI provider is unavailable");
    }
    if (
      !config.selectedModel ||
      config.selectedModel.isActive !== true ||
      String(config.selectedModel.providerId) !== String(config.providerId)
    ) {
      throw new Error("Selected AI model is unavailable for this provider");
    }

    const storedApiKey = config.apiKey;
    if (!storedApiKey) {
      throw new Error("AI API key is required");
    }

    apiKey = revealAiApiKey(storedApiKey);
    if (!isProtectedAiApiKey(storedApiKey)) {
      await prisma.userAiConfig.update({
        where: { id: config.id },
        data: { apiKey: protectAiApiKey(apiKey) },
      });
    }
    providerCode = config.provider.code;
    // A request must not override the configured provider URL when using a stored key.
    baseUrl = config.provider?.baseUrl || (providerCode === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta"
      : "https://api.openai.com/v1");

    if (!model && config.selectedModelId) {
      model = config.selectedModel.modelIdentifier;
    }

  }

  return {
    apiKey: apiKey!,
    baseUrl: await safeAiBaseUrl(baseUrl, providerCode === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta"
      : "https://api.openai.com/v1"),
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
