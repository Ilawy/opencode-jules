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
import { NtfyClient } from "./ntfy-client.js";
import { loadNtfyConfig, redactConfig } from "./ntfy-config.js";
import type { NtfyPublishInput, NtfyPriority } from "./ntfy-types.js";

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const l = v.toLowerCase();
    if (l === "true" || l === "1" || l === "yes") return true;
    if (l === "false" || l === "0" || l === "no") return false;
  }
  return undefined;
}

function asStringArray(v: unknown): string[] | string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.map((x) => String(x));
  return String(v);
}

export async function runNtfyMcpServer() {
  const client = new NtfyClient();

  const server = new Server(
    {
      name: "ntfy-mcp",
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

  // 1. List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "ntfy_send",
          description:
            "Publish a notification to an ntfy.sh topic (or a self-hosted ntfy server). " +
            "Supports title, priority, tags, click URL, attachments, email forwarding, delayed delivery, markdown, and action buttons. " +
            "Defaults come from environment/config (NTFY_*).",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "Notification body (required).",
              },
              topic: {
                type: "string",
                description: "Target topic. Defaults to NTFY_TOPIC.",
              },
              serverUrl: {
                type: "string",
                description: "Override ntfy server base URL (e.g. https://ntfy.sh or self-hosted).",
              },
              title: { type: "string", description: "Notification title." },
              priority: {
                type: ["string", "number"],
                description: "Priority: 1-5 or min/low/default/high/max/urgent.",
              },
              tags: {
                type: ["string", "array"],
                description: "Comma-separated tags or array of tags (emojis supported).",
                items: { type: "string" },
              },
              click: { type: "string", description: "URL opened when notification is clicked." },
              icon: { type: "string", description: "Icon URL." },
              attach: { type: "string", description: "Attachment URL." },
              filename: { type: "string", description: "Filename for attachment." },
              email: { type: "string", description: "Email address to forward the notification to." },
              delay: {
                type: "string",
                description: "Delay delivery (e.g. '30m', '1h', 'tomorrow 10am', unix timestamp).",
              },
              markdown: {
                type: "boolean",
                description: "Render message as Markdown.",
              },
              actions: {
                type: ["string", "array"],
                description:
                  "Action buttons. Either a shorthand string (e.g. 'view, Open, https://...') or an array of action objects.",
              },
              headers: {
                type: "object",
                description: "Extra HTTP headers to merge into the request.",
                additionalProperties: { type: "string" },
              },
            },
            required: ["message"],
          },
        },
        {
          name: "ntfy_poll",
          description:
            "Poll (retrieve) previously published messages for a topic. Uses ntfy's JSON poll endpoint.",
          inputSchema: {
            type: "object",
            properties: {
              topic: { type: "string", description: "Topic to poll. Defaults to NTFY_TOPIC." },
              serverUrl: { type: "string", description: "Override ntfy server base URL." },
              since: {
                type: ["string", "number"],
                description: "Return messages since this id/timestamp/all (default: all).",
              },
              scheduled: { type: "boolean", description: "Include scheduled (delayed) messages." },
              limit: { type: "number", description: "Max number of messages to return." },
              timeoutMs: { type: "number", description: "Request timeout in ms." },
            },
          },
        },
        {
          name: "ntfy_health",
          description: "Check health of an ntfy server.",
          inputSchema: {
            type: "object",
            properties: {
              serverUrl: { type: "string", description: "Override ntfy server base URL." },
            },
          },
        },
        {
          name: "ntfy_config",
          description: "Show the resolved (redacted) ntfy configuration.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  // 2. Call tool handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    switch (name) {
      case "ntfy_send": {
        const message = String(args.message ?? "");
        if (!message) {
          throw new McpError(ErrorCode.InvalidParams, "message is required");
        }

        const input: NtfyPublishInput = {
          message,
          topic: asString(args.topic),
          serverUrl: asString(args.serverUrl),
          title: asString(args.title),
          priority: args.priority as NtfyPriority | string | number | undefined,
          tags: asStringArray(args.tags),
          click: asString(args.click),
          icon: asString(args.icon),
          attach: asString(args.attach),
          filename: asString(args.filename),
          email: asString(args.email),
          delay: asString(args.delay),
          markdown: asBoolean(args.markdown),
          actions: args.actions as any,
          headers:
            args.headers && typeof args.headers === "object"
              ? (args.headers as Record<string, string>)
              : undefined,
        };

        try {
          const result = await client.publish(input);
          const summary =
            `✅ Notification sent\n` +
            `• Topic: ${result.topic}\n` +
            `• ID: ${result.id}\n` +
            `• Status: ${result.status}\n` +
            `• Priority: ${result.priority ?? "default"}\n` +
            `• Tags: ${(result.tags ?? []).join(", ") || "(none)"}`;
          return { content: [{ type: "text", text: summary }] };
        } catch (err: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error sending notification: ${err?.message || String(err)}` }],
          };
        }
      }

      case "ntfy_poll": {
        const since = args.since;
        try {
          const msgs = await client.poll({
            topic: asString(args.topic),
            serverUrl: asString(args.serverUrl),
            since: since as string | number | undefined,
            scheduled: asBoolean(args.scheduled),
            limit: asNumber(args.limit),
            timeoutMs: asNumber(args.timeoutMs),
          });
          const lines = msgs.map(
            (m) =>
              `• [${m.event}] ${m.title ? m.title + " — " : ""}${m.message ?? ""} (id=${m.id}, prio=${m.priority ?? 3}, tags=${(m.tags ?? []).join(",")})`
          );
          return {
            content: [
              {
                type: "text",
                text: lines.length ? lines.join("\n") : "No messages found.",
              },
            ],
          };
        } catch (err: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error polling messages: ${err?.message || String(err)}` }],
          };
        }
      }

      case "ntfy_health": {
        try {
          const h = await client.health(asString(args.serverUrl));
          return {
            content: [
              {
                type: "text",
                text: `ntfy health: ${h.healthy ? "OK" : "UNHEALTHY"} (HTTP ${h.status})\n${JSON.stringify(h.body, null, 2)}`,
              },
            ],
          };
        } catch (err: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `Error checking health: ${err?.message || String(err)}` }],
          };
        }
      }

      case "ntfy_config": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(redactConfig(client.getConfig()), null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  });

  // 3. Resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "ntfy://config",
          name: "ntfy Configuration (redacted)",
          mimeType: "application/json",
          description: "Resolved ntfy client configuration with secrets redacted.",
        },
        {
          uri: "ntfy://health",
          name: "ntfy Server Health",
          mimeType: "application/json",
          description: "Health check of the configured ntfy server.",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri === "ntfy://config") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(redactConfig(client.getConfig()), null, 2),
          },
        ],
      };
    }
    if (uri === "ntfy://health") {
      const h = await client.health();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(h, null, 2),
          },
        ],
      };
    }
    throw new McpError(ErrorCode.InvalidRequest, `Unknown resource URI: ${uri}`);
  });

  // 4. Prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "ntfy_notify_event",
          description: "Template for sending a structured notification via ntfy.",
          arguments: [
            { name: "title", description: "Notification title.", required: true },
            { name: "message", description: "Notification body.", required: true },
            { name: "priority", description: "Priority (min/low/default/high/max/urgent).", required: false },
            { name: "tags", description: "Comma-separated tags.", required: false },
          ],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name === "ntfy_notify_event") {
      const title = request.params.arguments?.title || "Update";
      const message = request.params.arguments?.message || "";
      const priority = request.params.arguments?.priority || "default";
      const tags = request.params.arguments?.tags || "";
      const text =
        `Send an ntfy notification with the following parameters:\n` +
        `• title: ${title}\n` +
        `• message: ${message}\n` +
        `• priority: ${priority}\n` +
        `• tags: ${tags}\n\n` +
        `Call ntfy_send with these values (omitting empty ones).`;
      return {
        messages: [{ role: "user", content: { type: "text", text } }],
      };
    }
    throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ntfy-mcp] MCP server running on stdio.");
}

if (import.meta.main) {
  runNtfyMcpServer().catch((err) => {
    console.error("[ntfy-mcp] Fatal error:", err);
    process.exit(1);
  });
}
