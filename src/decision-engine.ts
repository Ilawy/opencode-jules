import type {
  DecisionEvaluation,
  GitRepoInfo,
  QuotaStatus,
} from "./types.js";

export interface EvaluationInput {
  prompt: string;
  isExplicitUserRequest?: boolean;
  gitInfo?: GitRepoInfo;
  quotaStatus: QuotaStatus;
  affectedFilesCountHint?: number;
}

// Keywords that indicate heavy, asynchronous, or long-running tasks
const HEAVY_TASK_KEYWORDS = [
  "refactor",
  "rewrite",
  "migrate",
  "migration",
  "upgrade",
  "test suite",
  "comprehensive tests",
  "full test coverage",
  "integration tests",
  "end-to-end",
  "architectural",
  "overhaul",
  "convert from",
  "benchmark",
  "performance optimization across",
  "documentation for entire",
  "all files",
  "monorepo",
];

// Keywords indicating direct delegation intent
const DIRECT_INTENT_KEYWORDS = [
  "delegate to jules",
  "send to jules",
  "run on jules",
  "ask jules",
  "jules:",
  "use jules",
  "background task",
];

// Keywords that indicate lightweight tasks that should NOT be delegated
const LIGHTWEIGHT_KEYWORDS = [
  "fix typo",
  "explain",
  "what is",
  "how do i",
  "quick fix",
  "rename variable",
  "add comment",
  "single function",
  "one liner",
];

export class DecisionEngine {
  /**
   * System prompt guidelines injected into OpenCode LLM context
   */
  public static getSystemPromptGuidelines(quotaStatus: QuotaStatus): string {
    const quotaPercentage = quotaStatus.usagePercentage;
    const remaining = quotaStatus.remainingUnder75;
    const isExceeded = quotaStatus.is75Exceeded;

    return `
=== JULES DELEGATION PROTOCOL (Google Jules Coding Agent) ===
You have access to Jules tools to asynchronously delegate heavy, time-consuming coding tasks.
Jules executes tasks in a dedicated cloud VM, runs tests, and produces PRs.

[Current Jules Quota Status]
- Tier: ${quotaStatus.tier.toUpperCase()} (${quotaStatus.dailyLimit} daily requests)
- 24h Rolling Usage: ${quotaStatus.currentUsage}/${quotaStatus.dailyLimit} (${quotaPercentage}%)
- 75% Ceiling Threshold: ${quotaStatus.maxAllowedUsage75} requests
- Remaining Delegatable Capacity Under 75%: ${remaining} request(s)
- Quota Status: ${isExceeded ? "⚠️ 75% LIMIT EXCEEDED (DELEGATION LOCKED)" : "✅ READY TO DELEGATE"}

[Delegation Rules & Criteria]
1. HARD CONSTRAINT (75% Quota Guardrail):
   - You MUST NOT delegate tasks if current usage has reached 75% (${quotaStatus.maxAllowedUsage75} requests).
   - If 75% is reached, inform the user and execute the task locally in OpenCode step-by-step.
   - Never bypass the 75% limit. The remaining 25% is strictly reserved for user-critical manual tasks.

2. WHEN TO DELEGATE:
   - Direct User Request: When the user explicitly asks to delegate, run on Jules, or uses /jules.
   - Autonomous LLM Choice: You should proactively delegate to Jules when:
     * The task is heavy, multi-file (> 3-5 files), or repo-wide.
     * Writing extensive test suites, e2e test setups, or reaching high test coverage.
     * Performing major refactoring, library/framework migrations (e.g. Next.js, React, Tailwind, Python versions).
     * Tasks that require slow test suites or extended iterative debugging in a cloud VM.

3. WHEN TO EXECUTE LOCALLY (DO NOT DELEGATE):
   - Simple edits, single-file fixes, typos, explanation requests, or quick debugging questions.
   - When the user wants immediate interactive pair programming.
   - When local working tree has uncommitted changes that the user has not pushed.
   - When Jules quota is >= 75%.

4. AVAILABLE JULES TOOLS:
   - jules_delegate: Start a session in Jules (checks quota & repo automatically).
   - jules_check_session: Check progress, activities, and PR status of a running session.
   - jules_list_sessions: List recent Jules sessions.
   - jules_get_quota: Check real-time quota metrics.
=============================================================
`.trim();
  }

  /**
   * Evaluate whether a task should be delegated
   */
  public evaluate(input: EvaluationInput): DecisionEvaluation {
    const { prompt, gitInfo, quotaStatus } = input;
    const lower = prompt.toLowerCase();

    // Check if user directly asked for Jules
    const isExplicitUserRequest =
      input.isExplicitUserRequest ||
      DIRECT_INTENT_KEYWORDS.some((kw) => lower.includes(kw));

    // 1. Quota Guardrail Check (Hard Block)
    if (quotaStatus.is75Exceeded) {
      return {
        shouldDelegate: false,
        recommendation: "BLOCKED_BY_QUOTA",
        confidence: 1.0,
        reason: `Delegation blocked: 75% daily quota threshold reached (${quotaStatus.currentUsage}/${quotaStatus.dailyLimit} requests, ceiling is ${quotaStatus.maxAllowedUsage75}). Executing locally in OpenCode.`,
        factors: {
          isExplicitUserRequest,
          estimatedComplexity: "medium",
          estimatedScope: "single_file",
          isLongRunning: false,
          quotaAvailable: false,
          hasCleanGitWorkingTree: !gitInfo?.hasUncommittedChanges,
        },
      };
    }

    // 2. Explicit User Request
    if (isExplicitUserRequest) {
      return {
        shouldDelegate: true,
        recommendation: "DELEGATE_TO_JULES",
        confidence: 0.95,
        reason: "User explicitly requested task delegation to Jules.",
        factors: {
          isExplicitUserRequest: true,
          estimatedComplexity: "high",
          estimatedScope: "multi_file",
          isLongRunning: true,
          quotaAvailable: true,
          hasCleanGitWorkingTree: !gitInfo?.hasUncommittedChanges,
        },
      };
    }

    // 3. Autonomous Heuristic Evaluation
    let score = 0;

    // Check lightweight phrases
    const isLightweight = LIGHTWEIGHT_KEYWORDS.some((kw) => lower.includes(kw));
    if (isLightweight) {
      return {
        shouldDelegate: false,
        recommendation: "EXECUTE_LOCALLY",
        confidence: 0.9,
        reason: "Task appears lightweight or interactive; executing directly in OpenCode.",
        factors: {
          isExplicitUserRequest: false,
          estimatedComplexity: "low",
          estimatedScope: "single_file",
          isLongRunning: false,
          quotaAvailable: true,
          hasCleanGitWorkingTree: !gitInfo?.hasUncommittedChanges,
        },
      };
    }

    // Count heavy keywords
    for (const kw of HEAVY_TASK_KEYWORDS) {
      if (lower.includes(kw)) {
        score += 2;
      }
    }

    // Hint from caller regarding affected files
    if (input.affectedFilesCountHint && input.affectedFilesCountHint > 3) {
      score += 3;
    }

    // Prompt length/depth heuristic (detailed multi-paragraph instructions often imply heavy work)
    if (prompt.length > 300) {
      score += 1;
    }

    const isHeavy = score >= 3;
    const complexity: "low" | "medium" | "high" =
      score >= 4 ? "high" : score >= 2 ? "medium" : "low";
    const scope: "single_file" | "multi_file" | "repo_wide" =
      score >= 4 ? "repo_wide" : score >= 2 ? "multi_file" : "single_file";

    if (isHeavy) {
      return {
        shouldDelegate: true,
        recommendation: "DELEGATE_TO_JULES",
        confidence: Math.min(0.85, 0.5 + score * 0.1),
        reason: `Task identified as heavy/long-running (${complexity} complexity, score ${score}) with sufficient quota capacity remaining (${quotaStatus.remainingUnder75} under 75% ceiling).`,
        factors: {
          isExplicitUserRequest: false,
          estimatedComplexity: complexity,
          estimatedScope: scope,
          isLongRunning: true,
          quotaAvailable: true,
          hasCleanGitWorkingTree: !gitInfo?.hasUncommittedChanges,
        },
      };
    }

    return {
      shouldDelegate: false,
      recommendation: "EXECUTE_LOCALLY",
      confidence: 0.75,
      reason: "Task complexity does not warrant asynchronous delegation to Jules. Executing locally.",
      factors: {
        isExplicitUserRequest: false,
        estimatedComplexity: complexity,
        estimatedScope: scope,
        isLongRunning: false,
        quotaAvailable: true,
        hasCleanGitWorkingTree: !gitInfo?.hasUncommittedChanges,
      },
    };
  }
}
