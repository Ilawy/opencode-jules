import { loadNtfyConfig, type NtfyConfig } from "./ntfy-config.js";
import type {
  NtfyPublishInput,
  NtfyPublishResult,
  NtfyMessage,
  NtfyPollOptions,
  NtfyHealthResult,
  NtfyPriority,
} from "./ntfy-types.js";

function normalizeTags(tags: string[] | string | undefined): string | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.map((t) => t.trim()).filter(Boolean).join(",");
  return String(tags)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .join(",");
}

function priorityToHeader(p: NtfyPriority | string | number | undefined): string | undefined {
  if (p === undefined || p === null || p === "") return undefined;
  if (typeof p === "number") return String(p);
  const s = String(p).trim();
  if (s === "") return undefined;
  const lower = s.toLowerCase();
  const map: Record<string, string> = {
    min: "1",
    low: "2",
    default: "3",
    high: "4",
    max: "5",
    urgent: "5",
  };
  if (map[lower]) return map[lower];
  const n = Number(s);
  if (!Number.isNaN(n) && n >= 1 && n <= 5) return String(n);
  return s;
}

function buildAuthHeaders(config: NtfyConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.token) {
    headers["Authorization"] = `Bearer ${config.token}`;
  } else if (config.username || config.password) {
    const creds = `${config.username ?? ""}:${config.password ?? ""}`;
    headers["Authorization"] = `Basic ${btoa(creds)}`;
  }
  return headers;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export class NtfyClient {
  private config: NtfyConfig;

  constructor(config?: Partial<NtfyConfig>) {
    this.config = loadNtfyConfig(config);
  }

  getConfig(): NtfyConfig {
    return this.config;
  }

  updateConfig(patch: Partial<NtfyConfig>): void {
    this.config = loadNtfyConfig({ ...this.config, ...patch });
  }

  private resolveServerUrl(input?: string): string {
    return (input && input.trim() !== "" ? input.trim() : this.config.serverUrl).replace(/\/+$/, "");
  }

  private resolveTopic(input?: string): string {
    const topic = input && input.trim() !== "" ? input.trim() : this.config.topic;
    if (!topic) {
      throw new Error(
        "ntfy topic is required. Provide `topic` in the request or set NTFY_TOPIC / default topic in config."
      );
    }
    return topic;
  }

  async publish(input: NtfyPublishInput): Promise<NtfyPublishResult> {
    const serverUrl = this.resolveServerUrl(input.serverUrl);
    const topic = this.resolveTopic(input.topic);
    const url = joinUrl(serverUrl, `/${encodeURIComponent(topic)}`);

    const headers: Record<string, string> = {
      ...buildAuthHeaders(this.config),
      ...(this.config.extraHeaders ?? {}),
      ...(input.headers ?? {}),
    };

    // Title
    const title = input.title ?? this.config.defaultTitle;
    if (title) headers["Title"] = title;

    // Priority
    const priority = priorityToHeader(input.priority ?? this.config.defaultPriority);
    if (priority) headers["Priority"] = priority;

    // Tags
    const tags = normalizeTags(input.tags ?? this.config.defaultTags);
    if (tags) headers["Tags"] = tags;

    // Click
    const click = input.click ?? this.config.defaultClick;
    if (click) headers["Click"] = click;

    // Icon
    const icon = input.icon ?? this.config.defaultIcon;
    if (icon) headers["Icon"] = icon;

    // Attach
    if (input.attach) headers["Attach"] = input.attach;
    if (input.filename) headers["Filename"] = input.filename;

    // Email
    const email = input.email ?? this.config.defaultEmail;
    if (email) headers["X-Email"] = email;

    // Delay
    const delay = input.delay ?? this.config.defaultDelay;
    if (delay) headers["Delay"] = delay;

    // Markdown
    const markdown = input.markdown ?? this.config.markdown;
    if (markdown) headers["Markdown"] = "yes";

    // Actions
    const actions = input.actions;
    if (actions) {
      if (typeof actions === "string") {
        headers["Actions"] = actions;
      } else {
        headers["Actions"] = JSON.stringify(actions);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: input.message,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let parsed: any = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }

    const result: NtfyPublishResult = {
      status: response.status,
      ok: response.ok,
      raw: text,
    };

    if (parsed && typeof parsed === "object") {
      result.id = parsed.id;
      result.time = parsed.time;
      result.expires = parsed.expires;
      result.event = parsed.event;
      result.topic = parsed.topic;
      result.message = parsed.message;
      result.title = parsed.title;
      result.priority = parsed.priority;
      result.tags = parsed.tags;
    }

    if (!response.ok) {
      throw new Error(
        `ntfy publish failed (${response.status} ${response.statusText}): ${text || "<empty>"}`
      );
    }

    return result;
  }

  async poll(options: NtfyPollOptions = {}): Promise<NtfyMessage[]> {
    const serverUrl = this.resolveServerUrl(options.serverUrl);
    const topic = this.resolveTopic(options.topic);

    const params = new URLSearchParams();
    if (options.poll !== false) params.set("poll", "1");
    if (options.since !== undefined) params.set("since", String(options.since));
    if (options.scheduled) params.set("scheduled", "1");
    if (options.limit) params.set("limit", String(options.limit));

    const url = `${joinUrl(serverUrl, `/${encodeURIComponent(topic)}/json`)}?${params.toString()}`;

    const headers: Record<string, string> = {
      ...buildAuthHeaders(this.config),
      ...(this.config.extraHeaders ?? {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ntfy poll failed (${response.status} ${response.statusText}): ${text || "<empty>"}`);
    }

    const text = await response.text();
    const messages: NtfyMessage[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj && typeof obj === "object") messages.push(obj as NtfyMessage);
      } catch {
        // ignore non-JSON lines
      }
    }
    return messages;
  }

  async health(serverUrl?: string): Promise<NtfyHealthResult> {
    const base = this.resolveServerUrl(serverUrl);
    const url = joinUrl(base, "/v1/health");
    const headers: Record<string, string> = {
      ...buildAuthHeaders(this.config),
      ...(this.config.extraHeaders ?? {}),
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    let body: unknown = undefined;
    const text = await response.text();
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    return { healthy: response.ok, status: response.status, body };
  }
}

export function createNtfyClient(config?: Partial<NtfyConfig>): NtfyClient {
  return new NtfyClient(config);
}
