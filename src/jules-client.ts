import type { JulesConfig } from "./config.js";
import type {
  JulesActivity,
  JulesCreateSessionRequest,
  JulesSession,
  JulesSource,
  ListActivitiesResponse,
  ListSessionsResponse,
  ListSourcesResponse,
} from "./types.js";

export class JulesClient {
  private config: JulesConfig;

  constructor(config: JulesConfig) {
    this.config = config;
  }

  private get headers(): Record<string, string> {
    if (!this.config.apiKey) {
      throw new Error(
        "Missing Jules API Key. Set JULES_API_KEY environment variable or configure it in opencode.json."
      );
    }
    return {
      "x-goog-api-key": this.config.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...(options.headers as Record<string, string>),
      },
    });

    if (!res.ok) {
      let errorDetails = "";
      try {
        const errorJson = (await res.json()) as { error?: { message?: string; status?: string } };
        errorDetails = errorJson.error?.message || JSON.stringify(errorJson);
      } catch {
        errorDetails = await res.text();
      }

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Jules API Authentication error (${res.status}): Please check your JULES_API_KEY. Details: ${errorDetails}`
        );
      }
      if (res.status === 429) {
        throw new Error(
          `Jules API Rate limit / Quota exceeded (${res.status}): Google Jules cloud quota reached. Details: ${errorDetails}`
        );
      }
      if (res.status === 404) {
        throw new Error(`Jules resource not found (${res.status}): ${url}. Details: ${errorDetails}`);
      }

      throw new Error(`Jules API error (${res.status} ${res.statusText}): ${errorDetails}`);
    }

    return (await res.json()) as T;
  }

  /**
   * List connected GitHub sources in Jules
   */
  public async listSources(): Promise<JulesSource[]> {
    const data = await this.request<ListSourcesResponse>("/sources");
    return data.sources || [];
  }

  /**
   * Find source matching GitHub owner & repo
   */
  public async findSource(owner: string, repo: string): Promise<JulesSource | null> {
    const sources = await this.listSources();
    const targetOwner = owner.toLowerCase();
    const targetRepo = repo.toLowerCase();

    for (const src of sources) {
      if (src.githubRepo) {
        if (
          src.githubRepo.owner.toLowerCase() === targetOwner &&
          src.githubRepo.repo.toLowerCase() === targetRepo
        ) {
          return src;
        }
      }
      // Also match by resource ID or name (e.g. sources/github-owner-repo)
      if (
        src.name.toLowerCase().includes(`${targetOwner}-${targetRepo}`) ||
        src.id.toLowerCase().includes(`${targetOwner}-${targetRepo}`)
      ) {
        return src;
      }
    }
    return null;
  }

  /**
   * Create a new task session in Jules
   */
  public async createSession(request: JulesCreateSessionRequest): Promise<JulesSession> {
    return await this.request<JulesSession>("/sessions", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  /**
   * Get session details by ID or path
   */
  public async getSession(sessionIdOrName: string): Promise<JulesSession> {
    const sessionPath = sessionIdOrName.startsWith("sessions/")
      ? sessionIdOrName
      : `sessions/${sessionIdOrName}`;
    return await this.request<JulesSession>(`/${sessionPath}`);
  }

  /**
   * List sessions with optional pagination
   */
  public async listSessions(pageSize = 20, pageToken?: string): Promise<ListSessionsResponse> {
    const params = new URLSearchParams();
    if (pageSize) params.set("pageSize", pageSize.toString());
    if (pageToken) params.set("pageToken", pageToken);

    const query = params.toString() ? `?${params.toString()}` : "";
    return await this.request<ListSessionsResponse>(`/sessions${query}`);
  }

  /**
   * List activities for a session
   */
  public async listActivities(
    sessionIdOrName: string,
    pageSize = 30,
    pageToken?: string
  ): Promise<JulesActivity[]> {
    const sessionPath = sessionIdOrName.startsWith("sessions/")
      ? sessionIdOrName
      : `sessions/${sessionIdOrName}`;
    const params = new URLSearchParams();
    if (pageSize) params.set("pageSize", pageSize.toString());
    if (pageToken) params.set("pageToken", pageToken);

    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await this.request<ListActivitiesResponse>(`/${sessionPath}/activities${query}`);
    return res.activities || [];
  }
}
