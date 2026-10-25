/**
 * Jules API and Plugin Type Definitions
 */

export type JulesSessionState =
  | "STATE_UNSPECIFIED"
  | "QUEUED"
  | "PLANNING"
  | "AWAITING_PLAN_APPROVAL"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface JulesSourceContext {
  source: string; // e.g. "sources/github-owner-repo"
  githubRepoContext?: {
    startingBranch?: string;
  };
}

export interface JulesCreateSessionRequest {
  prompt: string;
  title?: string;
  sourceContext: JulesSourceContext;
  requirePlanApproval?: boolean;
  automationMode?: "AUTO_CREATE_PR" | "MANUAL_PR" | "NO_PR" | string;
}

export interface JulesSession {
  name: string; // e.g. "sessions/1234567"
  id?: string;
  title?: string;
  prompt?: string;
  state: JulesSessionState;
  url?: string;
  createTime?: string;
  updateTime?: string;
  sourceContext?: JulesSourceContext;
  requirePlanApproval?: boolean;
  automationMode?: string;
}

export interface JulesActivity {
  name: string; // e.g. "sessions/1234567/activities/act1"
  id: string;
  originator: "user" | "agent" | "system" | string;
  description: string;
  createTime: string;
  type?: string;
  artifacts?: Array<{
    changeSet?: {
      gitPatch?: string;
      pullRequestUrl?: string;
    };
    bashOutput?: string;
    media?: unknown;
  }>;
}

export interface JulesSource {
  name: string; // e.g. "sources/github-owner-repo"
  id: string;
  githubRepo?: {
    owner: string;
    repo: string;
    defaultBranch?: string;
  };
}

export interface ListSourcesResponse {
  sources?: JulesSource[];
  nextPageToken?: string;
}

export interface ListSessionsResponse {
  sessions?: JulesSession[];
  nextPageToken?: string;
}

export interface ListActivitiesResponse {
  activities?: JulesActivity[];
  nextPageToken?: string;
}

export type JulesTier = "base" | "pro" | "ultra" | "custom";

export interface QuotaRecord {
  sessionId: string;
  timestamp: number; // Unix epoch ms
  title?: string;
  promptPreview?: string;
  source?: string;
}

export interface QuotaStatus {
  tier: JulesTier;
  dailyLimit: number;
  rollingWindowHours: number;
  currentUsage: number; // requests in last 24h
  maxAllowedUsage75: number; // Math.floor(dailyLimit * 0.75)
  remainingUnder75: number; // maxAllowedUsage75 - currentUsage
  is75Exceeded: boolean;
  usagePercentage: number; // (currentUsage / dailyLimit) * 100
  oldestActiveTimestamp?: number;
  nextResetTimestamp?: number; // timestamp when oldest active record drops out of 24h window
}

export interface DelegationCheckResult {
  allowed: boolean;
  reason?: string;
  quotaStatus: QuotaStatus;
}

export interface GitRepoInfo {
  isGitRepo: boolean;
  owner?: string;
  repo?: string;
  remoteUrl?: string;
  currentBranch?: string;
  hasUncommittedChanges: boolean;
  uncommittedFilesCount: number;
  suggestedSourceName?: string; // e.g. "sources/github-owner-repo"
}

export interface DecisionEvaluation {
  shouldDelegate: boolean;
  recommendation: "DELEGATE_TO_JULES" | "EXECUTE_LOCALLY" | "BLOCKED_BY_QUOTA" | "NEEDS_USER_CONFIRMATION";
  confidence: number; // 0.0 - 1.0
  reason: string;
  factors: {
    isExplicitUserRequest: boolean;
    estimatedComplexity: "low" | "medium" | "high";
    estimatedScope: "single_file" | "multi_file" | "repo_wide";
    isLongRunning: boolean;
    quotaAvailable: boolean;
    hasCleanGitWorkingTree: boolean;
  };
}
