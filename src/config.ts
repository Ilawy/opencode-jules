import os from "node:os";
import path from "node:path";
import type { JulesTier } from "./types.js";

export const TIER_LIMITS: Record<JulesTier, number> = {
  base: 15,
  pro: 100,
  ultra: 300,
  custom: 15,
};

export interface JulesConfig {
  apiKey: string;
  baseUrl: string;
  tier: JulesTier;
  dailyQuotaLimit: number;
  quotaRatioCeiling: number; // default 0.75 (75%)
  quotaStoragePath: string;
  requirePlanApproval: boolean;
  automationMode: string;
}

export function loadConfig(overrides?: Partial<JulesConfig>): JulesConfig {
  const envTier = (process.env.JULES_TIER?.toLowerCase() as JulesTier) || "base";
  const validTier: JulesTier = ["base", "pro", "ultra", "custom"].includes(envTier)
    ? envTier
    : "base";

  const defaultLimit = TIER_LIMITS[validTier];
  const envLimit = process.env.JULES_DAILY_QUOTA_LIMIT
    ? Number.parseInt(process.env.JULES_DAILY_QUOTA_LIMIT, 10)
    : undefined;
  const dailyQuotaLimit = envLimit && !Number.isNaN(envLimit) && envLimit > 0 ? envLimit : defaultLimit;

  const defaultQuotaDir = path.join(os.homedir(), ".config", "opencode");
  const quotaStoragePath =
    process.env.JULES_QUOTA_FILE ||
    overrides?.quotaStoragePath ||
    path.join(defaultQuotaDir, "jules_quota.json");

  return {
    apiKey: overrides?.apiKey || process.env.JULES_API_KEY || "",
    baseUrl:
      overrides?.baseUrl ||
      process.env.JULES_BASE_URL ||
      "https://jules.googleapis.com/v1alpha",
    tier: overrides?.tier || validTier,
    dailyQuotaLimit: overrides?.dailyQuotaLimit || dailyQuotaLimit,
    quotaRatioCeiling: 0.75, // strictly 75% as specified
    quotaStoragePath,
    requirePlanApproval:
      overrides?.requirePlanApproval ??
      (process.env.JULES_REQUIRE_PLAN_APPROVAL === "true"),
    automationMode:
      overrides?.automationMode ||
      process.env.JULES_AUTOMATION_MODE ||
      "AUTO_CREATE_PR",
  };
}
