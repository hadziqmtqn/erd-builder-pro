import { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { startAutoBackupScheduler, stopAutoBackupScheduler } from "../../lib/auto-backup.js";

// Valid intervals in minutes
const VALID_INTERVALS = [15, 30, 60, 360, 720, 1440]; // 15m, 30m, 1h, 6h, 12h, 24h

// ── GET ──

export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user.id;

    const pref = await prisma?.userPreference.findUnique({
      where: { userId },
      select: {
        autoBackupEnabled: true,
        autoBackupInterval: true,
        autoBackupRetention: true,
      },
    });

    res.json({
      enabled: pref?.autoBackupEnabled ?? false,
      interval: pref?.autoBackupInterval ?? 3600,
      retention: pref?.autoBackupRetention ?? 10,
    });
  } catch (error: any) {
    logger.error({ err: error }, "Failed to get auto-backup settings");
    res.status(500).json({ error: "Failed to load auto-backup settings" });
  }
}

// ── PUT ──

const SETTINGS_SCHEMA = {
  type: "object",
  required: [],
  properties: {
    enabled: { type: "boolean" },
    interval: { type: "number", minimum: 15 },
    retention: { type: "number", minimum: 1, maximum: 100 },
  },
};

function validateSettings(body: any): { valid: false; error: string } | { valid: true; data: any } {
  if (typeof body !== "object" || body === null) {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return { valid: false, error: "`enabled` must be a boolean" };
  }

  if (body.interval !== undefined) {
    if (typeof body.interval !== "number" || !Number.isInteger(body.interval) || body.interval < 15) {
      return { valid: false, error: "`interval` must be a positive integer (minimum 15 minutes)" };
    }
    if (!VALID_INTERVALS.includes(body.interval)) {
      return { valid: false, error: `\`interval\` must be one of: ${VALID_INTERVALS.join(", ")} minutes` };
    }
  }

  if (body.retention !== undefined) {
    if (typeof body.retention !== "number" || !Number.isInteger(body.retention) || body.retention < 1 || body.retention > 100) {
      return { valid: false, error: "`retention` must be an integer between 1 and 100" };
    }
  }

  return { valid: true, data: body };
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user.id;
    const validation = validateSettings(req.body);

    if (!validation.valid) {
      res.status(400).json({ error: (validation as { error: string }).error });
      return;
    }

    const { enabled, interval, retention } = validation.data;

    const updateData: Record<string, any> = {};
    if (enabled !== undefined) updateData.autoBackupEnabled = enabled;
    if (interval !== undefined) updateData.autoBackupInterval = interval * 60; // store in seconds
    if (retention !== undefined) updateData.autoBackupRetention = retention;

    await prisma?.userPreference.upsert({
      where: { userId },
      update: updateData,
      create: { userId, ...updateData },
    });

    // Restart scheduler with new settings
    if (enabled !== undefined || interval !== undefined) {
      const fresh = await prisma?.userPreference.findUnique({
        where: { userId },
        select: { autoBackupEnabled: true },
      });

      if (fresh?.autoBackupEnabled) {
        startAutoBackupScheduler(userId);
        logger.info({ userId }, "Auto-backup scheduler (re)started after settings change");
      } else {
        stopAutoBackupScheduler();
        logger.info({ userId }, "Auto-backup scheduler stopped (disabled)");
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "Failed to update auto-backup settings");
    res.status(500).json({ error: "Failed to save auto-backup settings" });
  }
}
