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

  generateInstallPlan({
    humanId,
    agentId,
    worldUrl = "",
    target = "local",
    platform = "unknown",
    packageMode = "node",
    installRoot = "~/elo-open-world",
    machineLabel = ""
  }) {
    const bundle = this.generateBundle({ humanId, agentId, worldUrl, machineLabel });
    const safeTarget = token("target", target || "local", 32).toLowerCase();
    const safePlatform = token("platform", platform || "unknown", 32).toLowerCase();
    const safePackageMode = token("packageMode", packageMode || "node", 32).toLowerCase();
    const safeInstallRoot = text("installRoot", installRoot || "~/elo-open-world", 512);

    const steps = [
      {
        id: "diagnose-environment",
        title: "Diagnose local environment",
        action: "run-diagnostics",
        rationale: "Confirm the local runtime endpoint and the selected EOW universe are reachable."
      },
      {
        id: "prepare-install-root",
        title: "Prepare install root",
        action: "prepare-directory",
        command: `mkdir -p ${safeInstallRoot}`,
        rationale: "Create a stable workspace for the user-owned runtime and onboarding files."
      },
      {
        id: "generate-setup-pack",
        title: "Generate onboarding setup pack",
        action: "consume-setup-pack",
        rationale: "Use the EOW-provided setup pack as the canonical onboarding payload."
      }
    ];

    if (safePackageMode === "docker") {
      steps.push({
        id: "install-runtime",
        title: "Install runtime via Docker",
        action: "docker-runtime",
        command: "docker pull ghcr.io/example/openclaw:latest",
        rationale: "Container mode is the safest repeatable option for server-style installs."
      });
    } else {
      steps.push({
        id: "install-runtime",
        title: "Install runtime dependencies",
        action: "node-runtime",
        command: safePlatform === "macos" ? "brew install node" : "install node using your system package manager",
        rationale: "Node mode keeps the bootstrap path simple for desktop users."
      });
    }

    steps.push(
      {
        id: "start-runtime",
        title: "Start local runtime",
        action: "start-runtime",
        rationale: "Bring the user-owned agent runtime online before reporting status."
      },
      {
        id: "report-status",
        title: "Report status to EOW",
        action: "report-status",
        command: bundle.world.agentStatusUrl,
        rationale: "Make the local agent visible in EOW after the runtime is up."
      }
    );

    return {
      contract: "elo-agent-onboarder.install-plan.v1",
      generatedAt: Date.now(),
      identity: bundle.identity,
      runtime: bundle.runtime,
      target: {
        target: safeTarget,
        platform: safePlatform,
        packageMode: safePackageMode,
        installRoot: safeInstallRoot
      },
      world: bundle.world,
      setupPackContract: bundle.contract,
      steps
    };
  }

  generateBootstrapReport(input) {
    const plan = this.generateInstallPlan(input);
    const bundle = this.generateBundle(input);
    const runtimeHealthUrl = `${String(bundle.runtime.endpoint || "").replace(/\/$/, "")}/health`;
    return {
      contract: "elo-agent-onboarder.bootstrap-report.v1",
      generatedAt: Date.now(),
      identity: bundle.identity,
      runtime: bundle.runtime,
      world: bundle.world,
      plan,
      setupPack: bundle.setupPack,
      diagnostics: {
        checks: [
          {
            name: "runtime-health",
            url: runtimeHealthUrl || "not-configured",
            expected: "200 OK"
          },
          {
            name: "universe-manifest",
            url: `${bundle.world.apiBaseUrl}/api/universe/manifest`,
            expected: "200 OK"
          }
        ]
      }
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
