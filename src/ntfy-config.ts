import type { NtfyConfig, NtfyPriority } from "./ntfy-types.js";
export type { NtfyConfig, NtfyPriority };

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function parseTags(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parsePriority(raw: string | undefined): NtfyPriority | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (["min", "low", "default", "high", "max", "urgent"].includes(lower)) {
    return lower as NtfyPriority;
  }
  const n = Number(raw);
  if (!Number.isNaN(n) && n >= 1 && n <= 5) return n as NtfyPriority;
  return undefined;
}

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw.toLowerCase() === "true" || raw === "1" || raw.toLowerCase() === "yes") return true;
  if (raw.toLowerCase() === "false" || raw === "0" || raw.toLowerCase() === "no") return false;
  return undefined;
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function loadNtfyConfig(overrides?: Partial<NtfyConfig>): NtfyConfig {
  const serverUrl =
    overrides?.serverUrl ||
    env("NTFY_SERVER_URL") ||
    env("NTFY_URL") ||
    env("NTFY_BASE_URL") ||
    "https://ntfy.sh";

  const topic = overrides?.topic ?? env("NTFY_TOPIC") ?? env("NTFY_DEFAULT_TOPIC");
  const token = overrides?.token ?? env("NTFY_TOKEN") ?? env("NTFY_ACCESS_TOKEN");
  const username = overrides?.username ?? env("NTFY_USERNAME") ?? env("NTFY_USER");
  const password = overrides?.password ?? env("NTFY_PASSWORD") ?? env("NTFY_PASS");

  const defaultTitle = overrides?.defaultTitle ?? env("NTFY_TITLE") ?? env("NTFY_DEFAULT_TITLE");
  const defaultPriority =
    overrides?.defaultPriority ?? parsePriority(env("NTFY_PRIORITY") ?? env("NTFY_DEFAULT_PRIORITY"));
  const defaultTags = overrides?.defaultTags ?? parseTags(env("NTFY_TAGS") ?? env("NTFY_DEFAULT_TAGS"));
  const defaultClick = overrides?.defaultClick ?? env("NTFY_CLICK") ?? env("NTFY_DEFAULT_CLICK");
  const defaultIcon = overrides?.defaultIcon ?? env("NTFY_ICON") ?? env("NTFY_DEFAULT_ICON");
  const defaultEmail = overrides?.defaultEmail ?? env("NTFY_EMAIL") ?? env("NTFY_DEFAULT_EMAIL");
  const defaultDelay = overrides?.defaultDelay ?? env("NTFY_DELAY") ?? env("NTFY_DEFAULT_DELAY");
  const markdown =
    overrides?.markdown ?? parseBool(env("NTFY_MARKDOWN") ?? env("NTFY_DEFAULT_MARKDOWN"));
  const timeoutMs =
    overrides?.timeoutMs ??
    parseNumber(env("NTFY_TIMEOUT_MS") ?? env("NTFY_TIMEOUT")) ??
    15000;

  const extraHeaders = overrides?.extraHeaders;

  return {
    serverUrl: serverUrl.replace(/\/+$/, ""),
    topic,
    token,
    username,
    password,
    defaultTitle,
    defaultPriority,
    defaultTags,
    defaultClick,
    defaultIcon,
    defaultEmail,
    defaultDelay,
    markdown,
    timeoutMs,
    extraHeaders,
  };
}

export function redactConfig(config: NtfyConfig): Record<string, unknown> {
  return {
    serverUrl: config.serverUrl,
    topic: config.topic,
    hasToken: Boolean(config.token),
    hasUsername: Boolean(config.username),
    hasPassword: Boolean(config.password),
    defaultTitle: config.defaultTitle,
    defaultPriority: config.defaultPriority,
    defaultTags: config.defaultTags,
    defaultClick: config.defaultClick,
    defaultIcon: config.defaultIcon,
    defaultEmail: config.defaultEmail,
    defaultDelay: config.defaultDelay,
    markdown: config.markdown,
    timeoutMs: config.timeoutMs,
    extraHeaders: config.extraHeaders ? Object.keys(config.extraHeaders) : undefined,
  };
}
