import { Router } from "express";

import { authenticate, rejectInSsoMode } from "../../lib/middleware.js";
import { requireAdmin } from "../../lib/security.js";
import { activateSelfHostInstanceLicense, checkSelfHostInstanceLicense, LicenseClientError, verifyStoredInstanceLicense } from "../../lib/license-client.js";
import { instanceLicenseUsage } from "../../lib/instance-license-usage.js";

const router = Router();
router.use(authenticate);
router.use(rejectInSsoMode);
router.use((req, res, next) => {
  if (!requireAdmin(req, res)) return;
  next();
});

function statusPayload(entitlement: ReturnType<typeof verifyStoredInstanceLicense>["entitlement"], checkedAt?: string) {
  return { active: true, planCode: entitlement.planCode, expiresAt: new Date(entitlement.expiresAt * 1000), maxTeams: entitlement.maxTeams, maxMembers: entitlement.maxMembers, ...(checkedAt ? { lastCheckedAt: checkedAt } : {}) };
}

router.get("/status", async (_req, res) => {
  try {
    const { entitlement } = verifyStoredInstanceLicense({ allowGrace: true });
    res.json({ ...statusPayload(entitlement), usage: await instanceLicenseUsage() });
  } catch (error) {
    res.json({ active: false, code: error instanceof LicenseClientError ? error.code : "LICENSE_STATE_INVALID", usage: await instanceLicenseUsage() });
  }
});

router.post("/activate", async (req, res) => {
  const licenseKey = typeof req.body?.license_key === "string" ? req.body.license_key.trim() : "";
  if (!licenseKey) return res.status(400).json({ error: "license_key is required" });
  try {
    const usage = await instanceLicenseUsage();
    const result = await activateSelfHostInstanceLicense({ licenseKey, ...(typeof req.body?.activation_grant === "string" ? { activationGrant: req.body.activation_grant.trim() } : {}), ...usage });
    res.json({ ...statusPayload(result.entitlement, result.state.lastCheckedAt), usage });
  } catch (error) {
    const status = error instanceof LicenseClientError ? error.status : 500;
    res.status(status).json({ error: "License activation failed", code: error instanceof LicenseClientError ? error.code : "LICENSE_ACTIVATION_FAILED" });
  }
});

router.post("/check", async (_req, res) => {
  try {
    const usage = await instanceLicenseUsage();
    const result = await checkSelfHostInstanceLicense(usage);
    res.json({ active: true, planCode: result.entitlement.planCode, expiresAt: new Date(result.entitlement.expiresAt * 1000), maxTeams: result.entitlement.maxTeams, maxMembers: result.entitlement.maxMembers, usage });
  } catch (error) {
    const status = error instanceof LicenseClientError ? error.status : 500;
    res.status(status).json({ error: "License check failed", code: error instanceof LicenseClientError ? error.code : "LICENSE_CHECK_FAILED" });
  }
});

export default router;
