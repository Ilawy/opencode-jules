import { execSync } from "node:child_process";
import type { GitRepoInfo } from "./types.js";

/**
 * Resolves current Git repository context to determine connected GitHub repo
 * and branch for Jules API sessions.
 */
export class GitContextResolver {
  private cwd: string;

  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
  }

  private exec(cmd: string): string | null {
    try {
      return execSync(cmd, {
        cwd: this.cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  }

  /**
   * Parse GitHub owner and repo from git remote URL
   * Supports:
   *  - git@github.com:owner/repo.git
   *  - https://github.com/owner/repo.git
   *  - ssh://git@github.com/owner/repo.git
   */
  public parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
    if (!remoteUrl) return null;

    const httpsRegex = /https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i;
    const sshRegex = /(?:git@|ssh:\/\/git@)github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i;

    const httpsMatch = remoteUrl.match(httpsRegex);
    if (httpsMatch && httpsMatch[1] && httpsMatch[2]) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    const sshMatch = remoteUrl.match(sshRegex);
    if (sshMatch && sshMatch[1] && sshMatch[2]) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    return null;
  }

  /**
   * Inspect local repository state
   */
  public inspect(): GitRepoInfo {
    const isGit = this.exec("git rev-parse --is-inside-work-tree") === "true";
    if (!isGit) {
      return {
        isGitRepo: false,
        hasUncommittedChanges: false,
        uncommittedFilesCount: 0,
      };
    }

    const remoteUrl = this.exec("git remote get-url origin") || undefined;
    const currentBranch =
      this.exec("git branch --show-current") ||
      this.exec("git rev-parse --abbrev-ref HEAD") ||
      "main";

    const parsedGithub = remoteUrl ? this.parseGitHubRemote(remoteUrl) : null;
    const statusOutput = this.exec("git status --porcelain") || "";
    const statusLines = statusOutput.split("\n").filter((l) => l.trim().length > 0);

    const suggestedSourceName = parsedGithub
      ? `sources/github-${parsedGithub.owner.toLowerCase()}-${parsedGithub.repo.toLowerCase()}`
      : undefined;

    return {
      isGitRepo: true,
      owner: parsedGithub?.owner,
      repo: parsedGithub?.repo,
      remoteUrl,
      currentBranch,
      hasUncommittedChanges: statusLines.length > 0,
      uncommittedFilesCount: statusLines.length,
      suggestedSourceName,
    };
  }
}
