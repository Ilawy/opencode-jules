import { Plugin } from "@opencode/plugin";
import { DelegationService } from "./delegation-service.js";

export default Plugin.define({
  id: "jules-delegation",
  async setup(ctx) {
    const service = new DelegationService({}, ctx.location.directory);

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "jules",
        description: "Google Jules delegation tools",
      });

      editor.add({
        name: "delegate",
        description:
          "Delegates a heavy, long-running, or complex coding task to Google Jules. " +
          "Automatically checks repository source, branch, and enforces the 75% daily quota limit. " +
          "Use for multi-file refactors, large test suites, framework migrations, or when explicitly requested by user.",
        input: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description:
                "Comprehensive task description, requirements, acceptance criteria, and instructions for Jules.",
            },
            title: {
              type: "string",
              description: "Short descriptive title for the Jules session (e.g. 'Refactor Auth Middleware').",
            },
            branch: {
              type: "string",
              description: "Git starting branch (defaults to current active branch).",
            },
            source: {
              type: "string",
              description: "Explicit Jules source ID (defaults to auto-detected GitHub repository source).",
            },
            requirePlanApproval: {
              type: "boolean",
              description: "Whether Jules should pause and require plan approval before writing code.",
            },
            isExplicitUserRequest: {
              type: "boolean",
              description: "Set to true if this delegation was directly requested by the user.",
            },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
        options: { namespace: "jules", codemode: true },
        async execute(input) {
          const args = input as {
            prompt: string;
            title?: string;
            branch?: string;
            source?: string;
            requirePlanApproval?: boolean;
            isExplicitUserRequest?: boolean;
          };

          const result = await service.delegateTask({
            prompt: args.prompt,
            title: args.title,
            branch: args.branch,
            source: args.source,
            requirePlanApproval: args.requirePlanApproval,
            isExplicitUserRequest: args.isExplicitUserRequest,
          });

          return { content: result.message };
        },
      });

      editor.add({
        name: "check_session",
        description: "Checks the current status, agent activities, and generated pull request for a Jules session.",
        input: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "The Jules session ID or name (e.g. '1234567' or 'sessions/1234567').",
            },
          },
          required: ["sessionId"],
          additionalProperties: false,
        },
        options: { namespace: "jules", codemode: true },
        async execute(input) {
          const args = input as { sessionId: string };
          try {
            const check = await service.checkSession(args.sessionId);
            return { content: check.summary };
          } catch (err: any) {
            return {
              content: `Failed to inspect session ${args.sessionId}: ${err?.message || String(err)}`,
            };
          }
        },
      });

      editor.add({
        name: "get_quota",
        description:
          "Returns the current Jules daily request quota status in the rolling 24-hour window, " +
          "including total usage, 75% ceiling threshold, and remaining capacity.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        options: { namespace: "jules", codemode: true },
        async execute() {
          const status = service.getQuotaStatus();
          const resetNotice = status.nextResetTimestamp
            ? `\nNext quota slot recovery in: ~${Math.ceil((status.nextResetTimestamp - Date.now()) / (60 * 1000))} minute(s).`
            : "";

          return {
            content:
              `📊 Jules Daily Quota Status:\n` +
              `• Tier: ${status.tier.toUpperCase()}\n` +
              `• 24h Rolling Usage: ${status.currentUsage} / ${status.dailyLimit} requests (${status.usagePercentage}%)\n` +
              `• 75% Guardrail Ceiling: ${status.maxAllowedUsage75} requests\n` +
              `• Remaining Capacity Under 75%: ${status.remainingUnder75} requests\n` +
              `• Status: ${status.is75Exceeded ? "⛔ 75% QUOTA EXCEEDED (Delegation Blocked)" : "✅ ACCEPTING DELEGATIONS"}` +
              resetNotice,
          };
        },
      });

      editor.add({
        name: "list_sessions",
        description: "Lists recent Google Jules sessions for the connected account.",
        input: {
          type: "object",
          properties: {
            pageSize: {
              type: "number",
              description: "Number of sessions to list (default 10).",
            },
          },
          additionalProperties: false,
        },
        options: { namespace: "jules", codemode: true },
        async execute(input) {
          const args = input as { pageSize?: number };
          try {
            const sessions = await service.listSessions(args.pageSize || 10);
            if (sessions.length === 0) {
              return { content: "No Jules sessions found." };
            }

            const lines = sessions.map((s) => {
              const id = s.name.replace("sessions/", "");
              return `• [${s.state}] ${s.title || "Untitled"} (ID: ${id}) - ${s.url || ""}`;
            });

            return { content: `Recent Jules Sessions:\n${lines.join("\n")}` };
          } catch (err: any) {
            return { content: `Failed to list sessions: ${err?.message || String(err)}` };
          }
        },
      });

      editor.add({
        name: "list_sources",
        description: "Lists GitHub repositories that are currently connected to Google Jules.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        options: { namespace: "jules", codemode: true },
        async execute() {
          try {
            const sources = await service.listSources();
            if (sources.length === 0) {
              return {
                content:
                  "No connected GitHub sources found in Jules. Please link your repositories at https://jules.google.com/settings",
              };
            }
            const lines = sources.map(
              (s) => `• ${s.name} (${s.githubRepo ? `${s.githubRepo.owner}/${s.githubRepo.repo}` : s.id})`
            );
            return { content: `Connected Jules Sources:\n${lines.join("\n")}` };
          } catch (err: any) {
            return { content: `Failed to list sources: ${err?.message || String(err)}` };
          }
        },
      });
    });

    await ctx.session.hook("context", (event) => {
      event.system.push({
        type: "text",
        text: service.getSystemPrompt(),
      });
    });

    await ctx.command.transform((editor) => {
      editor.add({
        name: "jules",
        description: "Delegate a task to Google Jules",
        execute: async (input) => {
          const prompt = input.prompt.text.trim();
          if (!prompt) {
            await ctx.session.synthetic({
              sessionID: input.sessionID,
              text: "Usage: /jules <description of task to delegate to Jules>",
            });
            return;
          }

          const result = await service.delegateTask({
            prompt,
            isExplicitUserRequest: true,
          });

          await ctx.session.synthetic({
            sessionID: input.sessionID,
            text: result.message,
          });
        },
      });
    });

    return () => {};
  },
});
