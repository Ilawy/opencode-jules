import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { loadNtfyConfig, redactConfig } from "../src/ntfy-config.js";

describe("ntfy config", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = [
    "NTFY_SERVER_URL",
    "NTFY_TOPIC",
    "NTFY_TOKEN",
    "NTFY_USERNAME",
    "NTFY_PASSWORD",
    "NTFY_TITLE",
    "NTFY_PRIORITY",
    "NTFY_TAGS",
    "NTFY_CLICK",
    "NTFY_ICON",
    "NTFY_EMAIL",
    "NTFY_DELAY",
    "NTFY_MARKDOWN",
    "NTFY_TIMEOUT_MS",
  ];

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("uses defaults when no env/overrides", () => {
    const c = loadNtfyConfig();
    expect(c.serverUrl).toBe("https://ntfy.sh");
    expect(c.timeoutMs).toBe(15000);
    expect(c.topic).toBeUndefined();
  });

  it("reads env vars", () => {
    process.env.NTFY_SERVER_URL = "https://ntfy.example.com/";
    process.env.NTFY_TOPIC = "alerts";
    process.env.NTFY_TOKEN = "secret";
    process.env.NTFY_PRIORITY = "high";
    process.env.NTFY_TAGS = "warning,deploy";
    process.env.NTFY_MARKDOWN = "true";
    process.env.NTFY_TIMEOUT_MS = "5000";
    const c = loadNtfyConfig();
    expect(c.serverUrl).toBe("https://ntfy.example.com");
    expect(c.topic).toBe("alerts");
    expect(c.token).toBe("secret");
    expect(c.defaultPriority).toBe("high");
    expect(c.defaultTags).toEqual(["warning", "deploy"]);
    expect(c.markdown).toBe(true);
    expect(c.timeoutMs).toBe(5000);
  });

  it("overrides take precedence", () => {
    process.env.NTFY_TOPIC = "env-topic";
    const c = loadNtfyConfig({ topic: "override-topic", serverUrl: "https://x.test" });
    expect(c.topic).toBe("override-topic");
    expect(c.serverUrl).toBe("https://x.test");
  });

  it("redacts secrets", () => {
    const c = loadNtfyConfig({ token: "abc", password: "pw" });
    const r = redactConfig(c) as any;
    expect(r.hasToken).toBe(true);
    expect(r.hasPassword).toBe(true);
    expect(JSON.stringify(r)).not.toContain("abc");
    expect(JSON.stringify(r)).not.toContain("pw");
  });
});
