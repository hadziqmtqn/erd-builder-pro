const capabilityKey = /^[a-z][a-z0-9_]*$/;

export type CloudEntitlement = {
  product_type: "cloud";
  revision: string;
  capabilities: Record<string, boolean>;
  limits: {
    max_members: number | null;
    max_personal_files_per_feature: number | null;
    /** Storage per Team or Personal scope (CLD-010 Q2, Q5); null means no limit. */
    max_storage_bytes: number | null;
    /** Files per feature in a Team; only the Trial carries it (CLD-010 Q3). */
    max_team_files_per_feature: number | null;
    ai_credits: number;
  };
  period_start: string | null;
  period_end: string | null;
  /** Team Trial for the survey panel (CLD-013.3); null when the Team is not on an active Trial. */
  trial: CloudTrial | null;
};

export type CloudTrial = {
  survey_key: "beta_trial" | "cloud_trial";
  starts_at: string;
  ends_at: string | null;
};

const MAX_STORAGE_BYTES = 1_000_000_000_000_000;

function optionalPositive(value: unknown, max: number): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const isDate = (value: unknown): value is string => typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value));

/** A malformed Trial only hides the survey panel; it never invalidates the entitlement that grants access. */
function parseTrial(value: unknown): CloudTrial | null {
  if (!isRecord(value)) return null;
  const { survey_key: surveyKey, starts_at: startsAt, ends_at: endsAt = null } = value;
  const validEnd = endsAt === null || isDate(endsAt);
  if ((surveyKey !== "beta_trial" && surveyKey !== "cloud_trial") || !isDate(startsAt) || !validEnd) return null;
  return { survey_key: surveyKey, starts_at: startsAt, ends_at: endsAt as string | null };
}

export function parseCloudEntitlement(value: unknown, workspaceStatus: string): CloudEntitlement | null {
  if (!isRecord(value) || value.status !== workspaceStatus || !/^[a-f0-9]{64}$/.test(String(value.revision))
    || (value.product_type !== undefined && value.product_type !== "cloud")
    || !isRecord(value.capabilities) || !isRecord(value.limits)) return null;

  const capabilities = Object.entries(value.capabilities);
  const maxMembers = value.limits.max_members;
  const maxPersonalFiles = value.limits.max_personal_files_per_feature;
  const maxStorageBytes = value.limits.max_storage_bytes;
  const maxTeamFiles = value.limits.max_team_files_per_feature;
  const aiCredits = value.limits.ai_credits === undefined ? 0 : value.limits.ai_credits;
  const periodStart = value.period_start === undefined ? null : value.period_start;
  const periodEnd = value.period_end === undefined ? null : value.period_end;
  if (capabilities.length > 50 || !capabilities.every(([key, enabled]) => capabilityKey.test(key) && typeof enabled === "boolean")
    || !(maxMembers === null || (typeof maxMembers === "number" && Number.isSafeInteger(maxMembers) && maxMembers > 0 && maxMembers <= 1_000_000))
    || !(maxPersonalFiles === undefined || maxPersonalFiles === null
      || (typeof maxPersonalFiles === "number" && Number.isSafeInteger(maxPersonalFiles) && maxPersonalFiles > 0 && maxPersonalFiles <= 1_000_000))
    || !optionalPositive(maxStorageBytes, MAX_STORAGE_BYTES)
    || !optionalPositive(maxTeamFiles, 1_000_000)
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
      max_storage_bytes: maxStorageBytes ?? null,
      max_team_files_per_feature: maxTeamFiles ?? null,
      ai_credits: aiCredits,
    },
    period_start: periodStart as string | null,
    period_end: periodEnd as string | null,
    trial: parseTrial(value.trial),
  };
}

export function serializeCloudEntitlement(entitlement: CloudEntitlement): string {
  return JSON.stringify(entitlement);
}

/** Parses an entitlement stored on a Team or user row; the row's own status stands in for the claim status. */
export function parseStoredCloudEntitlement(raw: string | null | undefined, status = "active"): CloudEntitlement | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    return isRecord(stored) ? parseCloudEntitlement({ ...stored, status }, status) : null;
  } catch {
    return null;
  }
}
