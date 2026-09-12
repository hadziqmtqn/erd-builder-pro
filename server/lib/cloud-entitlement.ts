const capabilityKey = /^[a-z][a-z0-9_]*$/;

export type CloudEntitlement = {
  product_type: "cloud";
  revision: string;
  capabilities: Record<string, boolean>;
  limits: { max_members: number | null; max_personal_files_per_feature: number | null };
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
  if (capabilities.length > 50 || !capabilities.every(([key, enabled]) => capabilityKey.test(key) && typeof enabled === "boolean")
    || !(maxMembers === null || (typeof maxMembers === "number" && Number.isSafeInteger(maxMembers) && maxMembers > 0 && maxMembers <= 1_000_000))
    || !(maxPersonalFiles === undefined || maxPersonalFiles === null
      || (typeof maxPersonalFiles === "number" && Number.isSafeInteger(maxPersonalFiles) && maxPersonalFiles > 0 && maxPersonalFiles <= 1_000_000))) return null;

  return {
    product_type: "cloud",
    revision: value.revision as string,
    capabilities: Object.fromEntries(capabilities.sort(([left], [right]) => left.localeCompare(right))) as Record<string, boolean>,
    limits: {
      max_members: maxMembers as number | null,
      max_personal_files_per_feature: maxPersonalFiles === undefined ? null : maxPersonalFiles as number | null,
    },
  };
}

export function serializeCloudEntitlement(entitlement: CloudEntitlement): string {
  return JSON.stringify(entitlement);
}
