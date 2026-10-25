import { describe, expect, it } from "bun:test";
import { DecisionEngine } from "../src/decision-engine.js";
import type { QuotaStatus } from "../src/types.js";

const makeQuotaStatus = (currentUsage: number, dailyLimit = 15): QuotaStatus => {
  const maxAllowed = Math.floor(dailyLimit * 0.75);
  return {
    tier: "base",
    dailyLimit,
    rollingWindowHours: 24,
    currentUsage,
    maxAllowedUsage75: maxAllowed,
    remainingUnder75: Math.max(0, maxAllowed - currentUsage),
    is75Exceeded: currentUsage >= maxAllowed,
    usagePercentage: (currentUsage / dailyLimit) * 100,
  };
};

describe("DecisionEngine", () => {
  const engine = new DecisionEngine();

  it("recommends DELEGATE_TO_JULES when user directly requests delegation", () => {
    const quota = makeQuotaStatus(2); // healthy
    const evaluation = engine.evaluate({
      prompt: "delegate this task to jules: add end-to-end tests for billing",
      quotaStatus: quota,
    });

    expect(evaluation.shouldDelegate).toBe(true);
    expect(evaluation.recommendation).toBe("DELEGATE_TO_JULES");
    expect(evaluation.factors.isExplicitUserRequest).toBe(true);
  });

  it("autonomously delegates heavy/complex tasks when quota is healthy", () => {
    const quota = makeQuotaStatus(3); // healthy
    const evaluation = engine.evaluate({
      prompt:
        "Refactor our backend architecture from Express to Fastify, migrate all controllers, and rewrite comprehensive test suites across all modules.",
      quotaStatus: quota,
    });

    expect(evaluation.shouldDelegate).toBe(true);
    expect(evaluation.recommendation).toBe("DELEGATE_TO_JULES");
    expect(evaluation.factors.estimatedComplexity).toBe("high");
  });

  it("recommends EXECUTE_LOCALLY for lightweight / interactive tasks", () => {
    const quota = makeQuotaStatus(1);
    const evaluation = engine.evaluate({
      prompt: "fix typo in user model comments and explain what is UUID",
      quotaStatus: quota,
    });

    expect(evaluation.shouldDelegate).toBe(false);
    expect(evaluation.recommendation).toBe("EXECUTE_LOCALLY");
  });

  it("HARD BLOCKS delegation when 75% quota ceiling is reached, even for heavy tasks", () => {
    const quota = makeQuotaStatus(11, 15); // 11/15 = 73.3%, ceiling is 11
    expect(quota.is75Exceeded).toBe(true);

    const evaluation = engine.evaluate({
      prompt: "Comprehensive full repository refactor and test rewrite",
      quotaStatus: quota,
    });

    expect(evaluation.shouldDelegate).toBe(false);
    expect(evaluation.recommendation).toBe("BLOCKED_BY_QUOTA");
    expect(evaluation.reason).toContain("75% daily quota threshold reached");
  });

  it("generates proper system prompt guidance with live quota status", () => {
    const quota = makeQuotaStatus(4, 15);
    const prompt = DecisionEngine.getSystemPromptGuidelines(quota);

    expect(prompt).toContain("JULES DELEGATION PROTOCOL");
    expect(prompt).toContain("4/15");
    expect(prompt).toContain("75% Ceiling Threshold: 11 requests");
    expect(prompt).toContain("READY TO DELEGATE");
  });
});
