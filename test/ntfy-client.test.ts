import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { NtfyClient } from "../src/ntfy-client.js";

describe("ntfy client", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("publishes with headers and parses response", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    globalThis.fetch = (async (url: any, init: any) => {
      captured = { url: String(url), init };
      return new Response(
        JSON.stringify({ id: "msg1", time: 123, event: "message", topic: "alerts", priority: 4, tags: ["a"] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const client = new NtfyClient({ serverUrl: "https://ntfy.sh", topic: "alerts", token: "tok" });
    const res = await client.publish({
      message: "hello",
      title: "T",
      priority: "high",
      tags: ["a", "b"],
      markdown: true,
    });

    expect(res.ok).toBe(true);
    expect(res.id).toBe("msg1");
    expect(captured).toBeDefined();
    expect(captured!.url).toBe("https://ntfy.sh/alerts");
    const h = captured!.init.headers as Record<string, string>;
    expect(h["Authorization"]).toBe("Bearer tok");
    expect(h["Title"]).toBe("T");
    expect(h["Priority"]).toBe("4");
    expect(h["Tags"]).toBe("a,b");
    expect(h["Markdown"]).toBe("yes");
    expect(captured!.init.body).toBe("hello");
  });

  it("throws on non-ok response", async () => {
    globalThis.fetch = (async () =>
      new Response("bad", { status: 400, statusText: "Bad Request" })) as any;
    const client = new NtfyClient({ serverUrl: "https://ntfy.sh", topic: "alerts" });
    let err: any;
    try {
      await client.publish({ message: "x" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(String(err.message)).toContain("400");
  });

  it("requires topic", async () => {
    const client = new NtfyClient({ serverUrl: "https://ntfy.sh" });
    let err: any;
    try {
      await client.publish({ message: "x" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(String(err.message)).toContain("topic is required");
  });

  it("polls messages", async () => {
    globalThis.fetch = (async (url: any) => {
      const body = [
        JSON.stringify({ id: "1", time: 1, event: "message", topic: "alerts", message: "hi" }),
        JSON.stringify({ id: "2", time: 2, event: "message", topic: "alerts", message: "yo" }),
      ].join("\n");
      return new Response(body, { status: 200 });
    }) as any;
    const client = new NtfyClient({ serverUrl: "https://ntfy.sh", topic: "alerts" });
    const msgs = await client.poll({ since: "all" });
    expect(msgs.length).toBe(2);
    expect(msgs[0]!.message).toBe("hi");
  });

  it("health check", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ healthy: true }), { status: 200 })) as any;
    const client = new NtfyClient({ serverUrl: "https://ntfy.sh" });
    const h = await client.health();
    expect(h.healthy).toBe(true);
    expect(h.status).toBe(200);
  });

  it("basic auth header", async () => {
    let captured: any;
    globalThis.fetch = (async (_u: any, init: any) => {
      captured = init;
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }) as any;
    const client = new NtfyClient({
      serverUrl: "https://ntfy.sh",
      topic: "t",
      username: "u",
      password: "p",
    });
    await client.publish({ message: "m" });
    const h = captured.headers as Record<string, string>;
    expect(h["Authorization"]).toBe(`Basic ${btoa("u:p")}`);
  });
});
