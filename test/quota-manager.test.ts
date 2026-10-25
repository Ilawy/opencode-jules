import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { QuotaManager } from "../src/quota-manager.js";
import { loadConfig } from "../src/config.js";

describe("QuotaManager", () => {
  let tempStoragePath: string;

  beforeEach(() => {
    tempStoragePath = path.join(
      os.tmpdir(),
      `jules_quota_test_${Date.now()}_${Math.random().toString(36).substring(7)}.json`
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempStoragePath)) {
      fs.unlinkSync(tempStoragePath);
    }
  });

  it("calculates 75% quota ceiling correctly for base tier (15 daily)", () => {
    const config = loadConfig({
      tier: "base",
      dailyQuotaLimit: 15,
      quotaStoragePath: tempStoragePath,
    });
    const qm = new QuotaManager(config);

    const status = qm.getQuotaStatus();
    expect(status.dailyLimit).toBe(15);
    expect(status.maxAllowedUsage75).toBe(11); // Math.floor(15 * 0.75) = 11
    expect(status.currentUsage).toBe(0);
    expect(status.remainingUnder75).toBe(11);
    expect(status.is75Exceeded).toBe(false);
  });

  it("allows delegation when usage is under 75% ceiling", () => {
    const config = loadConfig({
      tier: "base",
      dailyQuotaLimit: 15,
      quotaStoragePath: tempStoragePath,
    });
    const qm = new QuotaManager(config);
    const now = Date.now();

    // Record 10 sessions (under 11)
    for (let i = 0; i < 10; i++) {
      qm.recordDelegation(`sess_${i}`, { title: `Task ${i}` }, now - i * 1000);
    }

    const check = qm.canDelegate(now);
    expect(check.allowed).toBe(true);
    expect(check.quotaStatus.currentUsage).toBe(10);
    expect(check.quotaStatus.remainingUnder75).toBe(1);
    expect(check.quotaStatus.is75Exceeded).toBe(false);
  });

  it("blocks delegation as soon as 75% ceiling is reached (11 requests)", () => {
    const config = loadConfig({
      tier: "base",
      dailyQuotaLimit: 15,
      quotaStoragePath: tempStoragePath,
    });
    const qm = new QuotaManager(config);
    const now = Date.now();

    // Record 11 sessions
    for (let i = 0; i < 11; i++) {
      qm.recordDelegation(`sess_${i}`, { title: `Task ${i}` }, now - i * 1000);
    }

    const check = qm.canDelegate(now);
    expect(check.allowed).toBe(false);
    expect(check.quotaStatus.currentUsage).toBe(11);
    expect(check.quotaStatus.remainingUnder75).toBe(0);
    expect(check.quotaStatus.is75Exceeded).toBe(true);
    expect(check.reason).toContain("75%");
  });

  it("prunes records outside rolling 24-hour window", () => {
    const config = loadConfig({
      tier: "base",
      dailyQuotaLimit: 15,
      quotaStoragePath: tempStoragePath,
    });
    const qm = new QuotaManager(config);
    const now = Date.now();
    const twentyFiveHoursAgo = now - 25 * 60 * 60 * 1000;
    const oneHourAgo = now - 1 * 60 * 60 * 1000;

    // 5 old records (25 hours ago)
    for (let i = 0; i < 5; i++) {
      qm.recordDelegation(`old_${i}`, {}, twentyFiveHoursAgo);
    }
    // 3 recent records (1 hour ago)
    for (let i = 0; i < 3; i++) {
      qm.recordDelegation(`recent_${i}`, {}, oneHourAgo);
    }

    const status = qm.getQuotaStatus(now);
    // Old 5 should be pruned, only 3 remain
    expect(status.currentUsage).toBe(3);
    expect(status.remainingUnder75).toBe(8);
    expect(status.is75Exceeded).toBe(false);
  });

  it("correctly handles pro tier (100 daily limit, 75 ceiling)", () => {
    const config = loadConfig({
      tier: "pro",
      dailyQuotaLimit: 100,
      quotaStoragePath: tempStoragePath,
    });
    const qm = new QuotaManager(config);
    const now = Date.now();

    expect(qm.getQuotaStatus(now).maxAllowedUsage75).toBe(75);

    // 74 records -> allowed
    for (let i = 0; i < 74; i++) {
      qm.recordDelegation(`pro_${i}`, {}, now);
    }
    expect(qm.canDelegate(now).allowed).toBe(true);

    // 75th record -> blocked
    qm.recordDelegation(`pro_75`, {}, now);
    expect(qm.canDelegate(now).allowed).toBe(false);
  });
});
