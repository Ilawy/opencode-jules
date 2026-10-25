# OpenCode Google Jules Delegation Integration (`jules-oc`)

[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()
[![OpenCode v2](https://img.shields.io/badge/OpenCode-v2_Ready-blue.svg)](https://opencode.ai/v2/docs/plugins/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io)
[![Google Jules](https://img.shields.io/badge/Google-Jules_API_v1alpha-red.svg)](https://jules.google/docs/api/reference/)

> An **OpenCode Plugin** and **Model Context Protocol (MCP)** server that enables OpenCode agents to delegate heavy, long-running, and computationally intensive tasks to **Google Jules** — while enforcing a strict **75% daily quota guardrail**.

---

## Highlights

* 🤖 **Dual Triggering**:
  * **Direct User Request**: Explicitly offload tasks via chat prompt or `/jules <prompt>` slash command.
  * **Autonomous LLM Choice**: OpenCode automatically identifies complex, multi-file refactoring, migration, or test suite tasks and delegates them to Jules.
* 🛡️ **75% Quota Guardrail**:
  * Tracks tasks in a **rolling 24-hour window**.
  * Automatically blocks delegation as soon as usage reaches **75%** of your daily Jules plan quota (11/15 on Base, 75/100 on Pro, 225/300 on Ultra).
  * Preserves the remaining $\ge 25\%$ quota strictly for critical/manual interactive work, automatically falling back to OpenCode local execution.
* ⚡ **Dual Integration Modes**:
  * **Native OpenCode Plugin**: Drop-in `.opencode/plugins/jules.ts` with custom tool definitions and system prompt augmentation.
  * **Standalone MCP Server**: Compatible with any Model Context Protocol host (`opencode.json`, Claude Desktop, Cursor).
* 🔄 **Automatic Git Context**: Auto-resolves GitHub owner, repo, and active branch from local `origin` remote to map into Jules sources.

---

## Documentation

* 📘 [**User & Setup Guide**](docs/GUIDE.md): Complete installation, configuration, and practical usage instructions.
* 📐 [**System Specification**](docs/SPECIFICATION.md): Deep-dive into architecture, Jules REST API contracts, quota mathematics, and decision algorithms.

---

## Quickstart

### 1. Install Dependencies
```bash
bun install
```

### 2. Configure Environment
```bash
cp .env.example .env
export JULES_API_KEY="your-jules-api-key"
export JULES_TIER="base" # base (15/day), pro (100/day), or ultra (300/day)
```

### 3. Check Quota via CLI
```bash
bun run quota
```

### 4. Enable in OpenCode

**Option A (Plugin)**: Copy `.opencode/plugins/jules.ts` into your project's `.opencode/plugins/` directory.

**Option B (MCP)**: Add the server to your `opencode.json`:
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "jules": {
        "type": "local",
        "command": ["bun", "run", "/path/to/jules-oc/src/mcp-server.ts"],
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

## Testing

Run unit tests covering the rolling quota manager, boundary checks, 75% cutoff enforcement, and decision engine heuristics:

```bash
bun test
```

---

## License

Apache-2.0
