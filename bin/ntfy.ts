#!/usr/bin/env bun
import { NtfyClient } from "../src/ntfy-client.js";
import { loadNtfyConfig, redactConfig } from "../src/ntfy-config.js";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";
  const client = new NtfyClient();

  switch (command) {
    case "send": {
      // ntfy send "message" [--topic t] [--title x] [--priority high] [--tags a,b] ...
      const message = args.slice(1).join(" ").trim();
      // parse flags
      const opts: Record<string, string> = {};
      const positional: string[] = [];
      for (let i = 1; i < args.length; i++) {
        const a = args[i]!;
        if (a.startsWith("--")) {
          const key = a.slice(2);
          const val = args[i + 1];
          if (val && !val.startsWith("--")) {
            opts[key] = val;
            i++;
          } else {
            opts[key] = "true";
          }
        } else {
          positional.push(a);
        }
      }
      const msg = positional.join(" ").trim() || opts.message;
      if (!msg) {
        console.error("Error: message is required (e.g. ntfy send 'Hello world')");
        process.exit(1);
      }
      try {
        const result = await client.publish({
          message: msg,
          topic: opts.topic,
          title: opts.title,
          priority: opts.priority,
          tags: opts.tags,
          click: opts.click,
          icon: opts.icon,
          attach: opts.attach,
          filename: opts.filename,
          email: opts.email,
          delay: opts.delay,
          markdown: opts.markdown === "true" ? true : undefined,
        });
        console.log(`✅ Sent (id=${result.id}, topic=${result.topic}, status=${result.status})`);
      } catch (err: any) {
        console.error(`Error: ${err?.message || err}`);
        process.exit(1);
      }
      break;
    }

    case "poll": {
      const opts: Record<string, string> = {};
      for (let i = 1; i < args.length; i++) {
        const a = args[i]!;
        if (a.startsWith("--")) {
          const key = a.slice(2);
          const val = args[i + 1];
          if (val && !val.startsWith("--")) {
            opts[key] = val;
            i++;
          } else {
            opts[key] = "true";
          }
        }
      }
      try {
        const msgs = await client.poll({
          topic: opts.topic,
          since: opts.since,
          limit: opts.limit ? Number(opts.limit) : undefined,
        });
        for (const m of msgs) {
          console.log(`[${m.event}] ${m.title ? m.title + " — " : ""}${m.message ?? ""} (id=${m.id})`);
        }
        if (msgs.length === 0) console.log("No messages.");
      } catch (err: any) {
        console.error(`Error: ${err?.message || err}`);
        process.exit(1);
      }
      break;
    }

    case "health": {
      try {
        const h = await client.health();
        console.log(`ntfy health: ${h.healthy ? "OK" : "UNHEALTHY"} (HTTP ${h.status})`);
        console.log(JSON.stringify(h.body, null, 2));
      } catch (err: any) {
        console.error(`Error: ${err?.message || err}`);
        process.exit(1);
      }
      break;
    }

    case "config": {
      console.log(JSON.stringify(redactConfig(client.getConfig()), null, 2));
      break;
    }

    case "help":
    default: {
      console.log(`
ntfy CLI (ntfy)
Usage:
  bun run bin/ntfy.ts <command> [args]

Commands:
  send <message> [--topic t] [--title x] [--priority high] [--tags a,b] [--click url] [--icon url] [--attach url] [--filename f] [--email e] [--delay 30m] [--markdown]
  poll [--topic t] [--since all|id|timestamp] [--limit n]
  health
  config
  help
Environment:
  NTFY_SERVER_URL, NTFY_TOPIC, NTFY_TOKEN, NTFY_USERNAME, NTFY_PASSWORD,
  NTFY_TITLE, NTFY_PRIORITY, NTFY_TAGS, NTFY_CLICK, NTFY_ICON, NTFY_EMAIL,
  NTFY_DELAY, NTFY_MARKDOWN, NTFY_TIMEOUT_MS
      `);
      break;
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
