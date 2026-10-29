import { Plugin } from "@opencode/plugin";
import { NtfyClient } from "./ntfy-client.js";

export default Plugin.define({
  id: "ntfy-notifications",
  async setup(ctx) {
    const client = new NtfyClient();

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "ntfy",
        description: "ntfy.sh notification tools",
      });

      editor.add({
        name: "send",
        description:
          "Send a notification via ntfy.sh (or a self-hosted ntfy server). Supports title, priority, tags, click URL, attachments, email, delay, markdown, and actions.",
        input: {
          type: "object",
          properties: {
            message: { type: "string", description: "Notification body (required)." },
            topic: { type: "string", description: "Target topic. Defaults to NTFY_TOPIC." },
            serverUrl: { type: "string", description: "Override ntfy server base URL." },
            title: { type: "string", description: "Notification title." },
            priority: {
              type: ["string", "number"],
              description: "Priority: 1-5 or min/low/default/high/max/urgent.",
            },
            tags: {
              type: ["string", "array"],
              description: "Comma-separated tags or array of tags.",
              items: { type: "string" },
            },
            click: { type: "string", description: "URL opened when clicked." },
            icon: { type: "string", description: "Icon URL." },
            attach: { type: "string", description: "Attachment URL." },
            filename: { type: "string", description: "Filename for attachment." },
            email: { type: "string", description: "Email to forward to." },
            delay: { type: "string", description: "Delay delivery." },
            markdown: { type: "boolean", description: "Render as Markdown." },
          },
          required: ["message"],
          additionalProperties: false,
        },
        options: { namespace: "ntfy", codemode: true },
        async execute(input) {
          const args = input as {
            message: string;
            topic?: string;
            serverUrl?: string;
            title?: string;
            priority?: string | number;
            tags?: string | string[];
            click?: string;
            icon?: string;
            attach?: string;
            filename?: string;
            email?: string;
            delay?: string;
            markdown?: boolean;
          };

          try {
            const result = await client.publish({
              message: args.message,
              topic: args.topic,
              serverUrl: args.serverUrl,
              title: args.title,
              priority: args.priority as any,
              tags: args.tags as any,
              click: args.click,
              icon: args.icon,
              attach: args.attach,
              filename: args.filename,
              email: args.email,
              delay: args.delay,
              markdown: args.markdown,
            });
            return {
              content: `✅ Notification sent (id=${result.id}, topic=${result.topic}, status=${result.status})`,
            };
          } catch (err: any) {
            return { content: `Failed to send notification: ${err?.message || String(err)}` };
          }
        },
      });

      editor.add({
        name: "health",
        description: "Check health of the configured ntfy server.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { namespace: "ntfy", codemode: true },
        async execute() {
          try {
            const h = await client.health();
            return { content: `ntfy health: ${h.healthy ? "OK" : "UNHEALTHY"} (HTTP ${h.status})` };
          } catch (err: any) {
            return { content: `Failed health check: ${err?.message || String(err)}` };
          }
        },
      });
    });

    return () => {};
  },
});
