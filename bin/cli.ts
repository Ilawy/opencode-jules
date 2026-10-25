#!/usr/bin/env bun
import { DelegationService } from "../src/delegation-service.js";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";
  const service = new DelegationService();

  switch (command) {
    case "quota": {
      const status = service.getQuotaStatus();
      console.log("\n📊 Jules Quota Status (Rolling 24h Window):");
      console.log(`• Subscription Tier:     ${status.tier.toUpperCase()}`);
      console.log(`• Daily Request Limit:   ${status.dailyLimit}`);
      console.log(`• Current Usage:         ${status.currentUsage} requests (${status.usagePercentage}%)`);
      console.log(`• 75% Guardrail Ceiling: ${status.maxAllowedUsage75} requests`);
      console.log(`• Remaining Under 75%:   ${status.remainingUnder75} requests`);
      console.log(`• Delegation Allowed:    ${status.is75Exceeded ? "❌ NO (>= 75% limit reached)" : "✅ YES"}`);
      if (status.nextResetTimestamp) {
        const mins = Math.max(0, Math.ceil((status.nextResetTimestamp - Date.now()) / (60 * 1000)));
        console.log(`• Next Quota Recovery:   in ~${mins} minute(s)`);
      }
      console.log();
      break;
    }

    case "sources": {
      console.log("\n🔍 Listing connected Jules sources...");
      try {
        const sources = await service.listSources();
        if (sources.length === 0) {
          console.log("No sources found. Connect your repositories at https://jules.google.com/settings");
        } else {
          for (const s of sources) {
            console.log(`• ${s.name} (${s.githubRepo ? `${s.githubRepo.owner}/${s.githubRepo.repo}` : s.id})`);
          }
        }
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
      }
      break;
    }

    case "sessions": {
      console.log("\n📋 Listing recent Jules sessions...");
      try {
        const sessions = await service.listSessions(10);
        if (sessions.length === 0) {
          console.log("No sessions found.");
        } else {
          for (const s of sessions) {
            console.log(`• [${s.state}] ${s.title || "Untitled"} (${s.name})`);
            if (s.url) console.log(`  URL: ${s.url}`);
          }
        }
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
      }
      break;
    }

    case "status": {
      const sessionId = args[1];
      if (!sessionId) {
        console.error("Error: Please provide a session ID (e.g. jules-oc status 1234567)");
        process.exit(1);
      }
      console.log(`\n🔎 Inspecting session ${sessionId}...`);
      try {
        const check = await service.checkSession(sessionId);
        console.log(check.summary);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
      }
      break;
    }

    case "delegate": {
      const prompt = args.slice(1).join(" ");
      if (!prompt) {
        console.error("Error: Please provide a task prompt (e.g. jules-oc delegate 'Add unit tests for utils')");
        process.exit(1);
      }
      console.log(`\n🚀 Delegating task to Jules...`);
      const res = await service.delegateTask({
        prompt,
        isExplicitUserRequest: true,
      });
      console.log(res.message);
      break;
    }

    case "evaluate": {
      const prompt = args.slice(1).join(" ");
      if (!prompt) {
        console.error("Error: Please provide a prompt to evaluate.");
        process.exit(1);
      }
      console.log(`\n🧠 Evaluating task delegation suitability...`);
      const evalRes = service.evaluateTask(prompt);
      console.log(`• Recommendation: ${evalRes.recommendation}`);
      console.log(`• Should Delegate: ${evalRes.shouldDelegate}`);
      console.log(`• Confidence: ${(evalRes.confidence * 100).toFixed(0)}%`);
      console.log(`• Reason: ${evalRes.reason}`);
      console.log(`• Factors:`, JSON.stringify(evalRes.factors, null, 2));
      break;
    }

    case "help":
    default: {
      console.log(`
Jules OpenCode CLI (jules-oc)
Usage:
  bun run bin/cli.ts <command> [args]

Commands:
  quota               Display 24h rolling quota status and 75% guardrail
  sources             List connected GitHub repositories in Jules
  sessions            List recent Jules sessions
  status <sessionId>  Inspect status & activities for a session
  evaluate "<prompt>" Test decision engine evaluation for a task
  delegate "<prompt>" Delegate task to Jules directly
  help                Show this message
      `);
      break;
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
