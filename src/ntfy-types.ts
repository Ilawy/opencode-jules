/**
 * Type definitions for the ntfy.sh notification service integration.
 */

export type NtfyPriority =
  | 1
  | 2
  | 3
  | 4
  | 5
  | "min"
  | "low"
  | "default"
  | "high"
  | "max"
  | "urgent";

export interface NtfyAction {
  action: "view" | "http" | "broadcast" | string;
  label: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  intent?: string;
  clear?: boolean;
}

export interface NtfyConfig {
  serverUrl: string;
  topic?: string;
  token?: string;
  username?: string;
  password?: string;
  defaultTitle?: string;
  defaultPriority?: NtfyPriority;
  defaultTags?: string[];
  defaultClick?: string;
  defaultIcon?: string;
  defaultEmail?: string;
  defaultDelay?: string;
  markdown?: boolean;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
}

export interface NtfyPublishInput {
  topic?: string;
  serverUrl?: string;
  message: string;
  title?: string;
  priority?: NtfyPriority | string | number;
  tags?: string[] | string;
  click?: string;
  icon?: string;
  attach?: string;
  filename?: string;
  email?: string;
  delay?: string;
  markdown?: boolean;
  actions?: NtfyAction[] | string;
  /** Raw extra headers to merge (header name -> value). */
  headers?: Record<string, string>;
  /** When true, return the raw response body as text instead of JSON. */
  raw?: boolean;
}

export interface NtfyPublishResult {
  id?: string;
  time?: number;
  expires?: number;
  event?: string;
  topic?: string;
  message?: string;
  title?: string;
  priority?: number;
  tags?: string[];
  raw?: string;
  status: number;
  ok: boolean;
}

export interface NtfyMessage {
  id: string;
  time: number;
  event: string;
  topic: string;
  message?: string;
  title?: string;
  priority?: number;
  tags?: string[];
  click?: string;
  icon?: string;
  attachment?: { name: string; type: string; size: number; expires: number; url: string };
  actions?: NtfyAction[];
}

export interface NtfyPollOptions {
  topic?: string;
  serverUrl?: string;
  since?: string | number;
  poll?: boolean;
  scheduled?: boolean;
  limit?: number;
  timeoutMs?: number;
}

export interface NtfyHealthResult {
  healthy: boolean;
  status: number;
  body?: unknown;
}
