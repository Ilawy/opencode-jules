import fs from "node:fs";
import path from "node:path";
import type { JulesConfig } from "./config.js";
import type {
  DelegationCheckResult,
  JulesSession,
  QuotaRecord,
  QuotaStatus,
} from "./types.js";

const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export class QuotaManager {
  private config: JulesConfig;
  private storagePath: string;

  constructor(config: JulesConfig) {
    this.config = config;
    this.storagePath = config.quotaStoragePath;
  }

  /**
   * Load raw records from disk
   */
  private loadRecords(): QuotaRecord[] {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return [];
      }
      const data = fs.readFileSync(this.storagePath, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item) => typeof item.timestamp === "number" && typeof item.sessionId === "string"
        );
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Save records to disk safely
   */
  private saveRecords(records: QuotaRecord[]): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${this.storagePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(records, null, 2), "utf-8");
      fs.renameSync(tempPath, this.storagePath);
    } catch (err) {
      console.error(`[QuotaManager] Failed to persist quota records to ${this.storagePath}:`, err);
    }
  }

  /**
   * Filter records that fall inside the current rolling 24-hour window
   */
  public getActiveRecords(now = Date.now()): QuotaRecord[] {
    const records = this.loadRecords();
    const cutoff = now - ROLLING_WINDOW_MS;
    const active = records.filter((r) => r.timestamp >= cutoff);

    // If records were pruned, update file
    if (active.length !== records.length) {
      this.saveRecords(active);
    }

    return active.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Retrieve current quota status and calculations
   */
  public getQuotaStatus(now = Date.now()): QuotaStatus {
    const activeRecords = this.getActiveRecords(now);
    const dailyLimit = this.config.dailyQuotaLimit;
    const currentUsage = activeRecords.length;
    const maxAllowedUsage75 = Math.floor(dailyLimit * this.config.quotaRatioCeiling);
    const remainingUnder75 = Math.max(0, maxAllowedUsage75 - currentUsage);
    const is75Exceeded = currentUsage >= maxAllowedUsage75;
    const usagePercentage = dailyLimit > 0 ? (currentUsage / dailyLimit) * 100 : 100;

    const oldestRecord = activeRecords[0];
    const oldestActiveTimestamp = oldestRecord?.timestamp;
    const nextResetTimestamp = oldestActiveTimestamp
      ? oldestActiveTimestamp + ROLLING_WINDOW_MS
      : undefined;

    return {
      tier: this.config.tier,
      dailyLimit,
      rollingWindowHours: 24,
      currentUsage,
      maxAllowedUsage75,
      remainingUnder75,
      is75Exceeded,
      usagePercentage: Math.round(usagePercentage * 10) / 10,
      oldestActiveTimestamp,
      nextResetTimestamp,
    };
  }

  /**
   * Check whether a new task delegation is allowed under the 75% quota guardrail
   */
  public canDelegate(now = Date.now()): DelegationCheckResult {
    const status = this.getQuotaStatus(now);

    if (status.is75Exceeded) {
      const resetInMinutes = status.nextResetTimestamp
        ? Math.max(0, Math.ceil((status.nextResetTimestamp - now) / (60 * 1000)))
        : undefined;

      const resetNote = resetInMinutes !== undefined
        ? ` Next quota slot releases in ~${resetInMinutes} minute(s).`
        : "";

      return {
        allowed: false,
        quotaStatus: status,
        reason:
          `Jules delegation quota ceiling reached: ${status.currentUsage}/${status.dailyLimit} daily requests used ` +
          `(${status.usagePercentage}%). New delegations are blocked once usage reaches 75% (${status.maxAllowedUsage75} requests) ` +
          `to reserve remaining capacity for critical/manual operations.${resetNote} Fall back to local execution.`,
      };
    }

    return {
      allowed: true,
      quotaStatus: status,
    };
  }

  /**
   * Record a new delegated task
   */
  public recordDelegation(
    sessionId: string,
    metadata?: { title?: string; prompt?: string; source?: string },
    now = Date.now()
  ): QuotaStatus {
    const records = this.getActiveRecords(now);
    const newRecord: QuotaRecord = {
      sessionId,
      timestamp: now,
      title: metadata?.title,
      promptPreview: metadata?.prompt
        ? metadata.prompt.slice(0, 100).replace(/\n/g, " ")
        : undefined,
      source: metadata?.source,
    };

    records.push(newRecord);
    this.saveRecords(records);
    return this.getQuotaStatus(now);
  }

  /**
   * Synchronize local records with remote Jules sessions if remote sessions exist
   */
  public syncWithJulesSessions(remoteSessions: JulesSession[], now = Date.now()): void {
    const cutoff = now - ROLLING_WINDOW_MS;
    const existing = this.getActiveRecords(now);
    const existingIds = new Set(existing.map((r) => r.sessionId));

    let modified = false;

    for (const session of remoteSessions) {
      const sessionId = session.name || session.id;
      if (!sessionId || existingIds.has(sessionId)) {
        continue;
      }

      const createTimeMs = session.createTime
        ? new Date(session.createTime).getTime()
        : now;

      if (createTimeMs >= cutoff) {
        existing.push({
          sessionId,
          timestamp: createTimeMs,
          title: session.title,
          promptPreview: session.prompt ? session.prompt.slice(0, 100) : undefined,
          source: session.sourceContext?.source,
        });
        existingIds.add(sessionId);
        modified = true;
      }
    }

    if (modified) {
      existing.sort((a, b) => a.timestamp - b.timestamp);
      this.saveRecords(existing);
    }
  }

  /**
   * Reset / clear storage (useful for tests or manual reset)
   */
  public clearRecords(): void {
    this.saveRecords([]);
  }
}
