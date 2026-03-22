import { text, token } from "../lib/validation.js";
import {
  FOUNDATION_INSTALL_PROFILES,
  buildOnboarderCatalogContract,
  buildCapabilityManifest,
  buildPackageManifest,
  buildWorkflowManifest,
  normalizeOnboarderPackageSelection
} from "./openClawPackageCatalog.js";

function shellPath(path) {
  return path.startsWith("~/") ? `\${HOME}/${path.slice(2)}` : path;
}

function systemdPath(path) {
  return path.startsWith("~/") ? `%h/${path.slice(2)}` : path;
}

function onboardingSelection(input = {}) {
  return normalizeOnboarderPackageSelection({
    packageId: input.packageId || "base-openclaw",
    profile: input.profile || "macos-homebrew",
    registrationMode: input.registrationMode || "register-to-eow",
    workflowPreset: input.workflowPreset || ""
  });
}

function buildRuntimeContract(cfg, world) {
  return JSON.stringify({
    contract: "elo-agent-onboarder.runtime-contract.v1",
    runtime: cfg.runtime,
    packageId: cfg.packageId || "base-openclaw",
    registrationMode: cfg.registrationMode || "register-to-eow",
    workflowPreset: cfg.workflowPreset || null,
    entrypoint: "bin/openclaw-runtime.js",
    configPath: "config/openclaw-runtime.json",
    healthPath: `${(cfg.endpoint || "http://127.0.0.1:18789").replace(/\/$/, "")}/health`,
    statusApi: `${world.apiBaseUrl}/api/agents/status`,
    autoRegister: (cfg.registrationMode || "register-to-eow") === "register-to-eow",
    expectedEnv: [
      "ELO_OPEN_WORLD_API_BASE",
      "ELO_OPEN_WORLD_HUMAN_ID",
      "ELO_OPEN_WORLD_AGENT_ID",
      "ELO_OPEN_WORLD_AGENT_MODEL",
      "ELO_OPEN_WORLD_AGENT_ENDPOINT",
      "OPENCLAW_INSTALL_ROOT"
    ]
  }, null, 2) + "\n";
}

function buildRuntimeConfigTemplate(cfg, world) {
  return JSON.stringify({
    contract: "elo-agent-onboarder.runtime-config.example.v1",
    runtime: cfg.runtime,
    packageId: cfg.packageId || "base-openclaw",
    registrationMode: cfg.registrationMode || "register-to-eow",
    workflowPreset: cfg.workflowPreset || null,
    worldUrl: world.apiBaseUrl,
    humanId: cfg.humanId,
    agentId: cfg.agentId,
    model: cfg.model || "",
    endpoint: cfg.endpoint || "http://127.0.0.1:18789",
    healthPath: `${(cfg.endpoint || "http://127.0.0.1:18789").replace(/\/$/, "")}/health`,
    paths: {
      installRoot: cfg.installRoot,
      configFile: "config/openclaw-runtime.json",
      runtimeEntrypoint: "bin/openclaw-runtime.js",
      dataDir: "data",
      logDir: "logs"
    },
    notes: [
      "Copy this file to config/openclaw-runtime.json and adjust runtime-specific fields.",
      "Provide a compatible OpenClaw runtime implementation before starting."
    ]
  }, null, 2) + "\n";
}

function buildRuntimeStubTemplate(cfg, world) {
  return `#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";

const port = Number(process.env.OPENCLAW_PORT || "18789");
const configPath = process.env.OPENCLAW_RUNTIME_CONFIG || "./config/openclaw-runtime.json";
let config = {};

try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch {
  config = {
    runtime: "${cfg.runtime}",
    agentId: "${cfg.agentId}",
    humanId: "${cfg.humanId}",
    packageId: "${cfg.packageId || "base-openclaw"}",
    model: "${cfg.model || ""}",
    endpoint: "${cfg.endpoint || "http://127.0.0.1:18789"}",
    worldUrl: "${world.apiBaseUrl}"
  };
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      runtime: config.runtime || "${cfg.runtime}",
      agentId: config.agentId || "${cfg.agentId}",
      model: config.model || "${cfg.model || ""}"
    }));
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    message: "OpenClaw runtime stub is running",
    runtime: config.runtime || "${cfg.runtime}",
    agentId: config.agentId || "${cfg.agentId}"
  }));
});

server.listen(port, "0.0.0.0", () => {
  console.log("OpenClaw runtime stub listening on port", port);
});
`;
}

function buildRegisterLaterScriptTemplate(cfg, world) {
  const shellRoot = shellPath(cfg.installRoot);
  const envFile = cfg.profile === "server-docker-compose" ? ".env" : (cfg.profile === "linux-systemd" ? "openclaw.env" : ".env.local");
  return `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
ENV_FILE="$ROOT/${envFile}"

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

cat <<JSON | curl -fsS -X POST "${world.apiBaseUrl}/api/agents/status" \\
  -H 'Content-Type: application/json' \\
  --data-binary @-
{
  "agentId": "${cfg.agentId}",
  "online": true,
  "runtime": "${cfg.runtime}",
  "endpoint": "${cfg.endpoint}",
  "model": "${cfg.model}"
}
JSON
echo
echo "Registered ${cfg.agentId} into EOW"
`;
}

function buildBootstrapRunnerTemplate(cfg) {
  const shellRoot = shellPath(cfg.installRoot);
  const registerEnabled = (cfg.registrationMode || "register-to-eow") === "register-to-eow";
  if (cfg.profile === "server-docker-compose") {
    return `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
cd "$ROOT"

echo "[1/3] Bootstrapping docker compose runtime"
./bootstrap.sh "$ROOT"

echo "[2/3] Running health checks"
./healthcheck.sh "$ROOT"

${registerEnabled ? `echo "[3/3] Reporting agent status to EOW"
./report-status.sh "$ROOT"` : `echo "[3/3] Keeping install local-only"
echo "Run ./register-to-eow-later.sh $ROOT when you want to register this runtime into EOW."`}

echo
echo "Bootstrap execution completed for ${cfg.agentId}"
`;
  }

  if (cfg.profile === "linux-systemd") {
    return `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
cd "$ROOT"

echo "[1/4] Installing systemd runtime scaffold"
./install-systemd.sh "$ROOT"

echo "[2/4] Waiting for service boot"
sleep 3

echo "[3/4] Running health checks"
./healthcheck.sh "$ROOT"

${registerEnabled ? `echo "[4/4] Reporting agent status to EOW"
./report-status.sh "$ROOT"` : `echo "[4/4] Keeping install local-only"
echo "Run ./register-to-eow-later.sh $ROOT when you want to register this runtime into EOW."`}

echo
echo "Bootstrap execution completed for ${cfg.agentId}"
`;
  }

  return `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
cd "$ROOT"

echo "[1/4] Installing local runtime scaffold"
./install-homebrew.sh "$ROOT"

echo "[2/4] Starting local runtime"
./start-openclaw.sh "$ROOT" >"$ROOT/logs/openclaw.stdout.log" 2>"$ROOT/logs/openclaw.stderr.log" &
RUNTIME_PID=$!
echo "$RUNTIME_PID" > "$ROOT/openclaw.pid"
sleep 3

echo "[3/4] Running health checks"
./healthcheck.sh "$ROOT"

${registerEnabled ? `echo "[4/4] Reporting agent status to EOW"
./report-status.sh "$ROOT"` : `echo "[4/4] Keeping install local-only"
echo "Run ./register-to-eow-later.sh $ROOT when you want to register this runtime into EOW."`}

echo
echo "Bootstrap execution completed for ${cfg.agentId}. Runtime pid: $RUNTIME_PID"
`;
}

function buildBootstrapDiagnoseTemplate(cfg) {
  const shellRoot = shellPath(cfg.installRoot);
  if (cfg.profile === "server-docker-compose") {
    return `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
cd "$ROOT"
echo "== files =="
ls -la "$ROOT"
echo
echo "== compose ps =="
docker compose ps || true
echo
echo "== compose logs =="
docker compose logs --tail=50 || true
echo
echo "== runtime contract =="
cat "$ROOT/runtime-contract.json" || true
echo
echo "== runtime config =="
cat "$ROOT/config/openclaw-runtime.json" || true
`;
  }

  if (cfg.profile === "linux-systemd") {
    return `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
echo "== files =="
ls -la "$ROOT"
echo
echo "== systemd status =="
systemctl --user status openclaw.service || true
echo
echo "== journal =="
journalctl --user -u openclaw.service -n 50 --no-pager || true
echo
echo "== runtime contract =="
cat "$ROOT/runtime-contract.json" || true
echo
echo "== runtime config =="
cat "$ROOT/config/openclaw-runtime.json" || true
`;
  }

  return `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
echo "== files =="
ls -la "$ROOT"
echo
echo "== health =="
curl -fsS "http://127.0.0.1:\${OPENCLAW_PORT:-18789}/health" || true
echo
echo "== runtime contract =="
cat "$ROOT/runtime-contract.json" || true
echo
echo "== runtime config =="
cat "$ROOT/config/openclaw-runtime.json" || true
echo
echo "== bootstrap log =="
cat "$ROOT/logs/bootstrap-run.log" || true
`;
}

function buildProfileTemplates(cfg, world) {
  const shellRoot = shellPath(cfg.installRoot);
  const systemdRoot = systemdPath(cfg.installRoot);
  const selection = onboardingSelection(cfg);
  const packageFiles = {};
  if (selection.packageId !== "base-openclaw") {
    packageFiles["package-manifest.json"] = `${JSON.stringify(buildPackageManifest(selection, cfg), null, 2)}\n`;
    packageFiles["capability-manifest.json"] = `${JSON.stringify(buildCapabilityManifest(selection, cfg), null, 2)}\n`;
  }
  if (selection.workflowPresetConfig) {
    packageFiles["workflow-manifest.json"] = `${JSON.stringify(buildWorkflowManifest(selection), null, 2)}\n`;
    packageFiles[`workflows/${selection.workflowPreset}.preset.json`] = `${JSON.stringify({
      presetId: selection.workflowPresetConfig.presetId,
      displayName: selection.workflowPresetConfig.displayName,
      tags: selection.workflowPresetConfig.tags,
      packageId: selection.packageId,
      runtime: cfg.runtime
    }, null, 2)}\n`;
  }
  if (selection.registrationMode === "local-only") {
    packageFiles["register-to-eow-later.sh"] = buildRegisterLaterScriptTemplate(cfg, world);
  }
  if (cfg.profile === "macos-homebrew") {
    return {
      "runtime-contract.json": buildRuntimeContract(cfg, world),
      "config/openclaw-runtime.example.json": buildRuntimeConfigTemplate(cfg, world),
      "bin/openclaw-runtime.example.js": buildRuntimeStubTemplate(cfg, world),
      "run-bootstrap.sh": buildBootstrapRunnerTemplate(cfg),
      "diagnose-bootstrap.sh": buildBootstrapDiagnoseTemplate(cfg),
      "Brewfile": [
        'tap "homebrew/core"',
        'brew "node"',
        'brew "jq"',
        'brew "curl"'
      ].join("\n") + "\n",
      ".env.local": `ELO_OPEN_WORLD_API_BASE=${world.apiBaseUrl}
ELO_OPEN_WORLD_HUMAN_ID=${cfg.humanId}
ELO_OPEN_WORLD_AGENT_ID=${cfg.agentId}
ELO_OPEN_WORLD_AGENT_MODEL=${cfg.model || ""}
ELO_OPEN_WORLD_AGENT_ENDPOINT=${cfg.endpoint || ""}
OPENCLAW_INSTALL_ROOT=${shellRoot}
OPENCLAW_PORT=18789
`,
      "healthcheck.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
PORT="\${OPENCLAW_PORT:-18789}"
curl -fsS "http://127.0.0.1:$PORT/health"
curl -fsS "${world.apiBaseUrl}/api/universe/manifest" >/dev/null
echo "macOS runtime health checks passed for $ROOT"
`,
      "report-status.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
ENV_FILE="$ROOT/.env.local"

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

cat <<JSON | curl -fsS -X POST "${world.apiBaseUrl}/api/agents/status" \\
  -H 'Content-Type: application/json' \\
  --data-binary @-
{
  "agentId": "${cfg.agentId}",
  "online": true,
  "runtime": "${cfg.runtime}",
  "endpoint": "${cfg.endpoint || "http://127.0.0.1:18789"}",
  "model": "${cfg.model || ""}"
}
JSON
echo
echo "Reported status for ${cfg.agentId}"
`,
      "stop-openclaw.sh": `#!/usr/bin/env sh
set -eu
pkill -f "openclaw-runtime.js" || true
echo "Requested stop for local OpenClaw runtime"
`,
      "install-homebrew.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install it from https://brew.sh first."
  exit 1
fi

mkdir -p "$ROOT"/{bin,config,logs,data}
brew bundle --file "$SCRIPT_DIR/Brewfile"
cp "$SCRIPT_DIR/.env.local" "$ROOT/.env.local"
cp "$SCRIPT_DIR/runtime-contract.json" "$ROOT/runtime-contract.json"
cp "$SCRIPT_DIR/config/openclaw-runtime.example.json" "$ROOT/config/openclaw-runtime.example.json"
cp "$SCRIPT_DIR/bin/openclaw-runtime.example.js" "$ROOT/bin/openclaw-runtime.example.js"
if [ ! -f "$ROOT/bin/openclaw-runtime.js" ]; then
  cp "$ROOT/bin/openclaw-runtime.example.js" "$ROOT/bin/openclaw-runtime.js"
fi
if [ ! -f "$ROOT/config/openclaw-runtime.json" ]; then
  cp "$ROOT/config/openclaw-runtime.example.json" "$ROOT/config/openclaw-runtime.json"
fi
cp "$SCRIPT_DIR/healthcheck.sh" "$ROOT/healthcheck.sh"
cp "$SCRIPT_DIR/report-status.sh" "$ROOT/report-status.sh"
cp "$SCRIPT_DIR/stop-openclaw.sh" "$ROOT/stop-openclaw.sh"
cp "$SCRIPT_DIR/start-openclaw.sh" "$ROOT/start-openclaw.sh"
cp "$SCRIPT_DIR/run-bootstrap.sh" "$ROOT/run-bootstrap.sh"
cp "$SCRIPT_DIR/diagnose-bootstrap.sh" "$ROOT/diagnose-bootstrap.sh"
chmod +x "$ROOT/start-openclaw.sh"
chmod +x "$ROOT/run-bootstrap.sh" "$ROOT/diagnose-bootstrap.sh" "$ROOT/healthcheck.sh" "$ROOT/report-status.sh" "$ROOT/stop-openclaw.sh"

echo "macOS runtime scaffold prepared at $ROOT"
echo "Next step: $ROOT/start-openclaw.sh"
`,
      "start-openclaw.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
ENV_FILE="$ROOT/.env.local"
CONFIG_FILE="$ROOT/config/openclaw-runtime.json"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but was not found in PATH"
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

cd "$ROOT"

RUNTIME_FILE="$ROOT/bin/openclaw-runtime.js"
if [ ! -f "$RUNTIME_FILE" ]; then
  RUNTIME_FILE="$ROOT/openclaw-runtime.js"
fi

if [ ! -f "$RUNTIME_FILE" ]; then
  echo "openclaw runtime entrypoint is missing in $ROOT/bin or $ROOT"
  echo "Place your OpenClaw-compatible runtime here before starting."
  exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo "runtime config is missing at $CONFIG_FILE"
  exit 1
fi

export OPENCLAW_RUNTIME_CONFIG="$CONFIG_FILE"
exec node "$RUNTIME_FILE"
`,
      ...packageFiles
    };
  }

  if (cfg.profile === "linux-systemd") {
    return {
      "runtime-contract.json": buildRuntimeContract(cfg, world),
      "config/openclaw-runtime.example.json": buildRuntimeConfigTemplate(cfg, world),
      "bin/openclaw-runtime.example.js": buildRuntimeStubTemplate(cfg, world),
      "run-bootstrap.sh": buildBootstrapRunnerTemplate(cfg),
      "diagnose-bootstrap.sh": buildBootstrapDiagnoseTemplate(cfg),
      "openclaw.env": `ELO_OPEN_WORLD_API_BASE=${world.apiBaseUrl}
ELO_OPEN_WORLD_HUMAN_ID=${cfg.humanId}
ELO_OPEN_WORLD_AGENT_ID=${cfg.agentId}
ELO_OPEN_WORLD_AGENT_MODEL=${cfg.model || ""}
ELO_OPEN_WORLD_AGENT_ENDPOINT=${cfg.endpoint || ""}
OPENCLAW_INSTALL_ROOT=${shellRoot}
OPENCLAW_RUNTIME_CONFIG=${shellRoot}/config/openclaw-runtime.json
`,
      "healthcheck.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
PORT="\${OPENCLAW_PORT:-18789}"
curl -fsS "http://127.0.0.1:$PORT/health"
test -f "$ROOT/openclaw.env"
echo "linux-systemd runtime health checks passed for $ROOT"
`,
      "report-status.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
if [ -f "$ROOT/openclaw.env" ]; then
  set -a
  . "$ROOT/openclaw.env"
  set +a
fi

cat <<JSON | curl -fsS -X POST "${world.apiBaseUrl}/api/agents/status" \\
  -H 'Content-Type: application/json' \\
  --data-binary @-
{
  "agentId": "${cfg.agentId}",
  "online": true,
  "runtime": "${cfg.runtime}",
  "endpoint": "${cfg.endpoint || "http://127.0.0.1:18789"}",
  "model": "${cfg.model || ""}"
}
JSON
echo
echo "Reported status for ${cfg.agentId}"
`,
      "stop-openclaw.sh": `#!/usr/bin/env sh
set -eu
systemctl --user stop openclaw.service || true
pkill -f "${systemdRoot}/openclaw-runtime.js" || true
echo "Requested stop for linux-systemd runtime"
`,
      "openclaw.service": `[Unit]
Description=OpenClaw runtime for ${cfg.agentId}
After=network-online.target

[Service]
WorkingDirectory=${systemdRoot}
EnvironmentFile=${systemdRoot}/openclaw.env
Environment=OPENCLAW_RUNTIME_CONFIG=${systemdRoot}/config/openclaw-runtime.json
ExecStart=${systemdRoot}/start-openclaw.sh
ExecReload=/bin/sh -lc 'systemctl --user restart openclaw.service'
ExecStop=/bin/sh -lc 'pkill -f "${systemdRoot}/openclaw-runtime.js" || true'
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`,
      "start-openclaw.sh": `#!/usr/bin/env sh
set -eu
ROOT="${shellRoot}"
CONFIG_FILE="$ROOT/config/openclaw-runtime.json"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but was not found in PATH"
  exit 1
fi

if [ -f "$ROOT/openclaw.env" ]; then
  set -a
  . "$ROOT/openclaw.env"
  set +a
fi

cd "$ROOT"

RUNTIME_FILE="$ROOT/bin/openclaw-runtime.js"
if [ ! -f "$RUNTIME_FILE" ]; then
  RUNTIME_FILE="$ROOT/openclaw-runtime.js"
fi

if [ ! -f "$RUNTIME_FILE" ]; then
  echo "openclaw runtime entrypoint is missing in $ROOT/bin or $ROOT"
  exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo "runtime config is missing at $CONFIG_FILE"
  exit 1
fi

export OPENCLAW_RUNTIME_CONFIG="\${OPENCLAW_RUNTIME_CONFIG:-$CONFIG_FILE}"
exec /usr/bin/env node "$RUNTIME_FILE"
`,
      "install-systemd.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
mkdir -p "$ROOT"/{bin,config,logs,data} ~/.config/systemd/user
cp openclaw.env "$ROOT/openclaw.env"
cp runtime-contract.json "$ROOT/runtime-contract.json"
cp config/openclaw-runtime.example.json "$ROOT/config/openclaw-runtime.example.json"
cp bin/openclaw-runtime.example.js "$ROOT/bin/openclaw-runtime.example.js"
if [ ! -f "$ROOT/bin/openclaw-runtime.js" ]; then
  cp "$ROOT/bin/openclaw-runtime.example.js" "$ROOT/bin/openclaw-runtime.js"
fi
if [ ! -f "$ROOT/config/openclaw-runtime.json" ]; then
  cp "$ROOT/config/openclaw-runtime.example.json" "$ROOT/config/openclaw-runtime.json"
fi
cp start-openclaw.sh "$ROOT/start-openclaw.sh"
cp run-bootstrap.sh "$ROOT/run-bootstrap.sh"
cp diagnose-bootstrap.sh "$ROOT/diagnose-bootstrap.sh"
cp healthcheck.sh "$ROOT/healthcheck.sh"
cp report-status.sh "$ROOT/report-status.sh"
cp stop-openclaw.sh "$ROOT/stop-openclaw.sh"
chmod +x "$ROOT/start-openclaw.sh"
chmod +x "$ROOT/run-bootstrap.sh" "$ROOT/diagnose-bootstrap.sh" "$ROOT/healthcheck.sh" "$ROOT/report-status.sh" "$ROOT/stop-openclaw.sh"
cp openclaw.service ~/.config/systemd/user/openclaw.service
systemctl --user daemon-reload
systemctl --user enable --now openclaw.service
`,
      ...packageFiles
    };
  }

  if (cfg.profile === "server-docker-compose") {
    return {
      "runtime-contract.json": buildRuntimeContract(cfg, world),
      "config/openclaw-runtime.example.json": buildRuntimeConfigTemplate(cfg, world),
      "bin/openclaw-runtime.example.js": buildRuntimeStubTemplate(cfg, world),
      "run-bootstrap.sh": buildBootstrapRunnerTemplate(cfg),
      "diagnose-bootstrap.sh": buildBootstrapDiagnoseTemplate(cfg),
      "docker-compose.yml": `services:
  openclaw:
    image: ghcr.io/example/openclaw:latest
    container_name: ${cfg.agentId.replace(/[^a-zA-Z0-9_.-]/g, "-")}
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "18789:18789"
    volumes:
      - ./bin:/app/bin
      - ./config:/app/config
      - ./data:/app/data
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:18789/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 10s
    command: ["node", "/app/bin/openclaw-runtime.js"]
`,
      ".env": `ELO_OPEN_WORLD_API_BASE=${world.apiBaseUrl}
ELO_OPEN_WORLD_HUMAN_ID=${cfg.humanId}
ELO_OPEN_WORLD_AGENT_ID=${cfg.agentId}
ELO_OPEN_WORLD_AGENT_MODEL=${cfg.model || ''}
ELO_OPEN_WORLD_AGENT_ENDPOINT=${cfg.endpoint || ''}
OPENCLAW_INSTALL_ROOT=${shellRoot}
`,
      "docker-compose.override.yml": `services:
  openclaw:
    environment:
      OPENCLAW_LOG_LEVEL: info
      OPENCLAW_RUNTIME_CONFIG: /app/config/openclaw-runtime.json
    volumes:
      - ./config:/app/config
`,
      "healthcheck.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
cd "$ROOT"
docker compose ps
docker compose exec -T openclaw curl -fsS "http://127.0.0.1:18789/health"
echo "docker-compose runtime health checks passed for $ROOT"
`,
      "report-status.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
if [ -f "$ROOT/.env" ]; then
  set -a
  . "$ROOT/.env"
  set +a
fi

cat <<JSON | curl -fsS -X POST "${world.apiBaseUrl}/api/agents/status" \\
  -H 'Content-Type: application/json' \\
  --data-binary @-
{
  "agentId": "${cfg.agentId}",
  "online": true,
  "runtime": "${cfg.runtime}",
  "endpoint": "${cfg.endpoint || "http://127.0.0.1:18789"}",
  "model": "${cfg.model || ""}"
}
JSON
echo
echo "Reported status for ${cfg.agentId}"
`,
      "bootstrap.sh": `#!/usr/bin/env sh
set -eu
ROOT="\${1:-${shellRoot}}"
mkdir -p "$ROOT"/{bin,data,logs,config}
cp runtime-contract.json "$ROOT/runtime-contract.json"
cp config/openclaw-runtime.example.json "$ROOT/config/openclaw-runtime.example.json"
cp bin/openclaw-runtime.example.js "$ROOT/bin/openclaw-runtime.example.js"
if [ ! -f "$ROOT/bin/openclaw-runtime.js" ]; then
  cp "$ROOT/bin/openclaw-runtime.example.js" "$ROOT/bin/openclaw-runtime.js"
fi
if [ ! -f "$ROOT/config/openclaw-runtime.json" ]; then
  cp "$ROOT/config/openclaw-runtime.example.json" "$ROOT/config/openclaw-runtime.json"
fi
cp docker-compose.yml "$ROOT/docker-compose.yml"
cp docker-compose.override.yml "$ROOT/docker-compose.override.yml"
cp .env "$ROOT/.env"
cp run-bootstrap.sh "$ROOT/run-bootstrap.sh"
cp diagnose-bootstrap.sh "$ROOT/diagnose-bootstrap.sh"
cp healthcheck.sh "$ROOT/healthcheck.sh"
cp report-status.sh "$ROOT/report-status.sh"
chmod +x "$ROOT/run-bootstrap.sh" "$ROOT/diagnose-bootstrap.sh" "$ROOT/healthcheck.sh" "$ROOT/report-status.sh"
cd "$ROOT"
docker compose pull
docker compose up -d
docker compose ps
`,
      ...packageFiles
    };
  }

  return {};
}



function buildArtifactBundle({ action, identity, setupPack = null, plan = null, templates = {}, diagnostics = null }) {
  const files = {};

  if (action === "setup-pack" && setupPack) {
    if (setupPack.readme) files["README.md"] = setupPack.readme;
    if (setupPack.registerScript) files["register-agent.sh"] = setupPack.registerScript;
    if (setupPack.agentConfig) files["agent.config.json"] = setupPack.agentConfig;
  }

  if (action === "install-plan" && plan) {
    files["install-plan.json"] = JSON.stringify(plan, null, 2) + "\n";
    for (const [name, value] of Object.entries(templates || {})) files[name] = value;
  }

  if (action === "bootstrap" && plan) {
    files["bootstrap-report.json"] = JSON.stringify({
      contract: "elo-agent-onboarder.bootstrap-report.v1",
      identity,
      plan,
      diagnostics
    }, null, 2) + "\n";
    for (const [name, value] of Object.entries(templates || {})) files[name] = value;
  }

  return {
    contract: "elo-agent-onboarder.artifact-bundle.v1",
    generatedAt: Date.now(),
    action,
    identity,
    fileCount: Object.keys(files).length,
    files
  };
}

export class OpenClawOnboardingService {
  constructor({ identityRegistry, defaultWorldUrl = "http://127.0.0.1:8788" }) {
    this.identityRegistry = identityRegistry;
    this.defaultWorldUrl = defaultWorldUrl;
  }

  catalog() {
    return buildOnboarderCatalogContract();
  }

  generateBundle({ humanId, agentId, worldUrl = "", machineLabel = "", notes = "", packageId = "base-openclaw", profile = "macos-homebrew", registrationMode = "register-to-eow", workflowPreset = "" }) {
    const human = this.identityRegistry.getHuman(humanId);
    const agent = this.identityRegistry.getAgent(agentId);
    if (agent.humanId !== human.humanId) {
      throw new Error("agent does not belong to the provided human");
    }
    const selection = onboardingSelection({ packageId, profile, registrationMode, workflowPreset });

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
      package: {
        packageId: selection.packageId,
        displayName: selection.package.displayName,
        profile: selection.profile,
        registrationMode: selection.registrationMode,
        workflowPreset: selection.workflowPreset || null
      },
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
      artifactBundle: buildArtifactBundle({
        action: "setup-pack",
        identity: {
          humanId: human.humanId,
          agentId: agent.agentId
        },
        setupPack
      }),
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
    profile = "",
    target = "",
    platform = "",
    packageMode = "",
    runtimeMode = "",
    installRoot = "",
    machineLabel = "",
    registrationMode = "register-to-eow",
    packageId = "base-openclaw",
    workflowPreset = ""
  }) {
    const selection = onboardingSelection({ packageId, profile, registrationMode, workflowPreset });
    const safeProfile = selection.profile;
    const selected = FOUNDATION_INSTALL_PROFILES[safeProfile] || {};
    const safeMachineLabel = text("machineLabel", machineLabel || selected.machineLabel || "", 128);
    const bundle = this.generateBundle({
      humanId,
      agentId,
      worldUrl,
      machineLabel: safeMachineLabel,
      packageId: selection.packageId,
      profile: safeProfile,
      registrationMode: selection.registrationMode,
      workflowPreset: selection.workflowPreset
    });
    const safeTarget = token("target", target || selected.target || "local", 32).toLowerCase();
    const safePlatform = token("platform", platform || selected.platform || "unknown", 32).toLowerCase();
    const safePackageMode = token("packageMode", packageMode || selected.packageMode || "node", 32).toLowerCase();
    const safeRuntimeMode = token("runtimeMode", runtimeMode || selected.runtimeMode || (safePackageMode === "docker" ? "docker-compose" : "local-process"), 64).toLowerCase();
    const safeInstallRoot = text("installRoot", installRoot || selected.installRoot || "~/elo-open-world", 512);

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

    if (safeProfile === "macos-homebrew") {
      steps.push({
        id: "install-homebrew-runtime",
        title: "Install runtime via Homebrew",
        action: "homebrew-runtime",
        command: "./install-homebrew.sh",
        rationale: "Homebrew is the supported dependency path for macOS desktop installs."
      });
    } else if (safeProfile === "linux-systemd") {
      steps.push(
        {
          id: "install-linux-runtime",
          title: "Install Linux runtime dependencies",
          action: "linux-runtime",
          command: "install node and system packages using apt/yum/zypper",
          rationale: "Linux desktop installs should prepare a long-running local service."
        },
        {
          id: "write-systemd-unit",
          title: "Write systemd user unit",
          action: "systemd-unit",
          command: "./install-systemd.sh",
          rationale: "systemd user services provide restart and login persistence."
        }
      );
    } else if (safeProfile === "server-docker-compose") {
      steps.push(
        {
          id: "install-docker-compose",
          title: "Install Docker Compose runtime",
          action: "docker-compose-runtime",
          command: "install docker engine and docker compose plugin",
          rationale: "Server installs should prefer Docker Compose for repeatable operations."
        },
        {
          id: "write-compose-stack",
          title: "Write docker compose stack",
          action: "docker-compose-stack",
          command: "./bootstrap.sh",
          rationale: "Compose files define the runtime shape and restart policy."
        }
      );
    } else if (safePackageMode === "docker") {
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
        command: safeProfile === "server-docker-compose" ? "docker compose up -d" : (safeProfile === "linux-systemd" ? "systemctl --user enable --now openclaw.service" : (safePackageMode === "docker" ? "docker run ..." : "start your local OpenClaw-compatible runtime")),
        rationale: "Bring the user-owned agent runtime online before reporting status."
      }
    );
    if (selection.registrationMode === "register-to-eow") {
      steps.push({
        id: "report-status",
        title: "Report status to EOW",
        action: "report-status",
        command: bundle.world.agentStatusUrl,
        rationale: "Make the local agent visible in EOW after the runtime is up."
      });
    } else {
      steps.push({
        id: "register-later",
        title: "Optional later registration",
        action: "register-later",
        command: "./register-to-eow-later.sh",
        rationale: "Keep the install local-only now, with a later opt-in registration path."
      });
    }

    const templates = buildProfileTemplates({
      humanId: bundle.identity.humanId,
      agentId: bundle.identity.agentId,
      profile: safeProfile || "custom",
      packageId: selection.packageId,
      registrationMode: selection.registrationMode,
      workflowPreset: selection.workflowPreset,
      installRoot: safeInstallRoot,
      runtime: bundle.runtime.runtime,
      model: bundle.runtime.model,
      endpoint: bundle.runtime.endpoint
    }, bundle.world);

    const plan = {
      contract: "elo-agent-onboarder.install-plan.v1",
      generatedAt: Date.now(),
      identity: bundle.identity,
      runtime: bundle.runtime,
      target: {
        profile: safeProfile || "custom",
        target: safeTarget,
        platform: safePlatform,
        packageMode: safePackageMode,
        runtimeMode: safeRuntimeMode,
        installRoot: safeInstallRoot,
        packageId: selection.packageId,
        registrationMode: selection.registrationMode,
        workflowPreset: selection.workflowPreset || null
      },
      package: bundle.package,
      world: bundle.world,
      setupPackContract: bundle.contract,
      steps,
      templates
    };

    return {
      ...plan,
      artifactBundle: buildArtifactBundle({
        action: "install-plan",
        identity: {
          humanId: bundle.identity.humanId,
          agentId: bundle.identity.agentId
        },
        plan,
        templates
      })
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
      templates: plan.templates,
      artifactBundle: buildArtifactBundle({
        action: "bootstrap",
        identity: {
          humanId: bundle.identity.humanId,
          agentId: bundle.identity.agentId
        },
        plan,
        templates: plan.templates,
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
      }),
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


export { FOUNDATION_INSTALL_PROFILES };
