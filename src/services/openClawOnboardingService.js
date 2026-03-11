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

    return {
      schemaVersion: "elo-open-world.onboarder.v1",
      generatedAt: Date.now(),
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
        curl: this.#statusCurl({ agent, safeWorldUrl })
      },
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
}
