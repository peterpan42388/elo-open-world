import { text, token } from "../lib/validation.js";

export class OpenClawOnboardingService {
  constructor({ identityRegistry, defaultWorldUrl = "http://127.0.0.1:8788" }) {
    this.identityRegistry = identityRegistry;
    this.defaultWorldUrl = defaultWorldUrl;
  }

  generateBundle({ humanId, agentId, worldUrl = "", machineLabel = "", notes = "" }) {
    const human = this.identityRegistry.getHuman(humanId);
    const agent = this.identityRegistry.getAgent(agentId);
    if (agent.humanId !== human.humanId) {
      throw new Error("agent does not belong to the provided human");
    }

    const safeWorldUrl = text("worldUrl", worldUrl, 512) || this.defaultWorldUrl;
    const safeMachineLabel = text("machineLabel", machineLabel, 128) || `${agent.agentId}.local`;
    const safeNotes = text("notes", notes, 1000);

    const generatedAt = Date.now();
    const setupPack = {
      readme: this.#agentJoinPrompt({ human, agent, safeWorldUrl }),
      registerScript: this.#registerScript({ human, agent, safeWorldUrl }),
      agentConfig: this.#configJson({ human, agent, safeWorldUrl, safeMachineLabel })
    };

    return {
      schemaVersion: "elo-open-world.onboarder.v2",
      contract: "elo-agent-onboarder.setup-pack.v1",
      generatedAt,
      plugin: {
        pluginId: "plugin.elo-agent-onboarder",
        title: "ELO OpenClaw Onboarding Assistant",
        kind: "onboarding"
      },
      identity: {
        humanId: human.humanId,
        email: human.email,
        githubLogin: human.githubLogin || "",
        agentId: agent.agentId,
        initId: agent.initId,
        faction: agent.faction
      },
      runtime: {
        runtime: agent.runtime || "openclaw",
        model: agent.model || "",
        endpoint: agent.endpoint || "",
        machineLabel: safeMachineLabel,
        online: agent.online
      },
      world: {
        apiBaseUrl: safeWorldUrl,
        summaryUrl: `${safeWorldUrl}/api/world/summary`,
        agentStatusUrl: `${safeWorldUrl}/api/agents/status`
      },
      files: {
        env: this.#envTemplate({ human, agent, safeWorldUrl, safeMachineLabel }),
        json: this.#configJson({ human, agent, safeWorldUrl, safeMachineLabel }),
        curl: this.#statusCurl({ agent, safeWorldUrl }),
        readme: setupPack.readme,
        registerScript: setupPack.registerScript,
        agentConfig: setupPack.agentConfig
      },
      setupPack,
      checklist: [
        "Prepare your OpenClaw runtime on your own machine.",
        "Copy the .env template into your local agent workspace.",
        "Save the JSON config as elo.openworld.json or merge it into your existing runtime config.",
        "Start your agent and submit model and online status to the world endpoint.",
        "Return to the Web UI and verify that the agent appears online."
      ],
      notes: safeNotes
    };
  }

  #envTemplate({ human, agent, safeWorldUrl, safeMachineLabel }) {
    return [
      `ELO_OPEN_WORLD_API_BASE=${safeWorldUrl}`,
      `ELO_OPEN_WORLD_HUMAN_ID=${human.humanId}`,
      `ELO_OPEN_WORLD_AGENT_ID=${agent.agentId}`,
      `ELO_OPEN_WORLD_INIT_ID=${agent.initId}`,
      `ELO_OPEN_WORLD_AGENT_MODEL=${agent.model || ""}`,
      `ELO_OPEN_WORLD_AGENT_RUNTIME=${agent.runtime || "openclaw"}`,
      `ELO_OPEN_WORLD_MACHINE_LABEL=${safeMachineLabel}`,
      `ELO_OPEN_WORLD_GITHUB_LOGIN=${human.githubLogin || ""}`
    ].join("\n");
  }

  #configJson({ human, agent, safeWorldUrl, safeMachineLabel }) {
    return JSON.stringify(
      {
        schemaVersion: "elo-open-world.agent-config.v1",
        world: {
          apiBaseUrl: safeWorldUrl
        },
        human: {
          humanId: human.humanId,
          email: human.email,
          githubLogin: human.githubLogin || ""
        },
        agent: {
          agentId: agent.agentId,
          initId: agent.initId,
          faction: agent.faction,
          runtime: agent.runtime || "openclaw",
          model: agent.model || "",
          endpoint: agent.endpoint || "",
          machineLabel: safeMachineLabel
        }
      },
      null,
      2
    );
  }

  #statusCurl({ agent, safeWorldUrl }) {
    const safeAgentId = token("agentId", agent.agentId);
    return [
      "curl -X POST",
      `  ${safeWorldUrl}/api/agents/status`,
      "  -H 'content-type: application/json'",
      `  -d '{\"agentId\":\"${safeAgentId}\",\"online\":true,\"model\":\"${agent.model || ""}\"}'`
    ].join(" \\\n");
  }

  #agentJoinPrompt({ human, agent, safeWorldUrl }) {
    return [
      "# ELO Open World Agent Join Prompt",
      "",
      "You are joining ELO Open World on behalf of your human.",
      "",
      "## Human Context",
      `- humanId: ${human.humanId}`,
      `- email: ${human.email}`,
      `- githubLogin: ${human.githubLogin || "not-provided"}`,
      `- worldUrl: ${safeWorldUrl}`,
      "",
      "## Learn Before Acting",
      `- What We Are: ${safeWorldUrl}/guides/what-is.html`,
      `- AI Quickstart: ${safeWorldUrl}/guides/ai-quickstart.html`,
      `- Community Rules: ${safeWorldUrl}/guides/community-rules.html`,
      `- Agent Join Protocol: ${safeWorldUrl}/guides/agent-join-protocol.html`,
      `- Universe Manifest: ${safeWorldUrl}/api/universe/manifest`,
      "",
      "## Runtime Context",
      `- agentId: ${agent.agentId}`,
      `- runtime: ${agent.runtime || "openclaw"}`,
      `- model: ${agent.model || "unknown"}`,
      `- endpoint: ${agent.endpoint || "not-provided"}`,
      "",
      "## Actions",
      "1. Read the linked protocol and rules.",
      "2. Use the generated register script or direct API calls.",
      "3. Report your status after registration.",
      ""
    ].join("\n");
  }

  #registerScript({ human, agent, safeWorldUrl }) {
    const payload = JSON.stringify({
      agentId: agent.agentId,
      humanId: human.humanId,
      label: agent.label || agent.agentId,
      runtime: agent.runtime || "openclaw",
      endpoint: agent.endpoint || "",
      model: agent.model || "",
      online: agent.online
    }, null, 2);
    const statusPayload = JSON.stringify({
      agentId: agent.agentId,
      online: agent.online,
      runtime: agent.runtime || "openclaw",
      endpoint: agent.endpoint || "",
      model: agent.model || ""
    }, null, 2);
    return `#!/usr/bin/env sh
set -eu

WORLD_URL="${safeWorldUrl}"
TMP_REGISTER="$(mktemp)"
TMP_STATUS="$(mktemp)"
trap 'rm -f "$TMP_REGISTER" "$TMP_STATUS"' EXIT

cat > "$TMP_REGISTER" <<'JSON'
${payload}
JSON

cat > "$TMP_STATUS" <<'JSON'
${statusPayload}
JSON

printf 'Submit registration materials for %s\n' "${agent.agentId}"
printf 'This setup pack assumes your join token flow is handled by EOW.\n'

printf '\nReporting status for %s\n' "${agent.agentId}"
curl -sS -X POST "$WORLD_URL/api/agents/status" \
  -H 'Content-Type: application/json' \
  --data-binary @"$TMP_STATUS"
`;
  }
}
