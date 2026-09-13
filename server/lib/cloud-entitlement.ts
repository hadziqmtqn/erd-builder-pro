const capabilityKey = /^[a-z][a-z0-9_]*$/;

export type CloudEntitlement = {
  product_type: "cloud";
  revision: string;
  capabilities: Record<string, boolean>;
  limits: { max_members: number | null; max_personal_files_per_feature: number | null; ai_credits: number };
  period_start: string | null;
  period_end: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseCloudEntitlement(value: unknown, workspaceStatus: string): CloudEntitlement | null {
  if (!isRecord(value) || value.status !== workspaceStatus || !/^[a-f0-9]{64}$/.test(String(value.revision))
    || (value.product_type !== undefined && value.product_type !== "cloud")
    || !isRecord(value.capabilities) || !isRecord(value.limits)) return null;

  const capabilities = Object.entries(value.capabilities);
  const maxMembers = value.limits.max_members;
  const maxPersonalFiles = value.limits.max_personal_files_per_feature;
  const aiCredits = value.limits.ai_credits === undefined ? 0 : value.limits.ai_credits;
  const periodStart = value.period_start === undefined ? null : value.period_start;
  const periodEnd = value.period_end === undefined ? null : value.period_end;
  if (capabilities.length > 50 || !capabilities.every(([key, enabled]) => capabilityKey.test(key) && typeof enabled === "boolean")
    || !(maxMembers === null || (typeof maxMembers === "number" && Number.isSafeInteger(maxMembers) && maxMembers > 0 && maxMembers <= 1_000_000))
    || !(maxPersonalFiles === undefined || maxPersonalFiles === null
      || (typeof maxPersonalFiles === "number" && Number.isSafeInteger(maxPersonalFiles) && maxPersonalFiles > 0 && maxPersonalFiles <= 1_000_000))
    || !(typeof aiCredits === "number" && Number.isSafeInteger(aiCredits) && aiCredits >= 0 && aiCredits <= 1_000_000)
    || !(periodStart === null || (typeof periodStart === "string" && periodStart.length <= 64))
    || !(periodEnd === null || (typeof periodEnd === "string" && periodEnd.length <= 64))) return null;

  return {
    product_type: "cloud",
    revision: value.revision as string,
    capabilities: Object.fromEntries(capabilities.sort(([left], [right]) => left.localeCompare(right))) as Record<string, boolean>,
    limits: {
      max_members: maxMembers as number | null,
      max_personal_files_per_feature: maxPersonalFiles === undefined ? null : maxPersonalFiles as number | null,
      ai_credits: aiCredits,
    },
    period_start: periodStart as string | null,
    period_end: periodEnd as string | null,
  };
}

export function serializeCloudEntitlement(entitlement: CloudEntitlement): string {
  return JSON.stringify(entitlement);
}
