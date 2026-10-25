# OpenCode Jules Delegation: User & Integration Guide

This guide walks you through setting up and using the **Jules Delegation Integration** in OpenCode. With this setup, OpenCode can offload heavy, time-consuming coding tasks (such as large refactors, full test suites, or framework upgrades) to Google Jules while strictly protecting your daily quota.

---

## 1. Prerequisites

1. **Google Jules Account & API Key**:
   * Navigate to [jules.google.com/settings](https://jules.google.com/settings).
   * Connect your GitHub account and grant repository access to the repositories you want Jules to work on.
   * Generate an API Key under the API section.
2. **OpenCode**: OpenCode v2 installed.
3. **Runtime**: Bun 1.1+ (or Node 18+) installed.

---

## 2. Quick Setup

### Step 1: Clone or Copy this Package
Clone this repository into your project or your global OpenCode directory:
```bash
git clone https://github.com/your-username/jules-oc.git
cd jules-oc
bun install
```

### Step 2: Configure Environment Variables
Set your API key and subscription tier in your shell profile (`~/.bashrc`, `~/.zshrc`) or `.env`:
```bash
export JULES_API_KEY="your_jules_api_key_here"

# Subscription tier: 'base' (15/day), 'pro' (100/day), or 'ultra' (300/day)
export JULES_TIER="base"
```

Verify your setup using the CLI:
```bash
bun run bin/cli.ts quota
```
Output:
```text
📊 Jules Quota Status (Rolling 24h Window):
• Subscription Tier:     BASE
• Daily Request Limit:   15
• Current Usage:         0 requests (0%)
• 75% Guardrail Ceiling: 11 requests
• Remaining Under 75%:   11 requests
• Delegation Allowed:    ✅ YES
```

---

## 3. Integration Options in OpenCode

You can use this integration either as a **Native OpenCode Plugin** or as a **Model Context Protocol (MCP) Server**.

### Option A: Native OpenCode Plugin (Recommended)

OpenCode automatically loads plugins placed in `.opencode/plugins/` (project-level) or `~/.config/opencode/plugins/` (global).

#### Project-Level Setup:
Copy `.opencode/plugins/jules.ts` into your project's `.opencode/plugins/` folder:
```bash
mkdir -p .opencode/plugins
cp path/to/jules-oc/.opencode/plugins/jules.ts .opencode/plugins/
```

Or reference it in your `opencode.json`:
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "./.opencode/plugins/jules.ts"
  ]
}
```

The plugin automatically:
* Injects the **Jules Delegation Protocol** into OpenCode's LLM system prompt.
* Registers the custom tools (`jules_delegate`, `jules_check_session`, `jules_get_quota`, `jules_list_sessions`, `jules_list_sources`).
* Enables the `/jules <prompt>` slash command.

---

### Option B: Model Context Protocol (MCP) Server

If you prefer using MCP, add the server to your `opencode.json` (or `~/.config/opencode/opencode.json`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "jules": {
        "type": "local",
        "command": ["bun", "run", "/absolute/path/to/jules-oc/src/mcp-server.ts"],
        "cwd": ".",
        "environment": {
          "JULES_API_KEY": "{env:JULES_API_KEY}",
          "JULES_TIER": "base"
        },
        "enabled": true
      }
    }
  }
}
```

---

## 4. How Delegation Works

### A. Direct User Request
You can explicitly tell OpenCode to offload work to Jules at any time:

**In OpenCode Chat:**
```text
> Please delegate this to Jules: Migrate our database models from Sequelize to Prisma, update all repositories, and add migration scripts.
```

**Using the Slash Command:**
```text
> /jules Add comprehensive unit tests for all services in the auth/ directory with 90%+ branch coverage.
```

OpenCode will call `jules_delegate`, resolve your Git branch and repository source, verify the 75% quota limit, and return the live session dashboard link:
```text
🚀 Task successfully delegated to Jules!
• Session: sessions/7829104
• State: QUEUED
• Source: sources/github-owner-myrepo (Branch: main)
• Dashboard: https://jules.google.com/session/7829104
• Daily Quota: 1/15 used (10 remaining before 75% limit).
```

---

### B. Autonomous LLM Choice
When working inside OpenCode, the LLM continuously evaluates task complexity and duration.

#### Tasks OpenCode Autonomously Delegates:
* **Large Refactors**: Restructuring multi-file architecture, updating deprecations across 5+ files.
* **Test Suite Expansion**: Writing end-to-end, integration, or comprehensive unit test suites.
* **Framework / Dependency Migrations**: React 18 $\rightarrow$ 19, Webpack $\rightarrow$ Vite, Python version overhauls.
* **Repository-Wide Audits & Documentation**: Writing complete docstrings or types across the codebase.

#### Tasks OpenCode Executes Locally (Will NOT Delegate):
* **Quick Edits**: Typos, single-function changes, bug fixes affecting 1-2 files.
* **Interactive Dialogue**: Code explanations, architectural consultations, brainstorming.
* **Uncommitted Changes**: When your working tree has uncommitted local edits that haven't been pushed to the remote branch.
* **Quota Exhaustion**: Whenever 75% of your daily Jules quota has been reached.

---

## 5. The 75% Quota Guardrail

To prevent automated agents from exhausting your daily Jules quota, a strict **75% ceiling** is enforced across a rolling 24-hour window.

### Quota Thresholds:
* **Base Tier** (15 tasks/day): Max **11 tasks** allowed for delegation.
* **Pro Tier** (100 tasks/day): Max **75 tasks** allowed for delegation.
* **Ultra Tier** (300 tasks/day): Max **225 tasks** allowed for delegation.

### What happens when 75% is reached?
1. New delegations are immediately **blocked**.
2. OpenCode notifies you:
   ```text
   ⚠️ Jules delegation quota ceiling reached: 11/15 daily requests used (73.3%).
   New delegations are blocked once usage reaches 75% (11 requests) to reserve
   remaining capacity for critical/manual operations.
   Next quota slot releases in ~45 minute(s).
   Falling back to local execution in OpenCode.
   ```
3. OpenCode continues executing your task **locally** without interruption.

---

## 6. Inspecting Status & Sessions

### Check Current Quota
* **In OpenCode**:
  ```text
  > What is our current Jules quota?
  ```
  *(Calls `jules_get_quota`)*
* **In Terminal**:
  ```bash
  bun run quota
  ```

### Inspect a Running Session
* **In OpenCode**:
  ```text
  > Check session 7829104
  ```
  *(Calls `jules_check_session`)*
* **In Terminal**:
  ```bash
  bun run bin/cli.ts status 7829104
  ```

### List Connected Repositories
```bash
bun run bin/cli.ts sources
```

---

## 7. Configuration Reference

All settings can be specified via environment variables or in `opencode.json`:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `JULES_API_KEY` | `string` | *(Required)* | Google Jules API key from jules.google.com/settings |
| `JULES_TIER` | `string` | `"base"` | Subscription tier: `base`, `pro`, `ultra`, `custom` |
| `JULES_DAILY_QUOTA_LIMIT`| `number` | *(From tier)* | Explicit task limit override per 24 hours |
| `JULES_QUOTA_FILE` | `string` | `~/.config/opencode/jules_quota.json` | Path to persistent rolling quota ledger |
| `JULES_REQUIRE_PLAN_APPROVAL` | `boolean` | `false` | Pause Jules for plan approval before coding |
| `JULES_AUTOMATION_MODE` | `string` | `"AUTO_CREATE_PR"` | Auto-create GitHub PR on completion |

---

## 8. Troubleshooting

### Issue: "Missing Jules API Key"
* **Solution**: Ensure `JULES_API_KEY` is exported in your environment or configured in `opencode.json`.

### Issue: "Could not determine GitHub repository owner/repo"
* **Solution**: Jules requires a Git repository with an `origin` remote pointing to GitHub (e.g. `https://github.com/owner/repo.git`). Run `git remote -v` to verify.

### Issue: "Delegation blocked by 75% quota guardrail"
* **Solution**: You have reached the 75% threshold in your rolling 24-hour window. Wait for earlier requests to age past 24 hours, or upgrade your tier via `JULES_TIER=pro`.
