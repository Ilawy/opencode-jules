#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { DelegationService } from "./delegation-service.js";

/**
 * Model Context Protocol (MCP) Server for Google Jules Delegation
 * Provides tools, prompts, and resources to any MCP client (OpenCode, Claude, Cursor, etc.)
 */
export async function runMcpServer() {
  const service = new DelegationService({}, process.cwd());

  const server = new Server(
    {
      name: "jules-delegation-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // 1. List Available Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "jules_delegate",
          description:
            "Delegate a heavy, time-consuming coding task to Google Jules. " +
            "Automatically resolves git repo/branch and blocks if 75% daily quota limit is reached.",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description:
                  "Comprehensive task instructions, acceptance criteria, and background for Jules.",
              },
              title: {
                type: "string",
                description: "Short title for the session (e.g., 'Migrate Auth to v2').",
              },
              branch: {
                type: "string",
                description: "Starting Git branch (defaults to current branch).",
              },
              source: {
                type: "string",
                description: "Explicit Jules source name (e.g. 'sources/github-owner-repo').",
              },
              requirePlanApproval: {
                type: "boolean",
                description: "Pause for user plan approval before writing code.",
              },
              isExplicitUserRequest: {
                type: "boolean",
                description: "Set true if directly requested by user.",
              },
            },
            required: ["prompt"],
          },
        },
        {
          name: "jules_check_session",
          description: "Check status, activities, and PR creation for a Jules session.",
          inputSchema: {
            type: "object",
            properties: {
              sessionId: {
                type: "string",
                description: "Jules session ID or path (e.g. '1234567' or 'sessions/1234567').",
              },
            },
            required: ["sessionId"],
          },
        },
        {
          name: "jules_get_quota",
          description:
            "Get current Jules rolling 24-hour quota status, 75% guardrail limit, and remaining capacity.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "jules_list_sessions",
          description: "List recent Google Jules sessions for the authenticated account.",
          inputSchema: {
            type: "object",
            properties: {
              pageSize: {
                type: "number",
                description: "Max number of sessions to return.",
              },
            },
          },
        },
        {
          name: "jules_list_sources",
          description: "List GitHub repositories registered with Jules.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  // 2. Call Tool Handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case "jules_delegate": {
        const prompt = String(args.prompt || "");
        if (!prompt) {
          throw new McpError(ErrorCode.InvalidParams, "prompt is required");
        }

        const result = await service.delegateTask({
          prompt,
          title: args.title ? String(args.title) : undefined,
          branch: args.branch ? String(args.branch) : undefined,
          source: args.source ? String(args.source) : undefined,
          requirePlanApproval:
            args.requirePlanApproval !== undefined
              ? Boolean(args.requirePlanApproval)
              : undefined,
          isExplicitUserRequest: Boolean(args.isExplicitUserRequest),
        });

        return {
          content: [
            {
              type: "text",
              text: result.message,
            },
          ],
        };
      }

      case "jules_check_session": {
        const sessionId = String(args.sessionId || "");
        if (!sessionId) {
          throw new McpError(ErrorCode.InvalidParams, "sessionId is required");
        }

        try {
          const check = await service.checkSession(sessionId);
          return {
            content: [{ type: "text", text: check.summary }],
          };
        } catch (err: any) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error inspecting session: ${err.message || String(err)}`,
              },
            ],
          };
        }
      }

      case "jules_get_quota": {
        const status = service.getQuotaStatus();
        const text =
          `Jules Quota Report:\n` +
          `• Tier: ${status.tier.toUpperCase()}\n` +
          `• Daily Request Limit: ${status.dailyLimit}\n` +
          `• Rolling 24h Usage: ${status.currentUsage} (${status.usagePercentage}%)\n` +
          `• 75% Guardrail Ceiling: ${status.maxAllowedUsage75} requests\n` +
          `• Remaining Before 75% Block: ${status.remainingUnder75} requests\n` +
          `• Status: ${status.is75Exceeded ? "BLOCKED (>= 75% limit reached)" : "ALLOWED"}`;

        return {
          content: [{ type: "text", text }],
        };
      }

      case "jules_list_sessions": {
        const pageSize = typeof args.pageSize === "number" ? args.pageSize : 10;
        try {
          const sessions = await service.listSessions(pageSize);
          const lines = sessions.map(
            (s) => `• [${s.state}] ${s.title || "Untitled"} (${s.name}) - ${s.url || ""}`
          );
          return {
            content: [
              {
                type: "text",
                text: lines.length > 0 ? lines.join("\n") : "No sessions found.",
              },
            ],
          };
        } catch (err: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error listing sessions: ${err.message}` }],
          };
        }
      }

      case "jules_list_sources": {
        try {
          const sources = await service.listSources();
          const lines = sources.map(
            (s) => `• ${s.name} (${s.githubRepo ? `${s.githubRepo.owner}/${s.githubRepo.repo}` : s.id})`
          );
          return {
            content: [
              {
                type: "text",
                text: lines.length > 0 ? lines.join("\n") : "No connected sources found in Jules.",
              },
            ],
          };
        } catch (err: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error listing sources: ${err.message}` }],
          };
        }
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  });

  // 3. Expose Live Resource: jules://quota
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "jules://quota",
          name: "Jules Quota Status",
          mimeType: "application/json",
          description: "Real-time Jules 24-hour quota metrics and 75% guardrail status.",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === "jules://quota") {
      const status = service.getQuotaStatus();
      return {
        contents: [
          {
            uri: "jules://quota",
            mimeType: "application/json",
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${request.params.uri}`);
  });

  // 4. Expose Prompt Templates
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "jules_delegate_heavy_task",
          description: "Prompt template for delegating a complex, multi-file refactor or test suite to Jules.",
          arguments: [
            {
              name: "task_description",
              description: "Detailed description of the task to delegate.",
              required: true,
            },
          ],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name === "jules_delegate_heavy_task") {
      const desc = request.params.arguments?.task_description || "";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Evaluate the following task for Google Jules delegation:\n\n` +
                `${desc}\n\n` +
                `First verify that Jules quota is under 75% using jules_get_quota. ` +
                `If quota is available and the task is heavy/multi-file/long-running, call jules_delegate.`,
            },
          },
        ],
      };
    }
    throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${request.params.name}`);
  });

  // Start Transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[jules-delegation-mcp] MCP server running on stdio.");
}

if (import.meta.main) {
  runMcpServer().catch((err) => {
    console.error("[jules-delegation-mcp] Fatal error:", err);
    process.exit(1);
  });
}
