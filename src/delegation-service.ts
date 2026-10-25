import { loadConfig, type JulesConfig } from "./config.js";
import { DecisionEngine } from "./decision-engine.js";
import { GitContextResolver } from "./git-context.js";
import { JulesClient } from "./jules-client.js";
import { QuotaManager } from "./quota-manager.js";
import type {
  DecisionEvaluation,
  GitRepoInfo,
  JulesActivity,
  JulesSession,
  JulesSource,
  QuotaStatus,
} from "./types.js";

export interface DelegateTaskInput {
  prompt: string;
  title?: string;
  source?: string;
  branch?: string;
  requirePlanApproval?: boolean;
  isExplicitUserRequest?: boolean;
}

export interface DelegateTaskOutput {
  success: boolean;
  sessionId?: string;
  sessionUrl?: string;
  state?: string;
  message: string;
  quotaStatus: QuotaStatus;
  gitInfo?: GitRepoInfo;
}

export class DelegationService {
  public config: JulesConfig;
  public quotaManager: QuotaManager;
  public julesClient: JulesClient;
  public gitResolver: GitContextResolver;

  constructor(configOverrides?: Partial<JulesConfig>, cwd = process.cwd()) {
    this.config = loadConfig(configOverrides);
    this.quotaManager = new QuotaManager(this.config);
    this.julesClient = new JulesClient(this.config);
    this.gitResolver = new GitContextResolver(cwd);
  }

  /**
   * Get quota status
   */
  public getQuotaStatus(): QuotaStatus {
    return this.quotaManager.getQuotaStatus();
  }

  /**
   * Get system prompt guidance for the LLM
   */
  public getSystemPrompt(): string {
    const status = this.getQuotaStatus();
    return DecisionEngine.getSystemPromptGuidelines(status);
  }

  /**
   * Evaluate whether a task should be delegated
   */
  public evaluateTask(prompt: string, isExplicitUserRequest = false): DecisionEvaluation {
    const quotaStatus = this.getQuotaStatus();
    const gitInfo = this.gitResolver.inspect();
    const decisionEngine = new DecisionEngine();
    return decisionEngine.evaluate({
      prompt,
      isExplicitUserRequest,
      gitInfo,
      quotaStatus,
    });
  }

  /**
   * Delegate a task to Jules with strict 75% quota enforcement
   */
  public async delegateTask(input: DelegateTaskInput): Promise<DelegateTaskOutput> {
    // 1. Quota Check (Hard 75% limit enforcement)
    const quotaCheck = this.quotaManager.canDelegate();
    if (!quotaCheck.allowed) {
      return {
        success: false,
        message: quotaCheck.reason || "Delegation blocked by 75% quota guardrail.",
        quotaStatus: quotaCheck.quotaStatus,
      };
    }

    // 2. Git context resolution
    const gitInfo = this.gitResolver.inspect();
    let source = input.source;
    let branch = input.branch || gitInfo.currentBranch || "main";

    if (!source) {
      if (!gitInfo.isGitRepo) {
        return {
          success: false,
          message:
            "Current directory is not a Git repository. Jules requires a connected GitHub repository source.",
          quotaStatus: quotaCheck.quotaStatus,
          gitInfo,
        };
      }

      if (!gitInfo.owner || !gitInfo.repo) {
        return {
          success: false,
          message:
            "Could not determine GitHub repository owner/repo from git remote origin. Ensure remote is a GitHub repository.",
          quotaStatus: quotaCheck.quotaStatus,
          gitInfo,
        };
      }

      // Check connected sources on Jules
      try {
        const matchedSource = await this.julesClient.findSource(gitInfo.owner, gitInfo.repo);
        if (matchedSource) {
          source = matchedSource.name;
        } else {
          // Fallback to convention name
          source = `sources/github-${gitInfo.owner.toLowerCase()}-${gitInfo.repo.toLowerCase()}`;
        }
      } catch (err: any) {
        // If listing fails (e.g. network/auth), fallback to convention
        source = `sources/github-${gitInfo.owner.toLowerCase()}-${gitInfo.repo.toLowerCase()}`;
      }
    }

    // Check for dirty working tree warning
    let dirtyWarning = "";
    if (gitInfo.hasUncommittedChanges) {
      dirtyWarning = `\n⚠️ Note: You have ${gitInfo.uncommittedFilesCount} uncommitted local change(s). Jules works from remote branch '${branch}'. Consider committing and pushing changes if Jules needs them.`;
    }

    const title = input.title || input.prompt.split("\n")[0]?.slice(0, 50) || "OpenCode Delegated Task";
    const requirePlanApproval = input.requirePlanApproval ?? this.config.requirePlanApproval;

    // 3. Create Session via Jules API
    try {
      const session = await this.julesClient.createSession({
        prompt: input.prompt,
        title,
        sourceContext: {
          source,
          githubRepoContext: {
            startingBranch: branch,
          },
        },
        requirePlanApproval,
        automationMode: this.config.automationMode,
      });

      const sessionId = session.name || session.id || "unknown";
      const sessionUrl =
        session.url || `https://jules.google.com/session/${sessionId.replace("sessions/", "")}`;

      // 4. Record successful delegation into Quota Manager
      const updatedQuota = this.quotaManager.recordDelegation(sessionId, {
        title,
        prompt: input.prompt,
        source,
      });

      return {
        success: true,
        sessionId,
        sessionUrl,
        state: session.state || "QUEUED",
        message:
          `🚀 Task successfully delegated to Jules!\n` +
          `• Session: ${sessionId}\n` +
          `• State: ${session.state || "QUEUED"}\n` +
          `• Source: ${source} (Branch: ${branch})\n` +
          `• Dashboard: ${sessionUrl}\n` +
          `• Daily Quota: ${updatedQuota.currentUsage}/${updatedQuota.dailyLimit} used (${updatedQuota.remainingUnder75} remaining before 75% limit).` +
          dirtyWarning,
        quotaStatus: updatedQuota,
        gitInfo,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to delegate task to Jules: ${err.message || String(err)}`,
        quotaStatus: quotaCheck.quotaStatus,
        gitInfo,
      };
    }
  }

  /**
   * Check status and activities of a Jules session
   */
  public async checkSession(sessionId: string): Promise<{
    session: JulesSession;
    activities: JulesActivity[];
    summary: string;
  }> {
    const session = await this.julesClient.getSession(sessionId);
    const activities = await this.julesClient.listActivities(sessionId);

    const latestActivities = activities.slice(-5).map((a) => `• [${a.originator}] ${a.description}`);
    const summary =
      `Session: ${session.name}\n` +
      `Title: ${session.title || "Untitled"}\n` +
      `State: ${session.state}\n` +
      `URL: ${session.url || `https://jules.google.com/session/${sessionId.replace("sessions/", "")}`}\n` +
      `Recent Activities (${activities.length} total):\n` +
      (latestActivities.length > 0 ? latestActivities.join("\n") : "• No activities recorded yet.");

    return { session, activities, summary };
  }

  /**
   * List recent sessions
   */
  public async listSessions(pageSize = 15): Promise<JulesSession[]> {
    const res = await this.julesClient.listSessions(pageSize);
    return res.sessions || [];
  }

  /**
   * List connected sources
   */
  public async listSources(): Promise<JulesSource[]> {
    return await this.julesClient.listSources();
  }
}
