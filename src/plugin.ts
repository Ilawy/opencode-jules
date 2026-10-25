import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { randomUUID } from "node:crypto";
import { DelegationService } from "./delegation-service.js";

/**
 * OpenCode Plugin: Google Jules Delegation Integration
 *
 * Provides custom tools and autonomous LLM guidance to delegate heavy,
 * time-consuming tasks to Google Jules with a strict 75% daily quota guardrail.
 */
export const JulesDelegationPlugin: Plugin = async (input: PluginInput) => {
  const service = new DelegationService({}, input.worktree || input.directory);

  return {
    tool: {
      /**
       * Tool: jules_delegate
       * Delegates a coding task to Google Jules with automatic Git resolution
       * and strict 75% quota enforcement.
       */
      jules_delegate: tool({
        description:
          "Delegates a heavy, long-running, or complex coding task to Google Jules. " +
          "Automatically checks repository source, branch, and enforces the 75% daily quota limit. " +
          "Use for multi-file refactors, large test suites, framework migrations, or when explicitly requested by user.",
        args: {
          prompt: tool.schema
            .string()
            .describe(
              "Comprehensive task description, requirements, acceptance criteria, and instructions for Jules."
            ),
          title: tool.schema
            .string()
            .optional()
            .describe("Short descriptive title for the Jules session (e.g. 'Refactor Auth Middleware')."),
          branch: tool.schema
            .string()
            .optional()
            .describe("Git starting branch (defaults to current active branch)."),
          source: tool.schema
            .string()
            .optional()
            .describe("Explicit Jules source ID (defaults to auto-detected GitHub repository source)."),
          requirePlanApproval: tool.schema
            .boolean()
            .optional()
            .describe("Whether Jules should pause and require plan approval before writing code."),
          isExplicitUserRequest: tool.schema
            .boolean()
            .optional()
            .describe("Set to true if this delegation was directly requested by the user."),
        },
        async execute(args) {
          const result = await service.delegateTask({
            prompt: args.prompt,
            title: args.title,
            branch: args.branch,
            source: args.source,
            requirePlanApproval: args.requirePlanApproval,
            isExplicitUserRequest: args.isExplicitUserRequest,
          });

          return result.message;
        },
      }),

      /**
       * Tool: jules_check_session
       * Checks the status, activities, and generated artifacts/PR for a running or completed session.
       */
      jules_check_session: tool({
        description:
          "Checks the current status, agent activities, and generated pull request for a Jules session.",
        args: {
          sessionId: tool.schema
            .string()
            .describe("The Jules session ID or name (e.g. '1234567' or 'sessions/1234567')."),
        },
        async execute(args) {
          try {
            const check = await service.checkSession(args.sessionId);
            return check.summary;
          } catch (err: any) {
            return `Failed to inspect session ${args.sessionId}: ${err.message || String(err)}`;
          }
        },
      }),

      /**
       * Tool: jules_get_quota
       * Retrieves current Jules quota usage, 75% guardrail limit, and remaining capacity.
       */
      jules_get_quota: tool({
        description:
          "Returns the current Jules daily request quota status in the rolling 24-hour window, " +
          "including total usage, 75% ceiling threshold, and remaining capacity.",
        args: {},
        async execute() {
          const status = service.getQuotaStatus();
          const resetNotice = status.nextResetTimestamp
            ? `\nNext quota slot recovery in: ~${Math.ceil((status.nextResetTimestamp - Date.now()) / (60 * 1000))} minute(s).`
            : "";

          return (
            `📊 Jules Daily Quota Status:\n` +
            `• Tier: ${status.tier.toUpperCase()}\n` +
            `• 24h Rolling Usage: ${status.currentUsage} / ${status.dailyLimit} requests (${status.usagePercentage}%)\n` +
            `• 75% Guardrail Ceiling: ${status.maxAllowedUsage75} requests\n` +
            `• Remaining Capacity Under 75%: ${status.remainingUnder75} requests\n` +
            `• Status: ${status.is75Exceeded ? "⛔ 75% QUOTA EXCEEDED (Delegation Blocked)" : "✅ ACCEPTING DELEGATIONS"}` +
            resetNotice
          );
        },
      }),

      /**
       * Tool: jules_list_sessions
       * Lists recent Jules sessions and their execution states.
       */
      jules_list_sessions: tool({
        description: "Lists recent Google Jules sessions for the connected account.",
        args: {
          pageSize: tool.schema
            .number()
            .optional()
            .describe("Number of sessions to list (default 10)."),
        },
        async execute(args) {
          try {
            const sessions = await service.listSessions(args.pageSize || 10);
            if (sessions.length === 0) {
              return "No Jules sessions found.";
            }

            const lines = sessions.map((s) => {
              const id = s.name.replace("sessions/", "");
              return `• [${s.state}] ${s.title || "Untitled"} (ID: ${id}) - ${s.url || ""}`;
            });

            return `Recent Jules Sessions:\n${lines.join("\n")}`;
          } catch (err: any) {
            return `Failed to list sessions: ${err.message || String(err)}`;
          }
        },
      }),

      /**
       * Tool: jules_list_sources
       * Lists GitHub repositories registered with Jules.
       */
      jules_list_sources: tool({
        description: "Lists GitHub repositories that are currently connected to Google Jules.",
        args: {},
        async execute() {
          try {
            const sources = await service.listSources();
            if (sources.length === 0) {
              return "No connected GitHub sources found in Jules. Please link your repositories at https://jules.google.com/settings";
            }
            const lines = sources.map(
              (s) => `• ${s.name} (${s.githubRepo ? `${s.githubRepo.owner}/${s.githubRepo.repo}` : s.id})`
            );
            return `Connected Jules Sources:\n${lines.join("\n")}`;
          } catch (err: any) {
            return `Failed to list sources: ${err.message || String(err)}`;
          }
        },
      }),
    },

    /**
     * Inject Jules delegation guidelines into the LLM system prompt
     */
    "experimental.chat.system.transform": async (_ctx, output) => {
      output.system.push(service.getSystemPrompt());
    },

    /**
     * Handle slash command /jules if executed directly by the user
     */
    "command.execute.before": async (cmdInput, output) => {
      if (cmdInput.command === "jules") {
        const prompt = cmdInput.arguments.trim();
        if (!prompt) {
          output.parts.push({
            id: randomUUID(),
            sessionID: cmdInput.sessionID,
            messageID: randomUUID(),
            type: "text",
            text: "Usage: /jules <description of task to delegate to Jules>",
          });
          return;
        }

        const result = await service.delegateTask({
          prompt,
          isExplicitUserRequest: true,
        });

        output.parts.push({
          id: randomUUID(),
          sessionID: cmdInput.sessionID,
          messageID: randomUUID(),
          type: "text",
          text: result.message,
        });
      }
    },
  };
};

export default JulesDelegationPlugin;
