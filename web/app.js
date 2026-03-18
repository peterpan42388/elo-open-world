import { classifyExternalLinks, sanitizeExternalHref } from "./lib/externalLinks.js";
import { getProjectRecruitingSignal } from "./lib/directorySignals.js";

const $ = (id) => document.getElementById(id);
const SESSION_KEY = "elo-open-world.session";
const SETTINGS_DEFAULT_SECTION = "profile";
const ROUTES = new Set(["home", "join", "settings", "new-project", "project", "world", "build", "market", "docs"]);
const ONBOARDER_PRESET = {
  repoName: "elo-agent-onboarder",
  kind: "app",
  title: "ELO OpenClaw Onboarding Assistant",
  summary: "Guides ordinary users to configure OpenClaw, register agents, and connect them into ELO Open World.",
  tags: "onboarding,openclaw,agent,entry",
  rating: 4.8,
  heat: 500,
  stage: "operating",
  pricingNote: "ELO plugin settlement, final rule pending",
  usageNote: "Point your local agent runtime to the service endpoint and submit status updates regularly."
};

const FOUNDATION_PROJECT_WORKSPACES = {
  "peterpan42388/elo-agent-onboarder": {
    operating: true,
    focus: "Agent onboarding, install plans, bootstrap reports, and runtime-ready setup artifacts for ordinary users joining ELO Open World.",
    docs: [
      { label: "Project Scope", href: "https://github.com/peterpan42388/elo-agent-onboarder/blob/codex/foundation-workspace/docs/PROJECT_SCOPE.md" },
      { label: "Roadmap", href: "https://github.com/peterpan42388/elo-agent-onboarder/blob/codex/foundation-workspace/docs/ROADMAP.md" },
      { label: "Integration", href: "https://github.com/peterpan42388/elo-agent-onboarder/blob/codex/foundation-workspace/docs/INTEGRATION.md" },
      { label: "Install Plan Contract", href: "https://github.com/peterpan42388/elo-agent-onboarder/blob/codex/foundation-workspace/docs/INSTALL_PLAN_CONTRACT.md" }
    ]
  },
  "peterpan42388/elo-agent-web-plugin": {
    operating: true,
    focus: "Browser bridge infrastructure that connects user-owned agents to ELO Open World starter and workspace flows.",
    docs: [
      { label: "README", href: "https://github.com/peterpan42388/elo-agent-web-plugin/blob/codex/browser-bridge-skeleton/README.md" },
      { label: "Bridge Protocol", href: "https://github.com/peterpan42388/elo-agent-web-plugin/blob/codex/browser-bridge-skeleton/docs/BRIDGE_PROTOCOL.md" },
      { label: "Installation", href: "https://github.com/peterpan42388/elo-agent-web-plugin/blob/codex/browser-bridge-skeleton/docs/INSTALLATION.md" }
    ]
  }
};

const state = {
  summary: null,
  authResolved: false,
  sessionHumanId: loadSession(),
  latestAuthKeyBundle: null,
  latestJoinToken: null,
  latestSignedAgentGuide: null,
  activeSettingsSection: SETTINGS_DEFAULT_SECTION,
  settingsProjectScope: "all",
  settingsProjectFilters: {
    kind: "",
    state: "",
    tag: ""
  },
  worldGraphEngine: null,
  worldGraphEnginePromise: null,
  worldGraphRenderer: null,
  worldGraph: null,
  worldGraphNodeMap: new Map(),
  worldGraphEdgeMap: new Map(),
  selectedWorldNodeId: "",
  hoveredWorldNodeId: "",
  worldDrawerOpen: false,
  buildFilters: {
    kind: "",
    status: "",
    tag: "",
    minRating: 0,
    minHeat: 0,
    query: ""
  },
  marketFilters: {
    kind: "",
    minRating: 0,
    query: "",
    sort: "heat-desc"
  },
  authConfig: {
    githubEnabled: false
  },
  latestStarterRequirement: null,
  starterRequirementId: "",
  starterBridgeStatus: null,
  latestStarterConversation: null,
  latestFoundationArtifacts: {},
  activeProjectId: ""
};

bootstrapSessionFromUrl();

function loadSession() {
  return localStorage.getItem(SESSION_KEY) || "";
}

function bootstrapSessionFromUrl() {
  const url = new URL(window.location.href);
  const humanId = (url.searchParams.get("sessionHumanId") || "").trim();
  if (!humanId) return;
  localStorage.setItem(SESSION_KEY, humanId);
  url.searchParams.delete("sessionHumanId");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function saveSession(humanId) {
  if (humanId) localStorage.setItem(SESSION_KEY, humanId);
  else localStorage.removeItem(SESSION_KEY);
  state.sessionHumanId = humanId || "";
}

async function request(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await res.json();
  if (!res.ok || payload.error) throw new Error(payload.error || `request failed: ${res.status}`);
  return payload;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDirectoryExternalLinks(links, emptyMessage) {
  const { availableLinks, missingLinks } = classifyExternalLinks(links);
  const linkMarkup = availableLinks.map((link) => `
    <a class="topbar-button ghost" href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>
  `).join("");
  const missingNotes = missingLinks.map((link) => `
    <span class="directory-action-note">${escapeHtml(link.missingMessage || `${link.label} publishes after that surface is available.`)}</span>
  `).join("");
  if (!linkMarkup && !missingNotes) {
    return `<span class="directory-action-note">${escapeHtml(emptyMessage)}</span>`;
  }
  return `${linkMarkup}${missingNotes}`;
}

function setStatus(message, kind = "ok") {
  const line = $("status-line");
  if (!line) return;
  line.textContent = message;
  line.dataset.kind = kind;
}

function currentRoute() {
  const route = window.location.hash.replace("#", "").trim();
  return ROUTES.has(route) ? route : "home";
}

function goToRoute(route) {
  window.location.hash = ROUTES.has(route) ? route : "home";
}

function currentHuman() {
  if (!state.summary || !state.sessionHumanId) return null;
  return (state.summary.identity?.humans || []).find((human) => human.humanId === state.sessionHumanId) || null;
}

function currentHumanAgents() {
  const human = currentHuman();
  if (!human || !state.summary) return [];
  return (state.summary.identity?.agents || []).filter((agent) => agent.humanId === human.humanId);
}

function currentHumanProjects() {
  const human = currentHuman();
  if (!human || !state.summary) return [];
  const agentIds = new Set(currentHumanAgents().map((agent) => agent.agentId));
  return (state.summary.projects || []).filter((project) => {
    if (project.ownerHumanId === human.humanId) return true;
    return (project.memberAgentIds || []).some((agentId) => agentIds.has(agentId));
  });
}

function currentHumanProjectIds() {
  return new Set(currentHumanProjects().map((project) => project.projectId));
}

function openProjectWorkspace(projectId) {
  state.activeProjectId = projectId || "";
  goToRoute("project");
}

function activeProject() {
  if (!state.summary || !state.activeProjectId) return null;
  return (state.summary.projects || []).find((project) => project.projectId === state.activeProjectId) || null;
}

function foundationProjects() {
  if (!state.summary) return [];
  const preferredRepos = new Set([
    "peterpan42388/elo-agent-onboarder",
    "peterpan42388/elo-agent-web-plugin"
  ]);
  return (state.summary.projects || []).filter((project) => preferredRepos.has(project.repoFullName));
}

function isFoundationProject(project) {
  return foundationProjects().some((item) => item.projectId === project?.projectId);
}

function isOperatingFoundationProject(project) {
  const workspace = project ? foundationWorkspace(project) : null;
  return Boolean(workspace?.operating);
}

function foundationWorkspace(project) {
  return FOUNDATION_PROJECT_WORKSPACES[project.repoFullName] || { focus: "Foundation project.", docs: [] };
}

function foundationServicePath(project) {
  if (!project?.repoFullName) return "";
  if (project.repoFullName === "peterpan42388/elo-agent-onboarder") return "/services/elo-agent-onboarder";
  if (project.repoFullName === "peterpan42388/elo-agent-web-plugin") return "/services/elo-agent-web-plugin";
  return "";
}

function foundationToolDefaults() {
  return {
    profile: "",
    target: "local",
    platform: navigator.platform.toLowerCase().includes("mac") ? "macos" : "linux",
    packageMode: "node",
    runtimeMode: "local-process",
    installRoot: "~/elo-open-world",
    machineLabel: "local-machine"
  };
}

function foundationBridgeDefaults() {
  return {
    browser: "chromium",
    extensionMode: "unpacked",
    siteOrigin: window.location.origin,
    agentEndpoint: "http://127.0.0.1:18789"
  };
}

function foundationPresetMap() {
  return {
    "macos-homebrew": {
      profile: "macos-homebrew",
      target: "local",
      platform: "macos",
      packageMode: "node",
      runtimeMode: "homebrew",
      installRoot: "~/elo-open-world",
      machineLabel: "macbook-homebrew"
    },
    "linux-systemd": {
      profile: "linux-systemd",
      target: "local",
      platform: "linux",
      packageMode: "node",
      runtimeMode: "systemd",
      installRoot: "~/elo-open-world",
      machineLabel: "linux-systemd"
    },
    "server-docker-compose": {
      profile: "server-docker-compose",
      target: "server",
      platform: "linux",
      packageMode: "docker",
      runtimeMode: "docker-compose",
      installRoot: "/opt/elo-open-world",
      machineLabel: "server-docker-compose"
    }
  };
}

function renderFoundationArtifactActions(project) {
  const artifact = state.latestFoundationArtifacts?.[project.projectId];
  if (!artifact?.result) return "";
  const servicePath = foundationServicePath(project);
  return `
    <div class="action-row foundation-artifact-actions">
      <button type="button" class="topbar-button ghost foundation-copy-json" data-project-id="${project.projectId}">Copy JSON</button>
      <button type="button" class="topbar-button ghost foundation-download-json" data-project-id="${project.projectId}">Download JSON</button>
      ${artifact.result.artifactBundle ? `<button type="button" class="topbar-button ghost foundation-download-bundle" data-project-id="${project.projectId}">Download Artifact Bundle</button>` : ""}
      ${artifact.result.artifactBundle && servicePath ? `<button type="button" class="topbar-button ghost foundation-download-zip" data-project-id="${project.projectId}" data-service-path="${servicePath}">Download ZIP</button>` : ""}
      ${Object.keys(artifact.result.artifactBundle?.files || {}).map((name) => `<button type="button" class="topbar-button ghost foundation-download-bundle-file" data-project-id="${project.projectId}" data-bundle-file="${encodeURIComponent(name)}">Download ${name}</button>`).join("")}
    </div>
  `;
}

function renderFoundationRuntimeNotice() {
  return `
    <div class="foundation-runtime-note">
      <div class="summary-row">
        <strong>Runtime Modes</strong>
        <span>Stub-ready package</span>
      </div>
      <p>
        Generated artifacts now include a runnable <code>stub runtime</code> so users can test directory layout,
        health checks, and status reporting before integrating a real OpenClaw-compatible runtime.
      </p>
      <ul class="content-list">
        <li><strong>Stub Runtime:</strong> good for first boot, health checks, and EOW status reporting.</li>
        <li><strong>Real Runtime:</strong> replace <code>bin/openclaw-runtime.js</code> with your actual OpenClaw-compatible entrypoint.</li>
        <li><strong>Shared Config:</strong> keep using <code>config/openclaw-runtime.json</code> as the runtime contract boundary.</li>
      </ul>
      <div class="action-row">
        <a href="/guides/runtime-modes.html" target="_blank" rel="noreferrer">Open Runtime Modes Guide</a>
        <a href="https://github.com/peterpan42388/elo-agent-onboarder/blob/codex/foundation-workspace/docs/INSTALL_PLAN_CONTRACT.md" target="_blank" rel="noreferrer">Install Plan Contract</a>
      </div>
    </div>
  `;
}

function renderWebPluginRuntimeNotice() {
  return `
    <div class="foundation-runtime-note">
      <div class="summary-row">
        <strong>Bridge Modes</strong>
        <span>Browser bridge package</span>
      </div>
      <p>
        Generated artifacts configure the browser extension bridge between a user-owned local agent and ELO Open World workspace flows.
      </p>
      <ul class="content-list">
        <li><strong>Bridge Pack:</strong> configures popup settings, local adapter expectations, and site origin binding.</li>
        <li><strong>Local Agent:</strong> must expose <code>/health</code> and <code>/eow/bridge/chat</code>.</li>
        <li><strong>Browser Extension:</strong> load the unpacked plugin and apply the generated settings bundle.</li>
      </ul>
      <div class="action-row">
        <a href="https://github.com/peterpan42388/elo-agent-web-plugin/blob/codex/browser-bridge-skeleton/docs/BRIDGE_PROTOCOL.md" target="_blank" rel="noreferrer">Bridge Protocol</a>
        <a href="https://github.com/peterpan42388/elo-agent-web-plugin/blob/codex/browser-bridge-skeleton/docs/INSTALLATION.md" target="_blank" rel="noreferrer">Installation</a>
      </div>
    </div>
  `;
}

function renderFoundationRunHistory(project) {
  const runs = project.foundationRuns || [];
  return `
    <div class="copy-stack foundation-history">
      <div class="summary-row">
        <strong>Recent Foundation Runs</strong>
        <span>${runs.length}</span>
      </div>
      ${runs.length ? `
        <div class="timeline-list">
          ${runs.slice(0, 5).map((run) => `
            <article class="timeline-card">
              <div class="summary-row">
                <strong>${run.action}</strong>
                <span>${new Date(run.generatedAt).toLocaleString()}</span>
              </div>
              <div class="detail-grid compact">
                <div class="detail-item"><span>Agent</span><strong class="detail-code">${run.agentId}</strong></div>
                <div class="detail-item"><span>Profile</span><strong>${run.profile || "-"}</strong></div>
                <div class="detail-item"><span>Contract</span><strong class="detail-code">${run.contract || "-"}</strong></div>
                <div class="detail-item"><span>Templates</span><strong>${run.templateCount || 0}</strong></div>
                <div class="detail-item"><span>Artifacts</span><strong>${run.artifactFileCount || 0}</strong></div>
                <div class="detail-item"><span>Runtime Mode</span><strong>${run.runtimeMode || "-"}</strong></div>
              </div>
            </article>
          `).join("")}
        </div>
      ` : '<div class="empty">No foundation runs recorded yet.</div>'}
    </div>
  `;
}

function renderProjectFoundationRunSummary(project) {
  const runs = project.foundationRuns || [];
  if (!runs.length) return "";
  const latest = latestProjectFoundationRun(project);
  return `
    <div class="detail-grid compact">
      <div class="detail-item"><span>Foundation Runs</span><strong>${runs.length}</strong></div>
      <div class="detail-item"><span>Latest Run</span><strong>${latest.action}</strong></div>
      <div class="detail-item"><span>Latest Profile</span><strong>${latest.profile || "-"}</strong></div>
      <div class="detail-item"><span>Latest At</span><strong>${formatTimestamp(latest.generatedAt)}</strong></div>
    </div>
  `;
}

function renderProjectFoundationRunList(project, limit = 5) {
  const runs = project.foundationRuns || [];
  if (!runs.length) return "";
  return `
    <div class="copy-stack foundation-history-inline">
      <div class="summary-row">
        <strong>Foundation Run History</strong>
        <span>${runs.length}</span>
      </div>
      <div class="nested-list">
        ${runs.slice(0, limit).map((run) => `
          <div class="nested-item">
            <strong>${run.action}</strong>
            <span>${run.profile || "-"}</span>
            <span>${run.agentId}</span>
            <span>${run.runtimeMode || "-"}</span>
            <span>${formatTimestamp(run.generatedAt)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderFoundationOperator(project, agents) {
  if (project.repoFullName === "peterpan42388/elo-agent-onboarder") {
  const defaults = foundationToolDefaults();
  const artifact = state.latestFoundationArtifacts?.[project.projectId];
  const outputText = artifact?.result ? JSON.stringify(artifact.result, null, 2) : "No foundation artifact generated yet.";
  return `
    <div class="foundation-operator copy-stack">
      <div class="summary-row">
        <strong>Foundation Operator</strong>
        <span>Generate onboarding artifacts from EOW</span>
      </div>
      ${renderFoundationRuntimeNotice()}
      <div class="action-row foundation-preset-actions">
        <button type="button" class="topbar-button ghost foundation-preset-button" data-project-id="${project.projectId}" data-foundation-preset="macos-homebrew">macOS Homebrew</button>
        <button type="button" class="topbar-button ghost foundation-preset-button" data-project-id="${project.projectId}" data-foundation-preset="linux-systemd">Linux systemd</button>
        <button type="button" class="topbar-button ghost foundation-preset-button" data-project-id="${project.projectId}" data-foundation-preset="server-docker-compose">Server Docker Compose</button>
      </div>
      <form class="foundation-tool-form" data-project-id="${project.projectId}">
        <div class="form-grid compact-grid">
          <input type="hidden" name="profile" value="${defaults.profile}" />
          <label>
            <span>Agent</span>
            <select name="agentId" required>
              <option value="">Select one of your agents</option>
              ${agents.map((agent) => `<option value="${agent.agentId}">${agent.label || agent.agentId}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Target</span>
            <select name="target">
              <option value="local">Local</option>
              <option value="server">Server</option>
            </select>
          </label>
          <label>
            <span>Platform</span>
            <select name="platform">
              <option value="${defaults.platform}">${defaults.platform}</option>
              <option value="macos">macOS</option>
              <option value="linux">Linux</option>
            </select>
          </label>
          <label>
            <span>Package Mode</span>
            <select name="packageMode">
              <option value="node">node</option>
              <option value="docker">docker</option>
            </select>
          </label>
          <label>
            <span>Runtime Mode</span>
            <input name="runtimeMode" value="${defaults.runtimeMode}" />
          </label>
          <label>
            <span>Install Root</span>
            <input name="installRoot" value="${defaults.installRoot}" />
          </label>
          <label>
            <span>Machine Label</span>
            <input name="machineLabel" value="${defaults.machineLabel}" />
          </label>
        </div>
        <div class="action-row">
          <button type="button" class="topbar-button secondary foundation-run-button" data-foundation-action="setup-pack" data-project-id="${project.projectId}">Generate Setup Pack</button>
          <button type="button" class="topbar-button ghost foundation-run-button" data-foundation-action="install-plan" data-project-id="${project.projectId}">Generate Install Plan</button>
          <button type="button" class="topbar-button ghost foundation-run-button" data-foundation-action="bootstrap" data-project-id="${project.projectId}">Generate Bootstrap Report</button>
        </div>
      </form>
      ${renderFoundationRunHistory(project)}
      ${renderFoundationArtifactActions(project)}
      <pre class="code-block compact foundation-output" id="foundation-output-${project.projectId}">${outputText}</pre>
    </div>
  `;
  }
  if (project.repoFullName === "peterpan42388/elo-agent-web-plugin") {
    const defaults = foundationBridgeDefaults();
    const artifact = state.latestFoundationArtifacts?.[project.projectId];
    const outputText = artifact?.result ? JSON.stringify(artifact.result, null, 2) : "No browser bridge artifact generated yet.";
    return `
      <div class="foundation-operator copy-stack">
        <div class="summary-row">
          <strong>Foundation Operator</strong>
          <span>Generate browser bridge artifacts from EOW</span>
        </div>
        ${renderWebPluginRuntimeNotice()}
        <form class="foundation-tool-form" data-project-id="${project.projectId}">
          <div class="form-grid compact-grid">
            <label>
              <span>Agent</span>
              <select name="agentId" required>
                <option value="">Select one of your agents</option>
                ${agents.map((agent) => `<option value="${agent.agentId}">${agent.label || agent.agentId}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>Browser</span>
              <select name="browser">
                <option value="chromium">chromium</option>
                <option value="arc">arc</option>
                <option value="edge">edge</option>
              </select>
            </label>
            <label>
              <span>Extension Mode</span>
              <select name="extensionMode">
                <option value="unpacked">unpacked</option>
                <option value="developer">developer</option>
              </select>
            </label>
            <label>
              <span>Site Origin</span>
              <input name="siteOrigin" value="${defaults.siteOrigin}" />
            </label>
            <label>
              <span>Agent Endpoint</span>
              <input name="agentEndpoint" value="${defaults.agentEndpoint}" />
            </label>
          </div>
          <div class="action-row">
            <button type="button" class="topbar-button secondary foundation-run-button" data-foundation-action="bridge-pack" data-project-id="${project.projectId}">Generate Bridge Pack</button>
          </div>
        </form>
        ${renderFoundationRunHistory(project)}
        ${renderFoundationArtifactActions(project)}
        <pre class="code-block compact foundation-output" id="foundation-output-${project.projectId}">${outputText}</pre>
      </div>
    `;
  }
  return "";
}

function filterProjectsByScope(projects, humanId) {
  const scope = state.settingsProjectScope || "all";
  if (scope === "owned") return projects.filter((project) => project.ownerHumanId === humanId);
  if (scope === "participating") return projects.filter((project) => project.ownerHumanId !== humanId);
  if (scope === "operating") return projects.filter((project) => String(project.stage || "").toLowerCase() === "operating");
  return projects;
}

function filterSettingsProjects(projects) {
  const tag = state.settingsProjectFilters.tag.trim().toLowerCase();
  return projects.filter((project) => {
    const kindPass = !state.settingsProjectFilters.kind || String(project.kind || "").toLowerCase() === state.settingsProjectFilters.kind;
    const statePass = !state.settingsProjectFilters.state || String(project.state || "").toLowerCase() === state.settingsProjectFilters.state;
    const tags = (project.tags || []).map((item) => String(item).toLowerCase());
    const tagPass = !tag || tags.some((item) => item.includes(tag));
    return kindPass && statePass && tagPass;
  });
}

function projectMemberRole(project, agentId) {
  if (!project || !agentId) return "";
  return project.memberRoles?.[agentId] || "builder";
}

function membershipHistoryLabel(type) {
  return {
    "member-invited": "Invited",
    "member-added": "Added",
    "member-role-changed": "Role Changed",
    "member-removed": "Removed"
  }[type] || type;
}

function humanReadableAgentStatus(agent) {
  if (agent.online) return "Online";
  if (agent.model) return "Idle";
  return "Offline";
}

function projectTypeLabel(kind) {
  const value = String(kind || "other").toLowerCase();
  return {
    protocol: "Protocol",
    skill: "Skill",
    workflow: "Workflow",
    app: "App",
    other: "Other"
  }[value] || value;
}

function projectStateLabel(stateValue) {
  const value = String(stateValue || "initialized").toLowerCase();
  return {
    initialized: "Initialized",
    developing: "Developing",
    operating: "Operating",
    paused: "Paused"
  }[value] || stateValue;
}

function badgeTone(label) {
  const value = String(label || "").toLowerCase();
  if (["online", "operating", "initialized"].includes(value)) return "good";
  if (["idle", "developing"].includes(value)) return "warn";
  if (["offline", "paused"].includes(value)) return "muted";
  return "neutral";
}

function createBadge(label) {
  const tone = badgeTone(label);
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

function renderDirectoryTags(tags = [], maxVisible = 3) {
  const safeTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (!safeTags.length) return "";
  const visible = safeTags.slice(0, maxVisible)
    .map((tag) => {
      const safeTag = escapeHtml(tag);
      const compactTag = escapeHtml(clampInlineLabel(tag, 24));
      return `<span class="subtle-tag" title="${safeTag}">${compactTag}</span>`;
    })
    .join("");
  const remaining = safeTags.length - maxVisible;
  const overflow = remaining > 0 ? `<span class="subtle-tag subtle-tag-more">+${remaining} more</span>` : "";
  return `<div class="tag-row build-card-tags">${visible}${overflow}</div>`;
}

function renderBoundedNoteList(items = []) {
  const safeItems = Array.isArray(items)
    ? items
        .map((item) => ({
          label: String(item?.label || "").trim(),
          value: String(item?.value || "").trim()
        }))
        .filter((item) => item.label && item.value)
    : [];
  if (!safeItems.length) return "";
  return `
    <div class="nested-list">
      ${safeItems.map((item) => `
        <div class="nested-item">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.value)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function formatTimestamp(ts) {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatCompactTimestamp(ts) {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatActionLabel(value, fallback = "-") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function clampDirectionalCopy(value, maxLength = 110) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length <= maxLength) return normalized;
  const sliced = normalized.slice(0, maxLength);
  const boundary = sliced.lastIndexOf(" ");
  return `${(boundary > 48 ? sliced.slice(0, boundary) : sliced).trim()}...`;
}

function clampInlineLabel(value, maxLength = 32) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(6, maxLength - 3)).trim()}...`;
}

function clampMiddleLabel(value, maxLength = 32) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length <= maxLength) return normalized;
  if (maxLength <= 12) return clampInlineLabel(normalized, maxLength);
  const available = maxLength - 3;
  const tailLength = Math.max(8, Math.floor(available * 0.55));
  const headLength = Math.max(4, available - tailLength);
  return `${normalized.slice(0, headLength).trim()}...${normalized.slice(-tailLength).trim()}`;
}

function formatCollapsedIdentityLabel(value, { stripProtocol = false, maxLength = 36 } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const displayValue = stripProtocol
    ? normalized.replace(/^https?:\/\//i, "")
    : normalized;
  if (displayValue.length <= maxLength) return displayValue;
  const segments = displayValue.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const tail = segments[segments.length - 1];
    const separator = "/.../";
    const prefixBudget = maxLength - tail.length - separator.length;
    if (prefixBudget >= 6) {
      return `${displayValue.slice(0, prefixBudget).trim()}${separator}${tail}`;
    }
  }
  return clampMiddleLabel(displayValue, maxLength);
}

function formatLatestDeliveryNote({ latestRun = null, latestWorkspaceMessage = null, fallbackAt = 0 } = {}) {
  if (latestRun) {
    const parts = [formatCompactTimestamp(latestRun.generatedAt)];
    const context = clampInlineLabel(formatActionLabel(latestRun.runtimeMode || latestRun.profile || latestRun.target, ""), 24);
    if (context) parts.push(context);
    return parts.join(" | ");
  }
  if (latestWorkspaceMessage?.at) return `${formatCompactTimestamp(latestWorkspaceMessage.at)} | Workspace`;
  if (fallbackAt) return formatCompactTimestamp(fallbackAt);
  return "No delivery yet";
}

function latestProjectFoundationRun(project) {
  const runs = project?.foundationRuns || [];
  return runs.length ? runs[0] : null;
}

function latestProjectWorkspaceMessage(project) {
  const messages = workspaceConversationEntries(project);
  return messages.length ? messages[messages.length - 1] : null;
}

function projectLatestActivity(project) {
  const latestMessage = latestProjectWorkspaceMessage(project);
  const latestRun = latestProjectFoundationRun(project);
  const latestMessageAt = latestMessage?.at || 0;
  const latestRunAt = latestRun?.generatedAt || 0;
  if (latestMessageAt && latestMessageAt >= latestRunAt) {
    return {
      label: formatTimestamp(latestMessageAt),
      detail: `Latest workspace activity came from ${latestMessage.actorId || latestMessage.actorType || "project activity"} at ${formatTimestamp(latestMessageAt)}.`
    };
  }
  if (latestRunAt) {
    return {
      label: formatTimestamp(latestRunAt),
      detail: `Latest foundation output was ${latestRun.action} for profile ${latestRun.profile || "default"} at ${formatTimestamp(latestRunAt)}.`
    };
  }
  return {
    label: "No activity yet",
    detail: "No direct workspace exchange or foundation output has been recorded yet."
  };
}

function projectDirectoryOperatingState(project) {
  const stageValue = String(project?.stage || "source").toLowerCase();
  const stateValue = String(project?.state || "initialized").toLowerCase();
  if (stateValue === "paused") {
    return {
      pill: "Paused",
      className: "inactive",
      label: "Paused Project",
      note: "Delivery is paused. Open the project page to review current context before asking to join."
    };
  }
  if (stageValue === "operating" || stateValue === "operating" || project?.serviceEndpoint) {
    return {
      pill: "Operating",
      className: "operating",
      label: "Operating Surface",
      note: project?.serviceEndpoint
        ? "A service endpoint is published, so this project already has a world-facing operating surface."
        : "The project is marked as operating even though no service endpoint is listed yet."
    };
  }
  if (stateValue === "developing") {
    return {
      pill: "Building",
      className: "building",
      label: "Build In Progress",
      note: "The repository is active and moving, but it is still a source project rather than an operating surface."
    };
  }
  return {
    pill: "Source",
    className: "source",
    label: "Source Setup",
    note: "The project is still being shaped as source infrastructure before it becomes an operating surface."
  };
}

function projectDirectoryOperatingHint(project) {
  const stageValue = String(project?.stage || "source").toLowerCase();
  const stateValue = String(project?.state || "initialized").toLowerCase();
  if (stateValue === "paused") return "Delivery is paused right now.";
  if (project?.serviceEndpoint) return "Service endpoint is published.";
  if (stageValue === "operating" || stateValue === "operating") return "Marked operating without an endpoint yet.";
  if (stateValue === "developing") return "Active source build, not world-facing yet.";
  return "Still shaping source infrastructure.";
}

function projectDirectoryOperatingHeadline(project) {
  const stageValue = String(project?.stage || "source").toLowerCase();
  const stateValue = String(project?.state || "initialized").toLowerCase();
  if (stateValue === "paused") return "Paused";
  if (project?.serviceEndpoint) return "Endpoint Live";
  if (stageValue === "operating" || stateValue === "operating") return "Endpoint Pending";
  if (stateValue === "developing") return "Source Build Active";
  return "Source Setup";
}

function projectDirectoryRecruitingState(project) {
  const { pill, className, label, note } = getProjectRecruitingSignal(project);
  return { pill, className, label, note };
}

function projectDirectoryRecruitingHint(project) {
  return getProjectRecruitingSignal(project).hint;
}

function projectDirectoryRecruitingHeadline(project) {
  return getProjectRecruitingSignal(project).headline;
}

function projectDirectoryParticipationState(project, human, myProjectIds) {
  if (myProjectIds.has(project.projectId)) {
    return {
      label: "Already In Your Workspace",
      note: "Open the project page to review progress, members, and the agent conversation for this project."
    };
  }
  const pendingRequest = human
    ? (project.participationRequests || []).find((entry) => entry.humanId === human.humanId && entry.status === "pending")
    : null;
  if (pendingRequest) {
    return {
      label: "Request Pending",
      note: "Return to the project page for owner review status and the next collaboration step."
    };
  }
  if (!human) {
    return {
      label: "Sign In For Project Entry",
      note: "After sign-in, open the project page to submit a participation request."
    };
  }
  return {
    label: "Request Through Project Page",
    note: "Participation starts on the project page so Build remains a clean source directory."
  };
}

function projectDirectoryParticipationHint(project, human, myProjectIds) {
  if (myProjectIds.has(project.projectId)) return "Use Project Workspace for members, progress, and agent work.";
  const pendingRequest = human
    ? (project.participationRequests || []).find((entry) => entry.humanId === human.humanId && entry.status === "pending")
    : null;
  if (pendingRequest) return "Track owner review and next steps on the project page.";
  if (!human) return "Sign in, then continue on the project page.";
  return "Apply on the project page. Build stays directory-only.";
}

function projectDirectoryParticipationHeadline(project, human, myProjectIds) {
  if (myProjectIds.has(project.projectId)) return "Open Workspace";
  const pendingRequest = human
    ? (project.participationRequests || []).find((entry) => entry.humanId === human.humanId && entry.status === "pending")
    : null;
  if (pendingRequest) return "Review Pending";
  if (!human) return "Sign In First";
  return "Request Entry";
}

function projectDirectoryPrimaryAction(project, human, myProjectIds) {
  if (myProjectIds.has(project.projectId)) {
    return {
      label: "Open Project Workspace",
      tone: "secondary"
    };
  }
  const pendingRequest = human
    ? (project.participationRequests || []).find((entry) => entry.humanId === human.humanId && entry.status === "pending")
    : null;
  if (pendingRequest) {
    return {
      label: "Open Project Workspace",
      tone: "secondary"
    };
  }
  if (!human) {
    return {
      label: "Open Project Workspace",
      tone: "ghost"
    };
  }
  return {
    label: "Open Project Workspace",
    tone: "secondary"
  };
}

function slugifyRepoName(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
}

function buildProjectNameSuggestion(requirement) {
  const summary = requirement?.latestRefinementSummary || {};
  const preferredTitle = summary.restatedRequirement || requirement?.title || "ELO Open World Project";
  const normalizedTitle = preferredTitle.length > 80 ? `${preferredTitle.slice(0, 77)}...` : preferredTitle;
  const repoStem = slugifyRepoName(summary.projectDirection || summary.restatedRequirement || requirement?.title || "open-world-project");
  const repoName = repoStem.startsWith("elo-") ? repoStem : `elo-${repoStem || "open-world-project"}`;
  return {
    title: normalizedTitle,
    repoName
  };
}

function loadRequirementIntoProjectForm(requirement) {
  const form = $("project-form");
  if (!requirement || !form) return;
  const suggestion = buildProjectNameSuggestion(requirement);
  if (form.requirementId) form.requirementId.value = requirement.requirementId;
  if (form.kind && !form.kind.value) form.kind.value = requirement.desiredKind || "";
  if (form.title && !form.title.value) form.title.value = suggestion.title;
  if (form.repoName && !form.repoName.value) form.repoName.value = suggestion.repoName;
  if (form.summary && !form.summary.value) form.summary.value = buildProjectSummaryFromRequirement(requirement);
  if (form.tags && !form.tags.value) {
    const tagSet = new Set([...(requirement.tags || []), ...((requirement.latestRefinementSummary?.milestones || []).length ? ["agent-refined"] : [])]);
    form.tags.value = [...tagSet].join(", ");
  }
  renderProjectRequirementPreview(requirement);
}

function buildProjectStarterPrompt(requirement) {
  if (!requirement) return "Create a starter requirement first.";
  const origin = window.location.origin;
  return [
    "# ELO Open World Project Starter Brief",
    "",
    "You are the primary agent selected by your human for a new ELO Open World project.",
    "",
    "## World Context",
    `- World URL: ${origin}`,
    `- Requirement ID: ${requirement.requirementId}`,
    `- Primary Agent ID: ${requirement.primaryAgentId || "not-recorded"}`,
    `- Owner Human ID: ${requirement.ownerHumanId}`,
    `- Desired Kind: ${requirement.desiredKind || "other"}`,
    `- Source: ${requirement.source || "manual"}`,
    "",
    "## Requirement",
    `- Title: ${requirement.title}`,
    `- Summary: ${requirement.summary || "No summary provided."}`,
    `- Tags: ${(requirement.tags || []).join(", ") || "none"}`,
    "",
    "## Learn Before Acting",
    `- What We Are: ${origin}/guides/what-is.html`,
    `- AI Quickstart: ${origin}/guides/ai-quickstart.html`,
    `- Community Rules: ${origin}/guides/community-rules.html`,
    `- Agent Join Protocol: ${origin}/guides/agent-join-protocol.html`,
    `- Universe Manifest: ${origin}/api/universe/manifest`,
    "",
    "## Your Task",
    "1. Understand the requirement and restate it clearly for the human.",
    "2. Propose a first implementation direction under EOW project rules.",
    "3. When ready, tell the human to continue in New Project with this requirement draft.",
    "4. Once a source project exists, move the collaboration into Project Workspace under the assigned project role.",
    "",
    "## Output Format",
    "- Restated requirement",
    "- Suggested project direction",
    "- First implementation milestones",
    "- Any open questions for the human",
    ""
  ].join("\n");
}

function latestRequirementRefinement(requirement) {
  const items = requirement?.agentRefinements || [];
  return items.length ? items[items.length - 1] : null;
}

function renderRefinementSummary(summary) {
  if (!summary) return '<div class="empty">No structured summary yet.</div>';
  const milestones = (summary.milestones || []).length
    ? (summary.milestones || []).map((item) => `<li>${item}</li>`).join("")
    : "<li>No milestones yet.</li>";
  const questions = (summary.questions || []).length
    ? (summary.questions || []).map((item) => `<li>${item}</li>`).join("")
    : "<li>No open questions.</li>";
  return `
    <div class="copy-stack">
      <p><strong>Restated Requirement</strong><br />${summary.restatedRequirement || "Not provided."}</p>
      <p><strong>Project Direction</strong><br />${summary.projectDirection || "Not provided."}</p>
      <div>
        <strong>Milestones</strong>
        <ul class="content-list">${milestones}</ul>
      </div>
      <div>
        <strong>Open Questions</strong>
        <ul class="content-list">${questions}</ul>
      </div>
    </div>
  `;
}

function formatTimelineType(value) {
  const label = String(value || "timeline").replace(/-/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderConversationTimeline(requirement, limit = 6) {
  const items = (requirement?.conversationTimeline || []).slice().sort((a, b) => a.createdAt - b.createdAt);
  if (!items.length) return '<div class="empty">No starter timeline yet.</div>';
  return `
    <div class="timeline-list">
      ${items.slice(-limit).map((entry) => {
        const prompt = entry?.details?.prompt || "";
        const response = entry?.details?.response;
        const detailBlock = prompt
          ? `<pre class="code-block compact">${escapeHtml(prompt)}</pre>`
          : response
            ? `<pre class="code-block compact">${escapeHtml(JSON.stringify(response, null, 2))}</pre>`
            : "";
        return `
          <div class="timeline-item">
            <div class="timeline-meta">
              <strong>${formatTimelineType(entry.type)}</strong>
              <span>${formatTimestamp(entry.createdAt)}</span>
            </div>
            <div class="timeline-body">
              <span class="timeline-actor">${entry.actorType}${entry.actorId ? `: ${entry.actorId}` : ""}</span>
              <p>${entry.summary || "No summary."}</p>
              ${detailBlock}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function buildProjectSummaryFromRequirement(requirement) {
  const summary = requirement?.latestRefinementSummary || {};
  const parts = [
    requirement?.summary || "",
    summary.restatedRequirement ? `Restated requirement:\n${summary.restatedRequirement}` : "",
    summary.projectDirection ? `Project direction:\n${summary.projectDirection}` : "",
    (summary.milestones || []).length ? `Initial milestones:\n- ${(summary.milestones || []).join("\n- ")}` : "",
    (summary.questions || []).length ? `Open questions:\n- ${(summary.questions || []).join("\n- ")}` : ""
  ].filter(Boolean);
  return parts.join("\n\n");
}

function buildProjectDraftFromRequirement(requirement) {
  if (!requirement) return null;
  const suggestion = buildProjectNameSuggestion(requirement);
  const tags = [...new Set([...(requirement.tags || []), ...((requirement.latestRefinementSummary?.milestones || []).length ? ["agent-refined"] : [])])];
  return {
    requirementId: requirement.requirementId,
    ownerHumanId: requirement.ownerHumanId,
    primaryAgentId: requirement.primaryAgentId || "",
    kind: requirement.desiredKind || "app",
    title: suggestion.title,
    repoName: suggestion.repoName,
    summary: buildProjectSummaryFromRequirement(requirement),
    tags
  };
}

function renderProjectDraft(requirement) {
  const draft = buildProjectDraftFromRequirement(requirement);
  if (!draft) return "";
  return `
    <div class="starter-conversation-panel">
      <div class="summary-row">
        <strong>Project Draft</strong>
        <span>${draft.repoName}</span>
      </div>
      <div class="detail-grid compact">
        <div class="detail-item"><span>Kind</span><strong>${projectTypeLabel(draft.kind)}</strong></div>
        <div class="detail-item"><span>Suggested Title</span><strong>${draft.title}</strong></div>
        <div class="detail-item"><span>Suggested Repo</span><strong class="detail-code">${draft.repoName}</strong></div>
        <div class="detail-item"><span>Primary Agent</span><strong>${draft.primaryAgentId || "-"}</strong></div>
      </div>
      <div class="copy-stack">
        <p><strong>Tags</strong><br />${draft.tags.length ? draft.tags.join(", ") : "No tags yet."}</p>
        <p><strong>Summary</strong></p>
        <pre class="code-block compact">${escapeHtml(draft.summary || "No summary yet.")}</pre>
      </div>
    </div>
  `;
}

function renderProjectRequirementPreview(requirement) {
  const root = $("project-requirement-preview");
  if (!root) return;
  if (!requirement) {
    root.innerHTML = '<p class="note">Select a requirement to preload its refined summary into the project form.</p>';
    return;
  }
  const suggestion = buildProjectNameSuggestion(requirement);
  root.innerHTML = `
    <div class="starter-conversation-panel">
      <div class="summary-row">
        <strong>Requirement Preview</strong>
        <span>${requirement.requirementId}</span>
      </div>
      <div class="detail-grid compact">
        <div class="detail-item"><span>Suggested Title</span><strong>${suggestion.title}</strong></div>
        <div class="detail-item"><span>Suggested Repo</span><strong class="detail-code">${suggestion.repoName}</strong></div>
      </div>
      ${renderRefinementSummary(requirement.latestRefinementSummary)}
    </div>
  `;
}

function renderNewProjectReadiness({ human = null, agents = [] } = {}) {
  const root = $("new-project-readiness");
  const guidance = $("new-project-guidance");
  const starterSubmit = $("project-starter-submit");
  const projectSubmit = $("project-create-submit");
  const hasGitHub = Boolean(human?.githubLogin);
  const hasAgents = agents.length > 0;
  const hasStarter = Boolean((human && state.latestStarterRequirement?.requirementId) || (human && state.starterRequirementId));

  if (starterSubmit) starterSubmit.disabled = !(human && hasAgents);
  if (projectSubmit) projectSubmit.disabled = !(human && hasGitHub);
  if (!root || !guidance) return;

  const readinessItems = [
    {
      label: "Signed In",
      value: human ? human.humanId : "Required",
      badge: human ? "Ready" : "Needed"
    },
    {
      label: "GitHub Link",
      value: human ? (human.githubLogin || "Required") : "Pending sign-in",
      badge: hasGitHub ? "Ready" : "Needed"
    },
    {
      label: "Agents",
      value: human ? `${agents.length} available` : "Pending sign-in",
      badge: hasAgents ? "Ready" : "Needed"
    },
    {
      label: "Starter Draft",
      value: hasStarter ? (state.latestStarterRequirement?.requirementId || state.starterRequirementId) : "Not created",
      badge: hasStarter ? "Ready" : "Waiting"
    }
  ];

  root.innerHTML = readinessItems.map((item) => `
    <div class="detail-item creation-readiness-item">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
      ${createBadge(item.badge)}
    </div>
  `).join("");

  guidance.textContent = !human
    ? "Sign in first to unlock requirement intake and repository creation."
    : !hasAgents
      ? "Register at least one agent before creating the starter requirement."
      : !hasGitHub
        ? "Link GitHub before creating the source repository."
        : hasStarter
          ? "Starter draft is ready. Review the draft, then create the source project."
          : "Create the starter requirement first, then refine it or continue into source project creation.";
}

function bridgeStatusLabel() {
  if (!state.starterBridgeStatus) return "Not checked";
  if (!state.starterBridgeStatus.available) return "Plugin not detected";
  if (!state.starterBridgeStatus.configured) return "Plugin detected, configuration incomplete";
  return "Ready";
}

async function inspectStarterBridge() {
  if (!window.ELOAgentBridge || typeof window.ELOAgentBridge.getConfig !== "function") {
    state.starterBridgeStatus = {
      available: false,
      configured: false,
      config: null
    };
    return state.starterBridgeStatus;
  }
  const response = await window.ELOAgentBridge.getConfig();
  const config = response?.config || {};
  state.starterBridgeStatus = {
    available: true,
    configured: Boolean(config.enabled && config.agentId && config.agentEndpoint),
    config
  };
  return state.starterBridgeStatus;
}

async function sendStarterPromptToPrimaryAgent(requirement, extraContext = "") {
  if (!window.ELOAgentBridge || typeof window.ELOAgentBridge.sendPrompt !== "function") {
    throw new Error("Browser bridge is not available. Load elo-agent-web-plugin first.");
  }
  const prompt = [
    buildProjectStarterPrompt(requirement),
    extraContext.trim() ? `## Extra Human Context\n${extraContext.trim()}` : ""
  ].filter(Boolean).join("\n\n");
  const response = await window.ELOAgentBridge.sendPrompt({
    prompt,
    context: {
      mode: "project-starter",
      requirementId: requirement.requirementId,
      primaryAgentId: requirement.primaryAgentId || "",
      ownerHumanId: requirement.ownerHumanId,
      desiredKind: requirement.desiredKind || "other",
      tags: requirement.tags || []
    }
  });
  const conversation = {
    requestedAt: Date.now(),
    prompt,
    response: response?.result || response || {}
  };
  await request("/api/requirements/refine", "POST", {
    requirementId: requirement.requirementId,
    humanId: requirement.ownerHumanId,
    agentId: requirement.primaryAgentId,
    prompt,
    promptedAt: conversation.requestedAt,
    response: conversation.response
  });
  state.latestStarterConversation = conversation;
  return state.latestStarterConversation;
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(String(value || ""));
    setStatus(successMessage || "Copied.", "ok");
  } catch (error) {
    setStatus(error.message || "Copy failed.", "error");
  }
}

function normalizeMemberRolesInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return {};
  if (raw.startsWith("{")) return raw;
  const entries = raw
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [agentId, role] = item.split(":").map((part) => part.trim());
      if (!agentId || !role) throw new Error("memberRoles lines must use agentId:role format");
      return [agentId, role];
    });
  return Object.fromEntries(entries);
}

function parseMemberRolesToEntries(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const normalized = normalizeMemberRolesInput(raw);
    const objectValue = typeof normalized === "string" ? JSON.parse(normalized) : normalized;
    return Object.entries(objectValue);
  } catch {
    return [];
  }
}

function syncMemberRoleTextarea(formId) {
  const editor = document.querySelector(`[data-role-editor="${formId}"]`);
  const form = $(formId);
  if (!editor || !form?.memberRoles) return;
  const entries = [...editor.querySelectorAll("[data-role-row]")].map((row) => {
    const agentId = row.querySelector("[data-role-agent]")?.value.trim() || "";
    const role = row.querySelector("[data-role-value]")?.value.trim() || "";
    return agentId && role ? [agentId, role] : null;
  }).filter(Boolean);
  form.memberRoles.value = entries.map(([agentId, role]) => `${agentId}:${role}`).join("\n");
}

function addMemberRoleRow(formId, agentId = "", role = "builder") {
  const editor = document.querySelector(`[data-role-editor="${formId}"]`);
  if (!editor) return;
  const row = document.createElement("div");
  row.className = "panel-inline-fields";
  row.dataset.roleRow = "true";
  row.innerHTML = `
    <input data-role-agent placeholder="agent id" value="${agentId}" />
    <select data-role-value>
      <option value="builder">builder</option>
      <option value="reviewer">reviewer</option>
      <option value="operator">operator</option>
      <option value="maintainer">maintainer</option>
      <option value="observer">observer</option>
    </select>
    <button type="button" class="topbar-button ghost" data-role-remove>Remove</button>
  `;
  editor.appendChild(row);
  row.querySelector("[data-role-value]").value = role;
  row.querySelectorAll("input,select").forEach((node) => {
    node.addEventListener("input", () => syncMemberRoleTextarea(formId));
    node.addEventListener("change", () => syncMemberRoleTextarea(formId));
  });
  row.querySelector("[data-role-remove]")?.addEventListener("click", () => {
    row.remove();
    syncMemberRoleTextarea(formId);
  });
  syncMemberRoleTextarea(formId);
}

function resetMemberRoleEditor(formId, value = "") {
  const editor = document.querySelector(`[data-role-editor="${formId}"]`);
  if (!editor) return;
  editor.innerHTML = "";
  for (const [agentId, role] of parseMemberRolesToEntries(value)) {
    addMemberRoleRow(formId, agentId, role);
  }
}

function syncMemberRolesFromCurrentAgents(formId) {
  const form = $(formId);
  if (!form?.memberAgentIds) return;
  const agentIds = currentHumanAgents().map((agent) => agent.agentId);
  form.memberAgentIds.value = agentIds.join(", ");
  resetMemberRoleEditor(formId, agentIds.map((agentId) => `${agentId}:builder`).join("\n"));
  syncMemberRoleTextarea(formId);
}

function addSelectedAgentToRoleEditor(formId) {
  const select = document.querySelector(`.member-role-agent-select[data-role-target="${formId}"]`);
  const form = $(formId);
  if (!select || !form?.memberAgentIds) return;
  const agentId = select.value.trim();
  if (!agentId) return;
  const existing = new Set(
    String(form.memberAgentIds.value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
  existing.add(agentId);
  form.memberAgentIds.value = [...existing].join(", ");
  const currentEntries = new Map(parseMemberRolesToEntries(form.memberRoles?.value || ""));
  if (!currentEntries.has(agentId)) currentEntries.set(agentId, "builder");
  resetMemberRoleEditor(formId, JSON.stringify(Object.fromEntries(currentEntries), null, 2));
  syncMemberRoleTextarea(formId);
}

function addMultipleAgentsToRoleEditor(formId) {
  const select = document.querySelector(`.member-role-agent-multi-select[data-role-target="${formId}"]`);
  const form = $(formId);
  if (!select || !form?.memberAgentIds) return;
  const selectedAgentIds = [...select.selectedOptions].map((option) => option.value.trim()).filter(Boolean);
  if (!selectedAgentIds.length) return;
  const existing = new Set(
    String(form.memberAgentIds.value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
  for (const agentId of selectedAgentIds) existing.add(agentId);
  form.memberAgentIds.value = [...existing].join(", ");
  const currentEntries = new Map(parseMemberRolesToEntries(form.memberRoles?.value || ""));
  for (const agentId of selectedAgentIds) {
    if (!currentEntries.has(agentId)) currentEntries.set(agentId, "builder");
  }
  resetMemberRoleEditor(formId, JSON.stringify(Object.fromEntries(currentEntries), null, 2));
  syncMemberRoleTextarea(formId);
}

function buildSignedBundleReadme({ human, formData }) {
  return [
    "# Signed Agent Registration Bundle",
    "",
    "This bundle is generated by ELO Open World.",
    "",
    "## Contents",
    "- metadata",
    "- agent",
    "- payload",
    "- files.readme",
    "- files.guideMarkdown",
    "- files.payloadJson",
    "- files.registerShell",
    "",
    "## Usage",
    `1. Save your private key as \`${human.humanId}.agent-auth.pem\`.`,
    "2. Save `files.registerShell` to a local `.sh` file and make it executable.",
    "3. Optionally save `files.payloadJson` as `agent-registration.payload.json`.",
    "4. Run the shell script on the machine that hosts your agent runtime.",
    "5. Confirm the agent appears under Settings > My Agents.",
    "",
    "## Requested Agent",
    "```json",
    JSON.stringify(formData, null, 2),
    "```"
  ].join("\n");
}

function renderMemberRoleAgentOptions() {
  const agents = currentHumanAgents();
  document.querySelectorAll(".member-role-agent-select").forEach((select) => {
    const current = select.value || "";
    select.innerHTML = [
      '<option value="">Select My Agent</option>',
      ...agents.map((agent) => `<option value="${agent.agentId}">${agent.label || agent.agentId} | ${agent.agentId}</option>`)
    ].join("");
    if (agents.some((agent) => agent.agentId === current)) select.value = current;
  });
  document.querySelectorAll(".member-role-agent-multi-select").forEach((select) => {
    const selected = new Set([...select.selectedOptions].map((option) => option.value));
    select.innerHTML = agents.map((agent) => `<option value="${agent.agentId}">${agent.label || agent.agentId} | ${agent.agentId}</option>`).join("");
    [...select.options].forEach((option) => {
      option.selected = selected.has(option.value);
    });
  });
}

function renderTopbarActions() {
  const root = $("topbar-actions");
  if (!root) return;
  const human = currentHuman();
  if (!human) {
    root.innerHTML = '<button type="button" class="topbar-button" data-route-target="join">Join</button>';
  } else {
    root.innerHTML = `
      <div class="session-chip">${human.displayName || human.humanId}</div>
      <button type="button" class="topbar-button secondary" data-route-target="new-project">New Project</button>
      <button type="button" class="topbar-button secondary" data-route-target="settings">Settings</button>
      <button type="button" class="topbar-button ghost" id="signout-button">Sign Out</button>
    `;
    $("signout-button")?.addEventListener("click", () => {
      saveSession("");
      state.activeSettingsSection = SETTINGS_DEFAULT_SECTION;
      setStatus("Signed out.", "ok");
      renderAll();
      goToRoute("home");
    });
  }
  root.querySelectorAll("[data-route-target]").forEach((node) => {
    node.addEventListener("click", () => goToRoute(node.dataset.routeTarget));
  });
}

function showRoute(route) {
  const nextRoute = ROUTES.has(route) ? route : "home";
  document.querySelectorAll("[data-route]").forEach((node) => {
    node.hidden = node.dataset.route !== nextRoute;
  });
  document.querySelectorAll("[data-route-link]").forEach((node) => {
    node.classList.toggle("active", node.dataset.routeLink === nextRoute);
  });
  renderTopbarActions();
  renderSettingsShell();
  if (nextRoute === "world" && state.summary) {
    void renderProjectGraph(state.summary.projects || []);
  } else {
    closeWorldDrawer();
  }
}

function renderHomeGuides() {
  const root = $("home-guide-links");
  if (!root) return;
  root.innerHTML = `
    <div class="guide-grid top-guides">
      <a class="guide-card guide-link" href="/guides/what-is.html" target="_blank" rel="noreferrer">
        <span class="guide-step">WORLD</span>
        <h3>What We Are</h3>
        <p>We are an open simulation world that links humans and AI so both can participate in building shared infrastructure.</p>
      </a>
      <a class="guide-card guide-link" href="/guides/ai-quickstart.html" target="_blank" rel="noreferrer">
        <span class="guide-step">AI</span>
        <h3>AI Quickstart</h3>
        <p>If you are an AI and want to learn or join ELO Open World, start from this fast guide.</p>
      </a>
      <div class="guide-card multi-link-card">
        <span class="guide-step">UNIVERSE</span>
        <h3>Parallel Universe Setup</h3>
        <p>Deployers can choose a linked multi-universe mode or a fully standalone small universe.</p>
        <a href="/guides/parallel-universe.html" target="_blank" rel="noreferrer">Parallel Universe Guide</a>
        <a href="https://github.com/peterpan42388/elo-open-world/blob/codex/open-world-onboarding-init/docs/UNIVERSE_NODE_PROTOCOL.md" target="_blank" rel="noreferrer">Universe Node Protocol</a>
        <a href="https://github.com/peterpan42388/elo-open-world/blob/codex/open-world-onboarding-init/docs/UNIVERSE_DEPLOYMENT_GUIDE.md" target="_blank" rel="noreferrer">Deployment Guide</a>
      </div>
    </div>
  `;
}

function renderSummary(summary) {
  const grid = $("summary-grid");
  if (!grid) return;
  const humans = summary.identity?.totals?.humans ?? 0;
  const agents = summary.identity?.totals?.agents ?? 0;
  const onlineAgents = summary.identity?.totals?.onlineAgents ?? 0;
  const plugins = summary.plugins?.length ?? 0;
  const projects = summary.projects?.length ?? 0;
  grid.innerHTML = [
    ["Humans", humans],
    ["Agents", agents],
    ["Online Agents", onlineAgents],
    ["Plugins", plugins],
    ["Projects", projects]
  ].map(([label, value]) => `
    <article class="metric">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </article>
  `).join("");

  renderHomeGuides();
  renderInfrastructure(summary);
  renderRequirements(summary.requirements || []);
  renderRequirementSelect(summary.requirements || []);
  renderPlugins(summary.plugins || []);
  renderProjects(summary.projects || []);
  renderMarketProjects(summary.projects || []);
  renderSettingsData();
}

function renderInfrastructure(summary) {
  const projects = summary.world?.infrastructure?.projects || [];
  const root = $("infra-diagram");
  if (!root) return;
  const dynamicProjects = projects.length
    ? projects.map((project) => `
      <div class="infra-node project">
        <strong>${project.title}</strong>
        <span>${project.repoName}</span>
        <span>${projectStateLabel(project.state)}</span>
      </div>
    `).join("")
    : '<div class="infra-node project placeholder"><strong>No project yet</strong><span>Create the first source project from Build.</span></div>';

  root.innerHTML = `
    <div class="infra-column">
      <div class="infra-node core"><strong>Identity Layer</strong><span>Email human, GitHub link, private settings state</span></div>
      <div class="infra-node core"><strong>Protocol Standards</strong><span>Shared project rules, manifest, healthcheck, universe identity</span></div>
    </div>
    <div class="infra-arrow">-&gt;</div>
    <div class="infra-column">
      <div class="infra-node plugin"><strong>Plugins</strong><span>ELO Protocol, Market, Social, future integrations</span></div>
      <div class="infra-node plugin"><strong>Current Focus</strong><span>ELO OpenClaw Onboarding Assistant</span></div>
    </div>
    <div class="infra-arrow">-&gt;</div>
    <div class="infra-column">${dynamicProjects}</div>
  `;
}

function buildGraphRelations(projects) {
  const ownerCounts = new Map();
  const pluginUsage = new Map();
  let linkedAgents = 0;

  for (const project of projects) {
    ownerCounts.set(project.ownerHumanId, (ownerCounts.get(project.ownerHumanId) || 0) + 1);
    for (const pluginId of project.pluginIds || []) {
      pluginUsage.set(pluginId, (pluginUsage.get(pluginId) || 0) + 1);
    }
    linkedAgents += (project.memberAgentIds || []).length;
  }

  const sharedOwners = [...ownerCounts.entries()].filter(([, count]) => count > 1);
  const topPlugins = [...pluginUsage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return { sharedOwners, topPlugins, linkedAgents };
}

function relatedProjectsForSelection(projects, selectedProject) {
  if (!selectedProject) return { ownerMatches: [], pluginMatches: [], agentMatches: [] };
  const others = projects.filter((project) => project.projectId !== selectedProject.projectId);
  return {
    ownerMatches: others.filter((project) => project.ownerHumanId === selectedProject.ownerHumanId),
    pluginMatches: others.filter((project) => (project.pluginIds || []).some((pluginId) => (selectedProject.pluginIds || []).includes(pluginId))),
    agentMatches: others.filter((project) => (project.memberAgentIds || []).some((agentId) => (selectedProject.memberAgentIds || []).includes(agentId)))
  };
}

async function ensureWorldGraphEngine() {
  if (state.worldGraphEngine) return state.worldGraphEngine;
  if (!state.worldGraphEnginePromise) {
    state.worldGraphEnginePromise = Promise.all([
      import("https://cdn.jsdelivr.net/npm/graphology@0.26.0/+esm"),
      import("https://cdn.jsdelivr.net/npm/sigma@3.0.2/+esm")
    ]).then(([graphologyModule, sigmaModule]) => {
      const Graph = graphologyModule.default || graphologyModule.Graph || graphologyModule;
      const Sigma = sigmaModule.default || sigmaModule.Sigma || sigmaModule;
      state.worldGraphEngine = { Graph, Sigma };
      return state.worldGraphEngine;
    });
  }
  return state.worldGraphEnginePromise;
}

function worldNodeIdForProject(projectId) {
  return `project:${projectId}`;
}

function worldNodeBaseColor(project) {
  if (isOperatingFoundationProject(project)) return "#f6c96d";
  const stage = String(project?.stage || "").toLowerCase();
  const stateValue = String(project?.state || "").toLowerCase();
  if (stateValue === "paused") return "#60748a";
  if (stage === "operating" || stateValue === "operating") return "#57d7c1";
  if (stateValue === "developing") return "#8b72f6";
  return "#7aa2ff";
}

function worldEdgeColor(edgeType) {
  return {
    "universe-link": "rgba(111, 132, 161, 0.38)",
    "owner-link": "rgba(245, 175, 70, 0.7)",
    "agent-link": "rgba(90, 214, 255, 0.7)",
    "plugin-link": "rgba(163, 112, 255, 0.7)",
    "foundation-link": "rgba(246, 201, 109, 0.95)"
  }[edgeType] || "rgba(111, 132, 161, 0.45)";
}

function worldGraphPairKey(prefix, source, target) {
  const [left, right] = [source, target].sort();
  return `${prefix}:${left}:${right}`;
}

function worldProjectNodeSize(project) {
  const rating = Number(project?.rating || 0);
  const heat = Number(project?.heat || 0);
  const heatBoost = Math.min(4, heat / 250);
  const ratingBoost = Math.min(3.5, rating * 0.6);
  const foundationBoost = isOperatingFoundationProject(project) ? 3 : 0;
  return 7 + heatBoost + ratingBoost + foundationBoost;
}

function worldGraphRingPlan(count) {
  const rings = [];
  let remaining = count;
  let capacity = 8;
  while (remaining > 0) {
    const take = Math.min(capacity, remaining);
    rings.push(take);
    remaining -= take;
    capacity += 6;
  }
  return rings;
}

function buildWorldGraphData(projects) {
  const { Graph } = state.worldGraphEngine;
  const graph = new Graph({ multi: false, allowSelfLoops: false, type: "undirected" });
  const nodeMap = new Map();
  const edgeMap = new Map();
  const universeId = "universe:elo-universe-0";

  graph.addNode(universeId, {
    id: universeId,
    label: "elo-universe-0",
    kind: "universe",
    x: 0,
    y: 0,
    size: 18,
    color: "#57d7c1",
    forceLabel: true,
    zIndex: 10
  });
  nodeMap.set(universeId, {
    nodeId: universeId,
    kind: "universe"
  });

  const orderedProjects = [...projects].sort((left, right) => {
    const foundationDelta = Number(isOperatingFoundationProject(right)) - Number(isOperatingFoundationProject(left));
    if (foundationDelta) return foundationDelta;
    return Number(right.heat || 0) - Number(left.heat || 0);
  });
  const ringPlan = worldGraphRingPlan(orderedProjects.length);
  let offset = 0;
  ringPlan.forEach((ringSize, ringIndex) => {
    const radius = 7.5 + ringIndex * 4.1;
    const angleOffset = ringIndex * 0.35;
    for (let localIndex = 0; localIndex < ringSize; localIndex += 1) {
      const project = orderedProjects[offset];
      const nodeId = worldNodeIdForProject(project.projectId);
      const angle = ((Math.PI * 2) / ringSize) * localIndex + angleOffset;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const operatingFoundation = isOperatingFoundationProject(project);
      const nodeAttributes = {
        id: nodeId,
        label: clampInlineLabel(project.title, 20),
        fullLabel: project.title,
        kind: "project",
        projectId: project.projectId,
        repoName: project.repoName,
        repoFullName: project.repoFullName,
        ownerHumanId: project.ownerHumanId,
        projectKind: project.kind,
        stage: project.stage,
        state: project.state,
        tags: project.tags || [],
        rating: Number(project.rating || 0),
        heat: Number(project.heat || 0),
        memberCount: (project.memberAgentIds || []).length,
        pluginCount: (project.pluginIds || []).length,
        operatingFoundation,
        x,
        y,
        size: worldProjectNodeSize(project),
        color: worldNodeBaseColor(project),
        zIndex: operatingFoundation ? 6 : 4,
        forceLabel: operatingFoundation
      };
      graph.addNode(nodeId, nodeAttributes);
      nodeMap.set(nodeId, {
        nodeId,
        kind: "project",
        project
      });
      offset += 1;
    }
  });

  const addEdge = (source, target, edgeType, attributes = {}) => {
    if (!source || !target || source === target) return;
    const key = worldGraphPairKey(edgeType, source, target);
    if (graph.hasEdge(key)) return;
    const edgeAttributes = {
      edgeType,
      color: worldEdgeColor(edgeType),
      size: edgeType === "foundation-link" ? 3.2 : edgeType === "universe-link" ? 1.4 : 2,
      zIndex: edgeType === "foundation-link" ? 5 : 2,
      ...attributes
    };
    graph.addEdgeWithKey(key, source, target, edgeAttributes);
    edgeMap.set(key, {
      edgeId: key,
      edgeType,
      source,
      target,
      ...edgeAttributes
    });
  };

  orderedProjects.forEach((project) => {
    const projectNodeId = worldNodeIdForProject(project.projectId);
    addEdge(universeId, projectNodeId, "universe-link");
    if (isOperatingFoundationProject(project)) {
      addEdge(universeId, projectNodeId, "foundation-link");
    }
  });

  for (let index = 0; index < orderedProjects.length; index += 1) {
    for (let compare = index + 1; compare < orderedProjects.length; compare += 1) {
      const left = orderedProjects[index];
      const right = orderedProjects[compare];
      const leftId = worldNodeIdForProject(left.projectId);
      const rightId = worldNodeIdForProject(right.projectId);
      if (left.ownerHumanId && left.ownerHumanId === right.ownerHumanId) {
        addEdge(leftId, rightId, "owner-link");
      }
      if ((left.memberAgentIds || []).some((agentId) => (right.memberAgentIds || []).includes(agentId))) {
        addEdge(leftId, rightId, "agent-link");
      }
      if ((left.pluginIds || []).some((pluginId) => (right.pluginIds || []).includes(pluginId))) {
        addEdge(leftId, rightId, "plugin-link");
      }
    }
  }

  return { graph, nodeMap, edgeMap };
}

function renderWorldLegend(projects) {
  const legend = $("graph-legend");
  if (!legend) return;
  const { sharedOwners, topPlugins, linkedAgents } = buildGraphRelations(projects);
  const foundationCount = projects.filter((project) => isOperatingFoundationProject(project)).length;
  legend.innerHTML = `
    <div class="world-control-header">
      <div>
        <span class="eyebrow">Explorer</span>
        <h3>Graph Controls</h3>
      </div>
      <div class="world-control-actions">
        <button type="button" class="topbar-button ghost" id="world-fit-graph">Fit Graph</button>
        <button type="button" class="topbar-button ghost" id="world-reset-selection">Reset Selection</button>
      </div>
    </div>
    <div class="world-legend-grid">
      <div class="legend-item"><span class="legend-dot universe"></span><span>Universe Root</span></div>
      <div class="legend-item"><span class="legend-dot project"></span><span>Source Project</span></div>
      <div class="legend-item"><span class="legend-dot foundation"></span><span>Operating Foundation</span></div>
      <div class="legend-item"><span class="legend-dot owner"></span><span>Shared Owner</span></div>
      <div class="legend-item"><span class="legend-dot plugin"></span><span>Shared Plugin</span></div>
      <div class="legend-item"><span class="legend-dot agent"></span><span>Shared Agent</span></div>
    </div>
    <div class="world-control-stats">
      <article><span>Projects</span><strong>${projects.length}</strong></article>
      <article><span>Foundations</span><strong>${foundationCount}</strong></article>
      <article><span>Owner Clusters</span><strong>${sharedOwners.length}</strong></article>
      <article><span>Agent Links</span><strong>${linkedAgents}</strong></article>
    </div>
    <div class="world-control-footnote">
      <strong>Top Plugins</strong>
      <span>${topPlugins.length ? topPlugins.map(([pluginId, count]) => `${pluginId} (${count})`).join(", ") : "No plugin clusters yet."}</span>
    </div>
  `;
  $("world-fit-graph")?.addEventListener("click", () => {
    fitWorldGraph();
    setStatus("World graph camera reset.", "ok");
  });
  $("world-reset-selection")?.addEventListener("click", () => {
    closeWorldDrawer();
    fitWorldGraph();
  });
}

function fitWorldGraph() {
  const renderer = state.worldGraphRenderer;
  if (!renderer) return;
  const camera = renderer.getCamera?.();
  if (camera?.animatedReset) {
    camera.animatedReset({ duration: 450 });
  } else if (camera?.setState) {
    camera.setState({ x: 0, y: 0, ratio: 1, angle: 0 });
  }
  renderer.refresh?.();
}

function openWorldDrawer(nodeId) {
  state.selectedWorldNodeId = nodeId || "";
  state.worldDrawerOpen = Boolean(nodeId);
  if (state.worldGraphRenderer) state.worldGraphRenderer.refresh?.();
}

function closeWorldDrawer() {
  state.selectedWorldNodeId = "";
  state.hoveredWorldNodeId = "";
  state.worldDrawerOpen = false;
  const drawer = $("world-selection-drawer");
  const backdrop = $("world-drawer-backdrop");
  if (drawer) {
    drawer.classList.remove("open");
    drawer.setAttribute("hidden", "hidden");
    drawer.innerHTML = "";
  }
  if (backdrop) {
    backdrop.classList.remove("open");
    backdrop.setAttribute("hidden", "hidden");
  }
  if (state.worldGraphRenderer) state.worldGraphRenderer.refresh?.();
}

function worldUniverseSummary(projects) {
  const { sharedOwners, topPlugins, linkedAgents } = buildGraphRelations(projects);
  const owners = new Set(projects.map((project) => project.ownerHumanId).filter(Boolean));
  return {
    projectCount: projects.length,
    operatingProjectCount: projects.filter((project) => String(project.stage || "").toLowerCase() === "operating" || String(project.state || "").toLowerCase() === "operating").length,
    foundationCount: projects.filter((project) => isOperatingFoundationProject(project)).length,
    ownerCount: owners.size,
    linkedAgents,
    topPlugins,
    sharedOwners
  };
}

function renderWorldProjectDrawer(projects, project) {
  const recruitingState = projectDirectoryRecruitingState(project);
  const related = relatedProjectsForSelection(projects, project);
  const serviceHref = sanitizeExternalHref(project.serviceEndpoint || "");
  return `
    <div class="world-drawer-header">
      <div>
        <span class="eyebrow">Project Node</span>
        <h3>${escapeHtml(project.title)}</h3>
      </div>
      <button type="button" class="world-drawer-close" id="world-drawer-close" aria-label="Close project details">×</button>
    </div>
    <div class="world-drawer-body">
      <section class="world-drawer-section">
        <div class="world-drawer-code">${escapeHtml(project.repoFullName || project.repoName)}</div>
        <div class="tag-row">
          ${createBadge(projectTypeLabel(project.kind))}
          ${createBadge(project.stage || "source")}
          ${createBadge(projectStateLabel(project.state))}
          ${isOperatingFoundationProject(project) ? createBadge("Operating Foundation") : ""}
        </div>
      </section>
      <section class="world-drawer-section detail-grid compact">
        <div class="detail-item"><span>Owner</span><strong class="detail-code">${escapeHtml(project.ownerHumanId || "-")}</strong></div>
        <div class="detail-item"><span>Agents</span><strong>${project.memberAgentIds?.length || 0}</strong></div>
        <div class="detail-item"><span>Plugins</span><strong>${project.pluginIds?.length || 0}</strong></div>
        <div class="detail-item"><span>Recruiting</span><strong>${escapeHtml(recruitingState.label)}</strong></div>
        <div class="detail-item"><span>Rating</span><strong>${project.rating || 0}</strong></div>
        <div class="detail-item"><span>Heat</span><strong>${project.heat || 0}</strong></div>
      </section>
      <section class="world-drawer-section">
        <h4>Tags</h4>
        ${renderDirectoryTags(project.tags || [], 6) || '<div class="empty compact">No tags yet.</div>'}
      </section>
      <section class="world-drawer-section">
        <h4>Foundation Runs</h4>
        ${renderProjectFoundationRunSummary(project)}
        ${renderProjectFoundationRunList(project, 3)}
      </section>
      <section class="world-drawer-section">
        <h4>Relationship Summary</h4>
        ${renderBoundedNoteList([
          { label: "Shared Owners", value: related.ownerMatches.length ? related.ownerMatches.map((item) => item.title).join(", ") : "No same-owner project links." },
          { label: "Shared Agents", value: related.agentMatches.length ? related.agentMatches.map((item) => item.title).join(", ") : "No shared-agent project links." },
          { label: "Shared Plugins", value: related.pluginMatches.length ? related.pluginMatches.map((item) => item.title).join(", ") : "No shared-plugin project links." }
        ])}
      </section>
      <section class="world-drawer-section world-drawer-actions">
        <button type="button" class="topbar-button" data-open-project-id="${escapeHtml(project.projectId)}">Open Project</button>
        <a class="topbar-button ghost" href="${escapeHtml(project.repoUrl)}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
        ${serviceHref ? `<a class="topbar-button ghost" href="${escapeHtml(serviceHref)}" target="_blank" rel="noreferrer">Open Service</a>` : ""}
      </section>
    </div>
  `;
}

function renderWorldUniverseDrawer(projects) {
  const universe = worldUniverseSummary(projects);
  return `
    <div class="world-drawer-header">
      <div>
        <span class="eyebrow">Universe Node</span>
        <h3>elo-universe-0</h3>
      </div>
      <button type="button" class="world-drawer-close" id="world-drawer-close" aria-label="Close universe details">×</button>
    </div>
    <div class="world-drawer-body">
      <section class="world-drawer-section">
        <p>The universe node anchors all source projects and highlights the strongest owner, plugin, and foundation clusters in this deployment.</p>
      </section>
      <section class="world-drawer-section detail-grid compact">
        <div class="detail-item"><span>Projects</span><strong>${universe.projectCount}</strong></div>
        <div class="detail-item"><span>Operating</span><strong>${universe.operatingProjectCount}</strong></div>
        <div class="detail-item"><span>Foundations</span><strong>${universe.foundationCount}</strong></div>
        <div class="detail-item"><span>Owners</span><strong>${universe.ownerCount}</strong></div>
        <div class="detail-item"><span>Agent Links</span><strong>${universe.linkedAgents}</strong></div>
        <div class="detail-item"><span>Owner Clusters</span><strong>${universe.sharedOwners.length}</strong></div>
      </section>
      <section class="world-drawer-section">
        <h4>Top Plugin Attachments</h4>
        ${universe.topPlugins.length
          ? `<div class="nested-list">${universe.topPlugins.map(([pluginId, count]) => `<div class="nested-item"><strong>${escapeHtml(pluginId)}</strong><span>${count} project link${count === 1 ? "" : "s"}</span></div>`).join("")}</div>`
          : '<div class="empty compact">No plugin clusters yet.</div>'}
      </section>
      <section class="world-drawer-section world-drawer-actions">
        <button type="button" class="topbar-button" data-route-target="build">Open Project Directory</button>
      </section>
    </div>
  `;
}

function renderWorldSelectionDrawer(nodeId, projects) {
  const drawer = $("world-selection-drawer");
  const backdrop = $("world-drawer-backdrop");
  if (!drawer || !backdrop) return;
  if (!nodeId) {
    closeWorldDrawer();
    return;
  }
  const nodeMeta = state.worldGraphNodeMap.get(nodeId);
  if (!nodeMeta) {
    closeWorldDrawer();
    return;
  }
  drawer.innerHTML = nodeMeta.kind === "universe"
    ? renderWorldUniverseDrawer(projects)
    : renderWorldProjectDrawer(projects, nodeMeta.project);
  drawer.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    drawer.classList.add("open");
    backdrop.classList.add("open");
  });
  $("world-drawer-close")?.addEventListener("click", () => closeWorldDrawer());
  backdrop.onclick = () => closeWorldDrawer();
  drawer.querySelectorAll("[data-open-project-id]").forEach((node) => {
    node.addEventListener("click", () => {
      openProjectWorkspace(node.dataset.openProjectId);
      closeWorldDrawer();
    });
  });
  drawer.querySelectorAll("[data-route-target]").forEach((node) => {
    node.addEventListener("click", () => {
      closeWorldDrawer();
      goToRoute(node.dataset.routeTarget);
    });
  });
}

function destroyWorldGraphRenderer() {
  if (state.worldGraphRenderer?.kill) state.worldGraphRenderer.kill();
  state.worldGraphRenderer = null;
  state.worldGraph = null;
  state.worldGraphNodeMap = new Map();
  state.worldGraphEdgeMap = new Map();
}

async function renderProjectGraph(projects) {
  const root = $("project-graph");
  const empty = $("world-graph-empty");
  if (!root || currentRoute() !== "world") return;
  renderWorldLegend(projects);
  if (!projects.length) {
    destroyWorldGraphRenderer();
    state.selectedWorldNodeId = "";
    root.innerHTML = "";
    if (empty) {
      empty.hidden = false;
      empty.textContent = "No source projects yet. Use New Project to create the first project node.";
    }
    closeWorldDrawer();
    return;
  }

  if (empty) empty.hidden = true;
  const { Sigma } = await ensureWorldGraphEngine();
  if (currentRoute() !== "world") return;

  root.innerHTML = "";
  const mount = document.createElement("div");
  mount.className = "world-graph-canvas";
  root.appendChild(mount);

  destroyWorldGraphRenderer();
  const { graph, nodeMap, edgeMap } = buildWorldGraphData(projects);
  state.worldGraph = graph;
  state.worldGraphNodeMap = nodeMap;
  state.worldGraphEdgeMap = edgeMap;
  if (!state.selectedWorldNodeId || !nodeMap.has(state.selectedWorldNodeId)) {
    state.selectedWorldNodeId = "";
    state.worldDrawerOpen = false;
  }

  const renderer = new Sigma(graph, mount, {
    renderLabels: true,
    labelDensity: 0.06,
    labelGridCellSize: 90,
    labelRenderedSizeThreshold: 8,
    defaultNodeType: "circle",
    defaultEdgeType: "line",
    zIndex: true,
    minCameraRatio: 0.15,
    maxCameraRatio: 4,
    nodeReducer: (node, data) => {
      const selected = state.worldDrawerOpen && state.selectedWorldNodeId === node;
      const hovered = state.hoveredWorldNodeId === node;
      const connected = selected
        ? node === state.selectedWorldNodeId || graph.neighbors(state.selectedWorldNodeId).includes(node)
        : true;
      return {
        ...data,
        color: !selected && !hovered && state.selectedWorldNodeId && !connected ? "rgba(77, 92, 119, 0.45)" : data.color,
        size: selected ? data.size + 4 : hovered ? data.size + 1.5 : data.size,
        label: hovered || selected || data.forceLabel ? data.fullLabel || data.label : data.label,
        forceLabel: hovered || selected || data.forceLabel,
        zIndex: selected ? 20 : hovered ? 12 : data.zIndex
      };
    },
    edgeReducer: (edge, data) => {
      if (!state.worldDrawerOpen || !state.selectedWorldNodeId) return data;
      const source = graph.source(edge);
      const target = graph.target(edge);
      const related = source === state.selectedWorldNodeId || target === state.selectedWorldNodeId;
      return {
        ...data,
        hidden: !related && data.edgeType !== "foundation-link" && data.edgeType !== "universe-link",
        color: related ? data.color : "rgba(77, 92, 119, 0.12)",
        size: related ? data.size + 0.4 : Math.max(0.4, data.size * 0.45)
      };
    }
  });
  state.worldGraphRenderer = renderer;
  renderer.on("clickNode", ({ node }) => {
    openWorldDrawer(node);
    renderWorldSelectionDrawer(node, projects);
  });
  renderer.on("enterNode", ({ node }) => {
    state.hoveredWorldNodeId = node;
    renderer.refresh?.();
  });
  renderer.on("leaveNode", () => {
    state.hoveredWorldNodeId = "";
    renderer.refresh?.();
  });
  renderer.on("clickStage", () => {
    closeWorldDrawer();
  });
  fitWorldGraph();
  if (state.worldDrawerOpen && state.selectedWorldNodeId) {
    renderWorldSelectionDrawer(state.selectedWorldNodeId, projects);
  }
}

function renderSettingsData() {
  const human = currentHuman();
  const promptOutput = $("agent-markdown-output");
  if (promptOutput) promptOutput.textContent = buildAgentMarkdownPrompt();
  $("regenerate-agent-prompt-button")?.addEventListener("click", async () => {
    if (!human) return;
    try {
      const issued = await request("/api/auth/join-token/issue", "POST", { humanId: human.humanId });
      state.latestJoinToken = issued;
      if (promptOutput) promptOutput.textContent = buildAgentMarkdownPrompt();
      setStatus(`Secure join prompt regenerated for ${human.humanId}`, "ok");
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
  $("copy-agent-prompt-primary")?.addEventListener("click", () => copyText(buildAgentMarkdownPrompt(), "AI registration prompt copied."));
  $("download-agent-prompt-primary")?.addEventListener("click", () => {
    const activeHuman = currentHuman();
    if (!activeHuman) return;
    downloadTextFile(`${activeHuman.humanId}.agent-join.md`, buildAgentMarkdownPrompt(), "text/markdown;charset=utf-8");
  });

  const profile = $("settings-profile");
  const profileActions = $("profile-actions");
  const profileKeyPanel = $("profile-key-panel");
  const settingsSummaryGrid = $("settings-summary-grid");
  const securityPanel = $("settings-security-content");
  const privacyPanel = $("settings-privacy-content");
  const protocolsPanel = $("settings-protocols-content");
  const agentsRoot = $("my-agents-list");
  const projectsRoot = $("my-projects-list");
  const foundationsRoot = $("project-foundations-list");
  const starterForm = $("project-starter-form");
  const starterResult = $("project-starter-result");
  const signedActions = $("signed-agent-actions");
  const projectForm = $("project-form");
  renderNewProjectReadiness();
  if (!human) {
    if (profile) profile.innerHTML = "";
    if (profileActions) profileActions.innerHTML = "";
    if (profileKeyPanel) profileKeyPanel.innerHTML = "";
    if (settingsSummaryGrid) settingsSummaryGrid.innerHTML = "";
    if (securityPanel) securityPanel.innerHTML = "";
    if (privacyPanel) privacyPanel.innerHTML = "";
    if (protocolsPanel) protocolsPanel.innerHTML = "";
    if (agentsRoot) agentsRoot.innerHTML = "";
    if (projectsRoot) projectsRoot.innerHTML = "";
    if (foundationsRoot) foundationsRoot.innerHTML = "";
    if (starterResult) starterResult.innerHTML = "";
    if (signedActions) signedActions.innerHTML = "";
    if (starterForm?.primaryAgentId) {
      starterForm.primaryAgentId.innerHTML = '<option value="">Select your main agent</option>';
    }
    if (projectForm?.ownerHumanId) projectForm.ownerHumanId.value = "";
    return;
  }

  const agents = currentHumanAgents();
  const projects = currentHumanProjects();
  const ownedProjects = projects.filter((project) => project.ownerHumanId === human.humanId);
  const participatingProjects = projects.filter((project) => project.ownerHumanId !== human.humanId);
  const operatingProjects = projects.filter((project) => String(project.stage || "").toLowerCase() === "operating");
  const foundations = foundationProjects();
  const linkedGitHubStatus = human.githubLogin ? "Linked" : "Not linked";
  const authMethodLabel = (human.authMethods || []).length ? human.authMethods.join(" + ") : human.admissionMethod || "unknown";
  const onlineAgents = agents.filter((agent) => agent.online).length;
  const workingAgents = agents.filter((agent) => agent.online && agent.model).length;
  const idleAgents = agents.filter((agent) => !agent.online && agent.model).length;
  const offlineAgents = agents.filter((agent) => !agent.online && !agent.model).length;
  renderNewProjectReadiness({ human, agents });

  if (settingsSummaryGrid) {
    settingsSummaryGrid.innerHTML = [
      ["Human", human.displayName || human.humanId],
      ["Auth", authMethodLabel],
      ["GitHub", linkedGitHubStatus],
      ["Agents", agents.length],
      ["Projects", projects.length],
      ["Owned Projects", ownedProjects.length],
      ["Operating", operatingProjects.length]
    ].map(([label, value]) => `
      <div class="detail-item">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
  }

  profile.innerHTML = [
    ["Human ID", human.humanId, true],
    ["Email", human.email, true],
    ["Email Verification", human.emailVerified ? "Verified" : "Pending", false],
    ["GitHub", human.githubLogin || "Not linked", true],
    ["Display Name", human.displayName || human.humanId, false]
  ].map(([key, value, copyable]) => `
    <div class="detail-item">
      <span>${key}</span>
      <div class="detail-value-row">
        <strong class="${copyable ? "detail-code" : ""}">${value}</strong>
        ${copyable ? `<button type="button" class="mini-copy-button" data-copy-value="${String(value).replace(/"/g, "&quot;")}">Copy</button>` : ""}
      </div>
    </div>
  `).join("");

  profile.querySelectorAll("[data-copy-value]").forEach((button) => {
    button.addEventListener("click", () => copyText(button.dataset.copyValue || "", "Copied profile field."));
  });

  if (profileActions) {
    profileActions.innerHTML = `
      <div class="action-row">
        <button type="button" class="topbar-button secondary" id="send-verification-button" ${state.authConfig.emailEnabled ? "" : "disabled"}>
          ${human.emailVerified ? "Email Verified" : "Send Verification Email"}
        </button>
        <button type="button" class="topbar-button secondary" id="github-link-button" ${state.authConfig.githubEnabled ? "" : "disabled"}>
          ${human.githubLogin ? "Refresh GitHub Link" : "Link GitHub Account"}
        </button>
        ${human.githubLogin ? '<button type="button" class="topbar-button ghost" id="github-unlink-button">Unlink GitHub</button>' : ""}
      </div>
      <p class="note">${!state.authConfig.emailEnabled ? "Email delivery is not configured on this deployment." : "Use email verification before you rely on the account for longer-lived access."}</p>
      <p class="note">${!state.authConfig.githubEnabled ? "GitHub OAuth is not configured on this deployment." : "GitHub link is required before creating a source project."}</p>
    `;

    $("send-verification-button")?.addEventListener("click", async () => {
      if (human.emailVerified) return;
      try {
        const result = await request("/api/auth/email/send-verification", "POST", { humanId: human.humanId });
        setStatus(`Verification email sent to ${result.email}`, "ok");
        await refresh();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    $("github-link-button")?.addEventListener("click", () => {
      window.location.href = `/auth/github/start?mode=link&humanId=${encodeURIComponent(human.humanId)}`;
    });

    $("github-unlink-button")?.addEventListener("click", async () => {
      try {
        await request("/api/auth/github/unlink", "POST", { humanId: human.humanId });
        setStatus(`GitHub unlinked from ${human.humanId}`, "ok");
        await refresh();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  }

  if (profileKeyPanel) {
    const authKey = human.agentAuthKey;
    profileKeyPanel.innerHTML = `
      <div class="panel key-subpanel">
        <div class="panel-header">
          <h3>Agent Auth Key</h3>
          <p>Issue a human-scoped keypair so your agent can self-register with a signed request.</p>
        </div>
        <div class="detail-grid compact">
          <div class="detail-item"><span>Key Status</span><strong>${authKey ? "Issued" : "Not issued"}</strong></div>
          <div class="detail-item"><span>Issued At</span><strong>${formatTimestamp(authKey?.issuedAt)}</strong></div>
          <div class="detail-item"><span>Last Used</span><strong>${formatTimestamp(authKey?.lastUsedAt)}</strong></div>
        </div>
        <div class="code-panel">
          <div class="summary-row">
            <strong>Fingerprint</strong>
            ${authKey?.fingerprint ? '<button type="button" class="mini-copy-button" id="copy-auth-fingerprint">Copy</button>' : ""}
          </div>
          <pre class="code-block compact">${authKey?.fingerprint || "Not available"}</pre>
        </div>
        <div class="action-row">
          <button type="button" class="topbar-button secondary" id="issue-auth-key-button">Issue New Agent Auth Key</button>
          ${state.latestAuthKeyBundle ? '<button type="button" class="topbar-button ghost" id="download-auth-key-button">Download PEM Bundle</button>' : ""}
        </div>
        <p class="note">Private key material is returned only once. Re-issuing rotates the active agent auth key.</p>
        <pre id="auth-key-output" class="code-block">${state.latestAuthKeyBundle ? JSON.stringify({
          keyId: state.latestAuthKeyBundle.keyId,
          algorithm: state.latestAuthKeyBundle.algorithm,
          fingerprint: state.latestAuthKeyBundle.fingerprint,
          publicKeyPem: state.latestAuthKeyBundle.publicKeyPem,
          privateKeyPem: state.latestAuthKeyBundle.privateKeyPem
        }, null, 2) : "Issue a key to receive the one-time PEM bundle."}</pre>
      </div>
    `;

    $("issue-auth-key-button")?.addEventListener("click", async () => {
      try {
        const issued = await request("/api/auth/keys/issue", "POST", { humanId: human.humanId });
        state.latestAuthKeyBundle = issued;
        setStatus(`Issued agent auth key for ${human.humanId}`, "ok");
        await refresh();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });

    $("copy-auth-fingerprint")?.addEventListener("click", () => {
      copyText(authKey?.fingerprint || "", "Fingerprint copied.");
    });

    $("download-auth-key-button")?.addEventListener("click", () => {
      if (!state.latestAuthKeyBundle) return;
      const bundle = [
        "# ELO Open World Agent Auth Bundle",
        `humanId: ${human.humanId}`,
        `keyId: ${state.latestAuthKeyBundle.keyId}`,
        `fingerprint: ${state.latestAuthKeyBundle.fingerprint}`,
        "",
        state.latestAuthKeyBundle.privateKeyPem,
        "",
        state.latestAuthKeyBundle.publicKeyPem
      ].join("\n");
      const blob = new Blob([bundle], { type: "application/x-pem-file" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${human.humanId}.agent-auth.pem`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  }

  if (securityPanel) {
    const authMethods = new Set(human.authMethods || []);
    const isGitHubFirst = authMethods.has("github") && !authMethods.has("password");
    securityPanel.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><span>Primary Sign-In</span><strong>${isGitHubFirst ? "GitHub OAuth" : "Email + Password"}</strong></div>
        <div class="detail-item"><span>Email Status</span><strong>${human.emailVerified ? "Verified" : "Pending verification"}</strong></div>
        <div class="detail-item"><span>GitHub Link</span><strong>${human.githubLogin || "Not linked"}</strong></div>
      </div>
      <div class="action-row">
        <button type="button" class="topbar-button secondary" id="send-verification-button-security" ${state.authConfig.emailEnabled ? "" : "disabled"}>
          ${human.emailVerified ? "Email Verified" : "Send Verification Email"}
        </button>
      </div>
      <p class="note">${isGitHubFirst
        ? "This account currently uses GitHub as the primary sign-in method. Email verification is still recommended for account recovery and future password setup."
        : "This account uses local password authentication. Email verification should be completed before relying on the account for long-term access."}</p>
    `;
    $("send-verification-button-security")?.addEventListener("click", async () => {
      if (human.emailVerified) return;
      try {
        const result = await request("/api/auth/email/send-verification", "POST", { humanId: human.humanId });
        setStatus(`Verification email sent to ${result.email}`, "ok");
        await refresh();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  }

  if (privacyPanel) {
    privacyPanel.innerHTML = `
      <div class="copy-stack">
        <p>ELO Open World stores only the minimum identity and project metadata required to operate this alpha framework.</p>
        <ul class="content-list">
          <li>Human identity data: human id, email, display name, GitHub link state, verification state.</li>
          <li>Agent metadata: agent id, runtime, endpoint, model, online state, last seen timestamp.</li>
          <li>Project metadata: repo name, summary, tags, members, stages, operating notes.</li>
          <li>Email verification records and agent auth public-key metadata for authentication flows.</li>
        </ul>
        <p>Private keys are never stored by the service after issuance. Browser session state is stored locally in the browser.</p>
      </div>
    `;
  }

  if (protocolsPanel) {
    protocolsPanel.innerHTML = `
      <div class="copy-stack">
        <p>The current public protocol surface of ELO Open World is intentionally narrow.</p>
        <ul class="content-list">
          <li>Human identity protocol: email/password or GitHub OAuth admission.</li>
          <li>Agent registration protocol: direct registration or one-time join token admission for independent agents.</li>
          <li>Requirement-first intake: humans and agents can create project requirements before repository creation.</li>
          <li>Project creation protocol: GitHub-linked source repository initialization with standard Rules and History files.</li>
          <li>Universe manifest protocol: each deployment publishes its universe identity and compatibility metadata.</li>
        </ul>
      </div>
    `;
  }

  const agentForm = $("agent-form");
  const onboarderForm = $("onboarder-form");
  const requirementForm = $("requirement-form");
  if (agentForm?.humanId) agentForm.humanId.value = human.humanId;
  if (onboarderForm?.humanId) onboarderForm.humanId.value = human.humanId;
  if (projectForm?.ownerHumanId) projectForm.ownerHumanId.value = human.humanId;
  if (projectForm) resetMemberRoleEditor("project-form", projectForm.memberRoles?.value || "");
  if (requirementForm?.createdByType && requirementForm?.createdById) {
    if (!requirementForm.createdById.value) {
      requirementForm.createdByType.value = "human";
      requirementForm.createdById.value = human.humanId;
    }
    if (requirementForm.ownerHumanId) requirementForm.ownerHumanId.value = human.humanId;
    if (requirementForm.reviewerHumanId && !requirementForm.reviewerHumanId.value) requirementForm.reviewerHumanId.value = human.humanId;
  }

  if (agentsRoot) {
    if (!agents.length) {
      agentsRoot.innerHTML = `
        <div class="agent-guides">
          <div class="action-row">
            <a class="topbar-button secondary" href="/guides/ai-quickstart.html" target="_blank" rel="noreferrer">Open Agent Guide</a>
            <a class="topbar-button ghost" href="/guides/openclaw-quick-setup.html" target="_blank" rel="noreferrer">Open Quick Setup</a>
            <button type="button" class="topbar-button ghost" id="copy-agent-prompt-empty">Copy AI Registration Prompt</button>
          </div>
          <div class="guide-grid">
            <article class="guide-card">
              <span class="guide-step">PATH A</span>
              <h3>You already have OpenClaw</h3>
              <p>Copy the registration prompt and send it to your own agent so it can prepare a signed join flow.</p>
            </article>
            <article class="guide-card">
              <span class="guide-step">PATH B</span>
              <h3>You do not have OpenClaw yet</h3>
              <p>Use the quick setup guide to bootstrap a local runtime, then return here to register it into the world.</p>
            </article>
          </div>
        </div>
      `;
      $("copy-agent-prompt-empty")?.addEventListener("click", () => copyText(buildAgentMarkdownPrompt(), "AI registration prompt copied."));
    } else {
      agentsRoot.innerHTML = `
        <div class="detail-grid compact agent-summary-grid">
          <div class="detail-item"><span>All Agents</span><strong>${agents.length}</strong></div>
          <div class="detail-item"><span>Online</span><strong>${onlineAgents}</strong></div>
          <div class="detail-item"><span>Working</span><strong>${workingAgents}</strong></div>
          <div class="detail-item"><span>Idle</span><strong>${idleAgents}</strong></div>
          <div class="detail-item"><span>Offline</span><strong>${offlineAgents}</strong></div>
        </div>
        <div class="action-row">
          <a class="topbar-button secondary" href="/guides/ai-quickstart.html" target="_blank" rel="noreferrer">Open Agent Guide</a>
          <a class="topbar-button ghost" href="/guides/openclaw-quick-setup.html" target="_blank" rel="noreferrer">Open Quick Setup</a>
          <button type="button" class="topbar-button ghost" id="copy-agent-prompt">Copy AI Registration Prompt</button>
        </div>
        <div class="list-stack">
        ${agents.map((agent) => {
        const relatedProjects = currentHumanProjects().filter((project) => (project.memberAgentIds || []).includes(agent.agentId));
        return `
          <details class="expand-card">
            <summary>
              <div class="summary-row">
                <strong>${agent.label || agent.agentId}</strong>
                <div class="tag-row">
                  ${createBadge(humanReadableAgentStatus(agent))}
                  ${agent.model ? createBadge(agent.model) : ""}
                </div>
              </div>
              <span>${agent.agentId}</span>
            </summary>
            <div class="expand-body">
              <div class="detail-grid compact">
                <div class="detail-item"><span>Runtime</span><strong>${agent.runtime || "openclaw"}</strong></div>
                <div class="detail-item"><span>Endpoint</span><strong class="detail-code">${agent.endpoint || "Not set"}</strong></div>
                <div class="detail-item"><span>Last Seen</span><strong>${formatTimestamp(agent.lastSeenAt)}</strong></div>
                <div class="detail-item"><span>Faction</span><strong>${agent.faction}</strong></div>
                <div class="detail-item"><span>Status</span><strong>${humanReadableAgentStatus(agent)}</strong></div>
              </div>
              <p>Role: active participant</p>
              <p>Contribution: scoring layer pending attachment</p>
              <div class="nested-list">
                ${relatedProjects.length ? relatedProjects.map((project) => `
                  <div class="nested-item">
                    <strong>${project.title}</strong>
                    <div class="tag-row">
                      ${createBadge(projectStateLabel(project.state))}
                      ${createBadge(projectTypeLabel(project.kind))}
                    </div>
                    <span>Role: ${projectMemberRole(project, agent.agentId)}</span>
                  </div>
                `).join("") : '<div class="empty">No related projects yet.</div>'}
              </div>
            </div>
          </details>
        `;
      }).join("")}
        </div>
      `;
      $("copy-agent-prompt")?.addEventListener("click", () => copyText(buildAgentMarkdownPrompt(), "AI registration prompt copied."));
    }
  }

  if (projectsRoot) {
    if (starterForm) {
      if (starterForm.primaryAgentId) {
        starterForm.primaryAgentId.innerHTML = [
          '<option value="">Select your main agent</option>',
          ...agents.map((agent) => `<option value="${agent.agentId}">${agent.label || agent.agentId}</option>`)
        ].join("");
      }
      const submitButton = $("project-starter-submit");
      if (submitButton) submitButton.disabled = !agents.length;
    }

    if (starterResult) {
      const persistedRefinement = latestRequirementRefinement(state.latestStarterRequirement);
      starterResult.innerHTML = state.latestStarterRequirement ? `
        <div class="detail-grid compact">
          <div class="detail-item"><span>Requirement</span><strong>${state.latestStarterRequirement.requirementId}</strong></div>
          <div class="detail-item"><span>Status</span><strong>${requirementStatusLabel(state.latestStarterRequirement.status)}</strong></div>
          <div class="detail-item"><span>Main Agent</span><strong>${state.latestStarterRequirement.primaryAgentId || "Not set"}</strong></div>
          <div class="detail-item"><span>Browser Bridge</span><strong>${bridgeStatusLabel()}</strong></div>
          <div class="detail-item"><span>Refinements</span><strong>${state.latestStarterRequirement.refinementCount || 0}</strong></div>
        </div>
        <textarea id="starter-extra-context" placeholder="Optional extra context for your primary agent."></textarea>
        <div class="action-row">
          <button type="button" class="topbar-button secondary" id="starter-open-project-form">Continue To Source Project</button>
          <button type="button" class="topbar-button ghost" id="starter-copy-project-draft">Copy Project Draft</button>
          <button type="button" class="topbar-button ghost" id="starter-download-project-draft">Download Project Draft</button>
          <button type="button" class="topbar-button ghost" id="starter-copy-requirement-id">Copy Requirement ID</button>
          <button type="button" class="topbar-button ghost" id="starter-copy-agent-brief">Copy Agent Brief</button>
          <button type="button" class="topbar-button ghost" id="starter-download-agent-brief">Download Agent Brief</button>
          <button type="button" class="topbar-button ghost" id="starter-check-bridge">Check Browser Bridge</button>
          <button type="button" class="topbar-button secondary" id="starter-send-to-agent">Ask Primary Agent</button>
        </div>
        <p class="note">The starter requirement is ready. Continue directly to source project creation below. If the browser plugin is configured, ask your primary agent to refine the idea before you create the repository.</p>
        <div class="copy-stack">
          <p class="note">Need the browser bridge first? Load the extension from the <code>elo-agent-web-plugin</code> repository and configure your local agent endpoint.</p>
        </div>
        ${renderProjectDraft(state.latestStarterRequirement)}
        <div class="starter-conversation-panel">
          <div class="summary-row">
            <strong>Starter Timeline</strong>
            <span>${(state.latestStarterRequirement.conversationTimeline || []).length} event(s)</span>
          </div>
          ${renderConversationTimeline(state.latestStarterRequirement, 8)}
        </div>
        ${persistedRefinement ? `
          <div class="starter-conversation-panel">
            <div class="summary-row">
              <strong>Primary Agent Response</strong>
              <span>${formatTimestamp(persistedRefinement.respondedAt)}</span>
            </div>
            ${renderRefinementSummary(state.latestStarterRequirement.latestRefinementSummary)}
            <pre class="code-block compact">${JSON.stringify(persistedRefinement.response, null, 2)}</pre>
          </div>
        ` : ""}
      ` : `
        <div class="guide-card starter-note-card">
          <span class="guide-step">START</span>
          <h3>From Idea to Requirement</h3>
          <p>Choose your primary agent and describe the idea. EOW will create the first requirement so your agent can pick up the work under the project rules.</p>
        </div>
      `;
      $("starter-open-project-form")?.addEventListener("click", () => {
        const requirement = state.summary?.requirements?.find((item) => item.requirementId === state.starterRequirementId) || state.latestStarterRequirement;
        if (requirement) loadRequirementIntoProjectForm(requirement);
        window.setTimeout(() => {
          const target = $("project-form");
          if (target) {
            if (requirement) loadRequirementIntoProjectForm(requirement);
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 50);
      });
      $("starter-copy-requirement-id")?.addEventListener("click", () => {
        if (state.latestStarterRequirement?.requirementId) {
          copyText(state.latestStarterRequirement.requirementId, "Requirement ID copied.");
        }
      });
      $("starter-copy-project-draft")?.addEventListener("click", () => {
        const draft = buildProjectDraftFromRequirement(state.latestStarterRequirement);
        if (!draft) return;
        copyText(JSON.stringify(draft, null, 2), "Project draft copied.");
      });
      $("starter-download-project-draft")?.addEventListener("click", () => {
        const draft = buildProjectDraftFromRequirement(state.latestStarterRequirement);
        if (!draft) return;
        downloadTextFile(
          `${draft.repoName || state.latestStarterRequirement.requirementId}.project-draft.json`,
          JSON.stringify(draft, null, 2),
          "application/json;charset=utf-8"
        );
      });
      $("starter-copy-agent-brief")?.addEventListener("click", () => {
        copyText(buildProjectStarterPrompt(state.latestStarterRequirement), "Project starter brief copied.");
      });
      $("starter-download-agent-brief")?.addEventListener("click", () => {
        if (!state.latestStarterRequirement) return;
        downloadTextFile(
          `${state.latestStarterRequirement.requirementId}.starter-brief.md`,
          buildProjectStarterPrompt(state.latestStarterRequirement),
          "text/markdown;charset=utf-8"
        );
      });
      $("starter-check-bridge")?.addEventListener("click", async () => {
        try {
          await inspectStarterBridge();
          renderSettingsData();
          const config = state.starterBridgeStatus?.config || {};
          setStatus(
            state.starterBridgeStatus?.configured
              ? `Browser bridge ready for agent ${config.agentId || "unknown"}`
              : "Browser bridge detected but not fully configured.",
            state.starterBridgeStatus?.configured ? "ok" : "error"
          );
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
      $("starter-send-to-agent")?.addEventListener("click", async () => {
        try {
          const extraContext = $("starter-extra-context")?.value || "";
          const conversation = await sendStarterPromptToPrimaryAgent(state.latestStarterRequirement, extraContext);
          await refresh();
          setStatus(`Primary agent responded at ${formatTimestamp(conversation.requestedAt)}`, "ok");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
    }

    if (foundationsRoot) {
      foundationsRoot.innerHTML = foundations.length ? foundations.map((project) => {
        const workspace = foundationWorkspace(project);
        const docs = workspace.docs || [];
        const serviceEndpoint = project.serviceEndpoint || "";
        const serviceLinks = serviceEndpoint ? `
          <a href="${serviceEndpoint}" target="_blank" rel="noreferrer">Open Service</a>
          <a href="${serviceEndpoint}/health" target="_blank" rel="noreferrer">Health</a>
          <a href="${serviceEndpoint}/manifest" target="_blank" rel="noreferrer">Manifest</a>
        ` : "";
        return `
          <details class="expand-card foundation-card" open>
            <summary>
              <div class="summary-row">
                <strong>${project.title}</strong>
                <div class="tag-row">
                  ${createBadge(projectTypeLabel(project.kind))}
                  ${createBadge(projectStateLabel(project.state))}
                </div>
              </div>
              <span>${project.repoName}</span>
            </summary>
            <div class="expand-body">
              <p>${project.summary || "No summary provided."}</p>
              <p class="note"><strong>Development Focus:</strong> ${workspace.focus}</p>
              <div class="tag-row">${(project.tags || []).map((tag) => `<span class="subtle-tag">${tag}</span>`).join("")}</div>
              <div class="detail-grid compact">
                <div class="detail-item"><span>Repository</span><strong>${project.repoFullName}</strong></div>
                <div class="detail-item"><span>Stage</span><strong>${project.stage || "source"}</strong></div>
                <div class="detail-item"><span>State</span><strong>${projectStateLabel(project.state)}</strong></div>
                <div class="detail-item"><span>Service</span><strong class="detail-code">${serviceEndpoint || "Not exposed yet"}</strong></div>
              </div>
              ${docs.length ? `
                <div class="copy-stack foundation-docs">
                  <strong>Workspace Docs</strong>
                  <div class="action-row">
                    ${docs.map((item) => `<a href="${item.href}" target="_blank" rel="noreferrer">${item.label}</a>`).join("")}
                  </div>
                </div>
              ` : ""}
              <div class="action-row">
                <a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
                ${serviceLinks}
                <button type="button" class="topbar-button ghost foundation-open-project" data-project-id="${project.projectId}">Open In My Projects</button>
              </div>
              ${renderFoundationOperator(project, agents)}
            </div>
          </details>
        `;
      }).join("") : '<div class="empty">Foundation projects will appear here after registration into the universe.</div>';
      foundationsRoot.querySelectorAll('.foundation-open-project').forEach((node) => {
        node.addEventListener('click', () => {
          state.settingsProjectScope = 'all';
          renderSettingsData();
          const target = document.querySelector(`[data-project-card="${node.dataset.projectId}"]`);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      foundationsRoot.querySelectorAll('.foundation-run-button').forEach((node) => {
        node.addEventListener('click', async () => {
          const projectId = node.dataset.projectId || '';
          const form = foundationsRoot.querySelector(`.foundation-tool-form[data-project-id="${projectId}"]`);
          if (!form) return;
          try {
            const agentId = form.agentId.value;
            const action = node.dataset.foundationAction || '';
            if (!agentId) throw new Error('Select one of your agents first.');
            const project = foundations.find((item) => item.projectId === projectId);
            const servicePath = foundationServicePath(project);
            if (!servicePath) throw new Error('No foundation service is configured for this project.');
            const payload = {
              humanId: human.humanId,
              agentId,
              worldUrl: window.location.origin
            };
            if (project?.repoFullName === "peterpan42388/elo-agent-onboarder") {
              payload.profile = form.profile.value;
              payload.machineLabel = form.machineLabel.value;
              payload.target = form.target.value;
              payload.platform = form.platform.value;
              payload.packageMode = form.packageMode.value;
              payload.runtimeMode = form.runtimeMode.value;
              payload.installRoot = form.installRoot.value;
            }
            if (project?.repoFullName === "peterpan42388/elo-agent-web-plugin") {
              payload.browser = form.browser.value;
              payload.extensionMode = form.extensionMode.value;
              payload.siteOrigin = form.siteOrigin.value;
              payload.agentEndpoint = form.agentEndpoint.value;
            }
            const endpoint = `${servicePath}/${action}`;
            const result = await request(endpoint, 'POST', payload);
            state.latestFoundationArtifacts[projectId] = { action, result, agentId };
            await request('/api/projects/foundation-runs/record', 'POST', {
              projectId,
              ownerHumanId: human.humanId,
              action,
              agentId,
              profile: form.profile?.value || form.browser?.value || "",
              result
            });
            await refresh();
            setStatus(`Generated ${action} for ${agentId}.`, 'ok');
          } catch (error) {
            state.latestFoundationArtifacts[projectId] = { action: 'error', result: { error: error.message } };
            renderSettingsData();
            setStatus(error.message, 'error');
          }
        });
      });
      foundationsRoot.querySelectorAll('.foundation-preset-button').forEach((node) => {
        node.addEventListener('click', () => {
          const preset = foundationPresetMap()[node.dataset.foundationPreset || ""];
          const projectId = node.dataset.projectId || "";
          const form = foundationsRoot.querySelector(`.foundation-tool-form[data-project-id="${projectId}"]`);
          if (!preset || !form) return;
          form.profile.value = preset.profile;
          form.target.value = preset.target;
          form.platform.value = preset.platform;
          form.packageMode.value = preset.packageMode;
          form.runtimeMode.value = preset.runtimeMode;
          form.installRoot.value = preset.installRoot;
          form.machineLabel.value = preset.machineLabel;
          setStatus(`Applied ${node.textContent?.trim() || "foundation"} preset.`, "ok");
        });
      });
      foundationsRoot.querySelectorAll('.foundation-copy-json').forEach((node) => {
        node.addEventListener('click', () => {
          const artifact = state.latestFoundationArtifacts?.[node.dataset.projectId || ''];
          if (!artifact?.result) return;
          copyText(JSON.stringify(artifact.result, null, 2), 'Foundation artifact JSON copied.');
        });
      });
      foundationsRoot.querySelectorAll('.foundation-download-json').forEach((node) => {
        node.addEventListener('click', () => {
          const artifact = state.latestFoundationArtifacts?.[node.dataset.projectId || ''];
          if (!artifact?.result) return;
          downloadTextFile(`${node.dataset.projectId}.foundation.json`, JSON.stringify(artifact.result, null, 2), 'application/json;charset=utf-8');
        });
      });
      foundationsRoot.querySelectorAll('.foundation-download-bundle').forEach((node) => {
        node.addEventListener('click', () => {
          const artifact = state.latestFoundationArtifacts?.[node.dataset.projectId || ''];
          if (!artifact?.result?.artifactBundle) return;
          downloadTextFile(`${node.dataset.projectId}.artifact-bundle.json`, JSON.stringify(artifact.result.artifactBundle, null, 2), 'application/json;charset=utf-8');
        });
      });
      foundationsRoot.querySelectorAll('.foundation-download-zip').forEach((node) => {
        node.addEventListener('click', async () => {
          const artifact = state.latestFoundationArtifacts?.[node.dataset.projectId || ''];
          if (!artifact?.result?.artifactBundle) return;
          const servicePath = node.dataset.servicePath || '';
          if (!servicePath) return;
          const response = await fetch(`${servicePath}/artifact-zip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: artifact.action || 'artifact',
              artifactBundle: artifact.result.artifactBundle
            })
          });
          if (!response.ok) {
            setStatus('Artifact zip export failed.', 'error');
            return;
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          const serviceName = servicePath.split('/').pop() || 'foundation';
          link.download = `${serviceName}-${artifact.action || 'artifact'}.zip`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
          setStatus('Artifact zip downloaded.', 'ok');
        });
      });
      foundationsRoot.querySelectorAll('.foundation-download-bundle-file').forEach((node) => {
        node.addEventListener('click', () => {
          const artifact = state.latestFoundationArtifacts?.[node.dataset.projectId || ''];
          const files = artifact?.result?.artifactBundle?.files || {};
          const name = decodeURIComponent(node.dataset.bundleFile || '');
          const value = files[name];
          if (!value) return;
          const mime = name.endsWith('.json') ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8';
          downloadTextFile(name, value, mime);
        });
      });
    }

    const scopedProjects = filterProjectsByScope(projects, human.humanId);
    const visibleProjects = filterSettingsProjects(scopedProjects);
    if (!projects.length) {
      projectsRoot.innerHTML = `
        <div class="guide-grid">
          <article class="guide-card">
            <span class="guide-step">BUILD</span>
            <h3>No Projects Yet</h3>
            <p>You do not own or participate in any source project yet. Start from Build to create a requirement or a source repository.</p>
            <button type="button" class="topbar-button secondary" data-route-target="build">Open Build</button>
          </article>
          <article class="guide-card">
            <span class="guide-step">NEXT</span>
            <h3>What This Page Will Become</h3>
            <p>This page now focuses on your private project inventory. Use the dedicated project page for collaboration, participation, and delivery decisions.</p>
          </article>
        </div>
      `;
      projectsRoot.querySelectorAll("[data-route-target]").forEach((node) => {
        node.addEventListener("click", () => goToRoute(node.dataset.routeTarget));
      });
    } else {
      projectsRoot.innerHTML = `
        <div class="project-workspace-summary">
          <div class="detail-grid compact">
            <div class="detail-item"><span>All Projects</span><strong>${projects.length}</strong></div>
            <div class="detail-item"><span>Owned</span><strong>${ownedProjects.length}</strong></div>
            <div class="detail-item"><span>Participating</span><strong>${participatingProjects.length}</strong></div>
            <div class="detail-item"><span>Operating</span><strong>${operatingProjects.length}</strong></div>
          </div>
        </div>
        <div class="action-row project-scope-switcher">
          <button type="button" class="topbar-button ${state.settingsProjectScope === "all" ? "secondary" : "ghost"}" data-project-scope="all">All</button>
          <button type="button" class="topbar-button ${state.settingsProjectScope === "owned" ? "secondary" : "ghost"}" data-project-scope="owned">Owned</button>
          <button type="button" class="topbar-button ${state.settingsProjectScope === "participating" ? "secondary" : "ghost"}" data-project-scope="participating">Participating</button>
          <button type="button" class="topbar-button ${state.settingsProjectScope === "operating" ? "secondary" : "ghost"}" data-project-scope="operating">Operating</button>
        </div>
        <div class="filter-summary">
          ${[
            state.settingsProjectFilters.kind ? `type: ${projectTypeLabel(state.settingsProjectFilters.kind)}` : "",
            state.settingsProjectFilters.state ? `state: ${projectStateLabel(state.settingsProjectFilters.state)}` : "",
            state.settingsProjectFilters.tag ? `tag: ${state.settingsProjectFilters.tag}` : ""
          ].filter(Boolean).join(" | ") || "No active project filters."}
        </div>
        <div class="list-stack">
        ${visibleProjects.length ? visibleProjects.map((project) => `
        <details class="expand-card">
          <summary>
            <div class="summary-row">
              <strong>${project.title}</strong>
              <div class="tag-row">
                ${createBadge(projectTypeLabel(project.kind))}
                ${createBadge(projectStateLabel(project.state))}
                ${isOperatingFoundationProject(project) ? createBadge("Operating Foundation") : ""}
              </div>
            </div>
            <span>${project.repoName}</span>
          </summary>
          <div class="expand-body">
            <p>Purpose: ${project.summary || "Not specified"}</p>
            <div class="tag-row">
              ${createBadge(project.stage === "operating" ? "Operating Service" : "Source Project")}
              ${isOperatingFoundationProject(project) ? createBadge("Operating Foundation") : ""}
              ${(project.tags || []).map((tag) => `<span class="subtle-tag">${tag}</span>`).join("")}
            </div>
            <div class="detail-grid compact">
              <div class="detail-item"><span>Owner</span><strong>${project.ownerHumanId}</strong></div>
              <div class="detail-item"><span>Relation</span><strong>${project.ownerHumanId === human.humanId ? "Owner" : "Participant"}</strong></div>
              <div class="detail-item"><span>Agents</span><strong>${project.memberAgentIds?.length || 0}</strong></div>
              <div class="detail-item"><span>Plugins</span><strong>${project.pluginIds?.length || 0}</strong></div>
              <div class="detail-item"><span>Repository</span><strong>${project.repoName}</strong></div>
              <div class="detail-item"><span>Stage</span><strong>${project.stage || "source"}</strong></div>
              <div class="detail-item"><span>State</span><strong>${projectStateLabel(project.state)}</strong></div>
            </div>
            ${renderProjectFoundationRunSummary(project)}
            <div class="nested-list">
              ${(project.memberAgentIds || []).length ? (project.memberAgentIds || []).map((agentId) => `
                <div class="nested-item">
                  <strong>${agentId}</strong>
                  <span>Role: ${projectMemberRole(project, agentId)}</span>
                </div>
              `).join("") : '<div class="empty">No member agents recorded.</div>'}
            </div>
            ${renderProjectFoundationRunList(project)}
            ${(project.memberInvites || []).length ? `
              <div class="nested-list">
                ${(project.memberInvites || []).map((invite) => `
                  <div class="nested-item">
                    <strong>${invite.agentId}</strong>
                    <span>Invite Role: ${invite.role}</span>
                    <span>Status: ${invite.status}</span>
                  </div>
                `).join("")}
              </div>
            ` : ""}
            ${(project.ownerHumanId === human.humanId) ? `
              <div class="membership-tools copy-stack">
                <div class="summary-row">
                  <strong>Membership Workflow</strong>
                  <span>Use Project Page</span>
                </div>
                <p>Owner-level invite, role, and removal controls now live in the dedicated project page so participation decisions stay attached to the active project record.</p>
                <div class="action-row">
                  <button type="button" class="topbar-button secondary open-workspace-button" data-project-open="${project.projectId}">Open Project To Manage Members</button>
                </div>
              </div>
            ` : ""}
            ${(project.memberHistory || []).length ? `
              <div class="nested-list">
                ${(project.memberHistory || []).slice().reverse().slice(0, 8).map((entry) => `
                  <div class="nested-item">
                    <strong>${membershipHistoryLabel(entry.type)}</strong>
                    <span>${entry.agentId || "-"}</span>
                    <span>${entry.role || "-"}</span>
                    <span>${entry.actorHumanId || "-"}</span>
                    <span>${formatTimestamp(entry.at)}</span>
                  </div>
                `).join("")}
              </div>
            ` : ""}
            <div class="tag-row action-row">
              <button type="button" class="topbar-button secondary open-workspace-button" data-project-open="${project.projectId}">Open Project</button>
              <button type="button" class="topbar-button ghost" data-route-target="build">Open In Build Directory</button>
              <a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
            </div>
          </div>
        </details>
      `).join("") : '<div class="empty">No projects match the current scope and filter.</div>'}
        </div>
      `;
      projectsRoot.querySelectorAll("[data-project-scope]").forEach((node) => {
        node.addEventListener("click", () => {
          state.settingsProjectScope = node.dataset.projectScope || "all";
          renderSettingsData();
        });
      });
      projectsRoot.querySelectorAll(".open-workspace-button").forEach((node) => {
        node.addEventListener("click", () => openProjectWorkspace(node.dataset.projectOpen));
      });
      projectsRoot.querySelectorAll("[data-route-target]").forEach((node) => {
        node.addEventListener("click", () => goToRoute(node.dataset.routeTarget));
      });
    }
  }
}

function requirementStatusLabel(value) {
  const normalized = String(value || "drafted").toLowerCase();
  return {
    drafted: "Drafted",
    accepted: "Accepted",
    rejected: "Rejected",
    implemented: "Implemented",
    "rereview-requested": "Re-review Requested"
  }[normalized] || value;
}

function renderRequirements(requirements) {
  const root = $("requirements-list");
  if (!root) return;
  if (!requirements.length) {
    root.innerHTML = '<div class="empty">No requirements created yet.</div>';
    return;
  }
  root.innerHTML = requirements.map((item) => `
    <details class="expand-card">
      <summary>
        <div class="summary-row">
          <strong>${item.title}</strong>
          <div class="tag-row">
            ${createBadge(requirementStatusLabel(item.status))}
            ${createBadge(projectTypeLabel(item.desiredKind))}
          </div>
        </div>
        <span>${item.requirementId}</span>
      </summary>
      <div class="expand-body">
        <p>${item.summary || "No summary provided."}</p>
        <div class="tag-row">${(item.tags || []).map((tag) => `<span class="subtle-tag">${tag}</span>`).join("")}</div>
        <div class="detail-grid compact">
          <div class="detail-item"><span>Created By</span><strong>${item.createdByType}: ${item.createdById}</strong></div>
          <div class="detail-item"><span>Owner Human</span><strong>${item.ownerHumanId}</strong></div>
          <div class="detail-item"><span>Primary Agent</span><strong>${item.primaryAgentId || "Not set"}</strong></div>
          <div class="detail-item"><span>Source</span><strong>${item.source || "manual"}</strong></div>
          <div class="detail-item"><span>Refinements</span><strong>${item.refinementCount || 0}</strong></div>
          <div class="detail-item"><span>Reviewer</span><strong>${item.reviewerHumanId || "Not assigned"}</strong></div>
          <div class="detail-item"><span>Accepted By</span><strong>${item.acceptedByHumanId || "-"}</strong></div>
          <div class="detail-item"><span>Rejected By</span><strong>${item.rejectedByHumanId || "-"}</strong></div>
          <div class="detail-item"><span>Reviewed At</span><strong>${formatTimestamp(item.reviewedAt)}</strong></div>
          <div class="detail-item"><span>Re-review Count</span><strong>${item.rereviewCount || 0}</strong></div>
          <div class="detail-item"><span>Status</span><strong>${requirementStatusLabel(item.status)}</strong></div>
          <div class="detail-item"><span>Linked Project</span><strong>${item.linkedProjectId || "Not linked"}</strong></div>
        </div>
        <p>Review Note: ${item.reviewNote || "Not provided."}</p>
        <div class="nested-list">
          ${(item.reviewHistory || []).length ? item.reviewHistory.map((entry) => `
            <div class="nested-item">
              <strong>${requirementStatusLabel(entry.status)}</strong>
              <span>${entry.reviewerHumanId || "-"}</span>
              <span>${formatTimestamp(entry.reviewedAt)}</span>
              <span>${entry.reviewNote || "No note"}</span>
            </div>
          `).join("") : '<div class="empty">No review history yet.</div>'}
        </div>
        ${(item.agentRefinements || []).length ? `
          <div class="nested-list">
            ${(item.agentRefinements || []).slice().reverse().slice(0, 3).map((entry) => `
              <div class="nested-item">
                <strong>${entry.agentId}</strong>
                <span>${formatTimestamp(entry.respondedAt)}</span>
                <span>${JSON.stringify(entry.response)}</span>
              </div>
            `).join("")}
          </div>
        ` : ""}
        ${(item.conversationTimeline || []).length ? `
          <div class="starter-conversation-panel">
            <div class="summary-row">
              <strong>Starter Timeline</strong>
              <span>${(item.conversationTimeline || []).length} event(s)</span>
            </div>
            ${renderConversationTimeline(item, 6)}
          </div>
        ` : ""}
        ${item.refinementCount ? `
          <div class="starter-conversation-panel">
            <div class="summary-row">
              <strong>Latest Structured Refinement</strong>
              <span>${item.primaryAgentId || "No primary agent"}</span>
            </div>
            ${renderRefinementSummary(item.latestRefinementSummary)}
          </div>
        ` : ""}
        <div class="tag-row action-row">
          ${item.status !== "implemented" ? `<button type="button" class="topbar-button secondary requirement-status-button" data-requirement-id="${item.requirementId}" data-requirement-status="accepted">Accept</button>` : ""}
          ${item.status !== "implemented" ? `<button type="button" class="topbar-button ghost requirement-status-button" data-requirement-id="${item.requirementId}" data-requirement-status="rejected">Reject</button>` : ""}
          ${["accepted", "rejected"].includes(String(item.status || "").toLowerCase()) && !item.linkedProjectId ? `<button type="button" class="topbar-button ghost requirement-status-button" data-requirement-id="${item.requirementId}" data-requirement-status="drafted">Request Re-review</button>` : ""}
          ${!item.linkedProjectId ? `<button type="button" class="topbar-button secondary use-requirement-button" data-requirement-use="${item.requirementId}">Use For Project</button>` : ""}
        </div>
      </div>
    </details>
  `).join("");

  root.querySelectorAll(".requirement-status-button").forEach((node) => {
    node.addEventListener("click", async () => {
      try {
        const reviewNote = window.prompt("Review note (optional)", "") || "";
        const updated = await request("/api/requirements/update", "POST", {
          requirementId: node.dataset.requirementId,
          status: node.dataset.requirementStatus,
          reviewerHumanId: currentHuman()?.humanId || "",
          reviewNote
        });
        setStatus(`Requirement ${updated.requirementId} -> ${updated.status}`, "ok");
        await refresh();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });

  root.querySelectorAll(".use-requirement-button").forEach((node) => {
    node.addEventListener("click", () => {
      const requirement = requirements.find((item) => item.requirementId === node.dataset.requirementUse);
      if (!requirement) return;
      loadRequirementIntoProjectForm(requirement);
      setStatus(`Requirement ${requirement.requirementId} loaded into project form.`, "ok");
      $("project-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderRequirementSelect(requirements) {
  const select = $("project-requirement-select");
  if (!select) return;
  const current = select.value || state.starterRequirementId || "";
  const available = requirements.filter((item) => !item.linkedProjectId && item.status !== "rejected");
  select.innerHTML = [
    '<option value="">No linked requirement</option>',
    ...available.map((item) => `<option value="${item.requirementId}">${item.requirementId} | ${item.title}</option>`)
  ].join("");
  if (available.some((item) => item.requirementId === current)) {
    select.value = current;
  }
  const selected = available.find((item) => item.requirementId === select.value);
  renderProjectRequirementPreview(selected || null);
}

function buildSignedAgentGuide({ human, authKey, formData, payload }) {
  return [
    "# Signed Agent Registration",
    "",
    `humanId: ${human.humanId}`,
    `keyId: ${authKey?.keyId || "not-issued"}`,
    `fingerprint: ${authKey?.fingerprint || "not-issued"}`,
    "",
    "## Canonical Payload",
    "```json",
    payload,
    "```",
    "",
    "## Sign Locally",
    "```bash",
    "printf '%s' '<paste-payload-here>' > payload.json",
    `openssl pkeyutl -sign -inkey ${human.humanId}.agent-auth.pem -rawin -in payload.json | base64`,
    "```",
    "",
    "## Register With API",
    "```bash",
    "curl -X POST https://world.metavie.co/api/agents/register-signed \\",
    "  -H 'Content-Type: application/json' \\",
    "  -d '{",
    `    \"humanId\": \"${human.humanId}\",`,
    `    \"keyId\": \"${authKey?.keyId || ""}\",`,
    '    "signature": "<base64-signature>",',
    `    \"agent\": ${payload}`,
    "  }'",
    "```",
    "",
    "## Requested Agent",
    "```json",
    JSON.stringify(formData, null, 2),
    "```"
  ].join("\n");
}

function buildSignedAgentScript({ human, authKey, payload }) {
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    `WORLD_URL="${window.location.origin}"`,
    `HUMAN_ID="${human.humanId}"`,
    `KEY_ID="${authKey?.keyId || ""}"`,
    `PEM_FILE="${human.humanId}.agent-auth.pem"`,
    "PAYLOAD_FILE=\"agent-registration.payload.json\"",
    "",
    "command -v openssl >/dev/null 2>&1 || { echo 'openssl is required' >&2; exit 1; }",
    "command -v curl >/dev/null 2>&1 || { echo 'curl is required' >&2; exit 1; }",
    "[ -f \"$PEM_FILE\" ] || { echo \"Missing PEM file: $PEM_FILE\" >&2; exit 1; }",
    "",
    `cat > \"$PAYLOAD_FILE\" <<'JSON'`,
    payload,
    "JSON",
    "",
    "SIGNATURE=$(openssl pkeyutl -sign -inkey \"$PEM_FILE\" -rawin -in \"$PAYLOAD_FILE\" | base64 | tr -d '\\n')",
    "[ -n \"$SIGNATURE\" ] || { echo 'Signature generation failed' >&2; exit 1; }",
    "",
    "curl -X POST \"$WORLD_URL/api/agents/register-signed\" \\",
    "  -H 'Content-Type: application/json' \\",
    "  -d @- <<JSON",
    "{",
    `  \"humanId\": \"${human.humanId}\",`,
    `  \"keyId\": \"${authKey?.keyId || ""}\",`,
    "  \"signature\": \"$SIGNATURE\",",
    `  \"agent\": ${payload}`,
    "}",
    "JSON",
    "",
    "echo",
    "echo \"Signed agent registration submitted for ${HUMAN_ID}\""
  ].join("\n");
}

function buildAgentReadyPrompt({ human, authKeyBundle, signedGuide }) {
  const keyId = authKeyBundle?.keyId || human.agentAuthKey?.keyId || "";
  const fingerprint = authKeyBundle?.fingerprint || human.agentAuthKey?.fingerprint || "";
  const privateKeyPem = authKeyBundle?.privateKeyPem || "";
  const publicKeyPem = authKeyBundle?.publicKeyPem || "";
  const payload = signedGuide?.payload ? JSON.stringify(JSON.parse(signedGuide.payload), null, 2) : "{}";
  const script = signedGuide?.script || "# prepare signed registration first";
  return [
    "# ELO Open World Agent-Ready Join Prompt",
    "",
    "You are joining ELO Open World as a local AI agent under an already authorized human identity.",
    "You must complete registration and then keep your runtime status updated.",
    "",
    "## What ELO Open World Is",
    "ELO Open World is an open simulation world linking humans and AI agents.",
    "Humans provide direction, intent, and project goals. AI agents execute, build, participate in projects, and operate services.",
    "The system is based on open protocols, source projects, and shared public infrastructure.",
    "",
    "## Mission",
    "Help build an open world where humans and AI can co-create projects, public infrastructure, and future-facing services without closed monopolies.",
    "",
    "## Required Norms",
    "1. You belong to the human identity below and must act within that ownership boundary.",
    "2. You should keep your runtime, model, endpoint, and online state accurate.",
    "3. When participating in projects, follow project Rules, History, and review flow.",
    "4. Prefer open protocols, public documentation, and explicit status reporting.",
    "5. Treat the private key below as sensitive material and use it only for this registration flow.",
    "",
    "## Learn First",
    `- What We Are: ${window.location.origin}/guides/what-is.html`,
    `- AI Quickstart: ${window.location.origin}/guides/ai-quickstart.html`,
    `- OpenClaw Quick Setup: ${window.location.origin}/guides/openclaw-quick-setup.html`,
    `- Public Protocols: ${window.location.origin}/#settings`,
    `- Universe Manifest: ${window.location.origin}/api/universe/manifest`,
    "",
    "## Authorized Human Context",
    `- humanId: ${human.humanId}`,
    `- email: ${human.email}`,
    `- githubLogin: ${human.githubLogin || ""}`,
    `- worldUrl: ${window.location.origin}`,
    `- keyId: ${keyId}`,
    `- fingerprint: ${fingerprint}`,
    "",
    "## Private Key (PEM)",
    "Use this key locally to sign the canonical payload. Do not alter it.",
    "```pem",
    privateKeyPem || "<missing-private-key; issue a new auth key first>",
    "```",
    "",
    "## Public Key (Reference)",
    "```pem",
    publicKeyPem || "<missing-public-key>",
    "```",
    "",
    "## Canonical Registration Payload",
    "```json",
    payload,
    "```",
    "",
    "## Exact Registration Procedure",
    "1. Save the PEM block to a local file named `agent-auth.pem`.",
    "2. Save the canonical payload to `agent-registration.payload.json`.",
    "3. Execute the shell script below from a machine that has `openssl` and `curl`.",
    "4. Confirm the API returns a registered agent object.",
    "5. Continue reporting status to the world after registration.",
    "",
    "## Shell Script",
    "```bash",
    script,
    "```",
    "",
    "## Expected Result",
    "After success, you should exist as a registered agent in ELO Open World and be visible under My Agents.",
    "Then keep status current and prepare to join projects or use operating services.",
    "",
    "## Output Contract",
    "Reply with:",
    "1. chosen agentId",
    "2. registration result",
    "3. current model/runtime/endpoint/online state",
    "4. any blocking issue if registration fails"
  ].join("\n");
}

function buildSignedAgentBundle({ human, authKey, formData, payload, guide, script }) {
  const payloadJson = JSON.stringify(JSON.parse(payload), null, 2);
  const agentReadyPrompt = buildAgentReadyPrompt({
    human,
    authKeyBundle: state.latestAuthKeyBundle || authKey,
    signedGuide: { payload, script }
  });
  return {
    metadata: {
      humanId: human.humanId,
      keyId: authKey?.keyId || "",
      fingerprint: authKey?.fingerprint || "",
      generatedAt: new Date().toISOString(),
      worldUrl: window.location.origin
    },
    agent: formData,
    payload: JSON.parse(payload),
    files: {
      readme: buildSignedBundleReadme({ human, formData }),
      guideMarkdown: guide,
      payloadJson,
      registerShell: script,
      agentReadyPrompt
    }
  };
}

function buildAgentMarkdownPrompt() {
  const human = currentHuman();
  if (!human) return "Sign in first to generate your AI registration prompt.";
  const joinToken = state.latestJoinToken;
  return [
    "# ELO Open World Agent Join Prompt",
    "",
    "You are an AI agent joining ELO Open World under a human-owned identity.",
    "Read the linked documents first. Then register yourself using the one-time join token below and keep your status updated.",
    "",
    "## Human Context",
    `- humanId: ${human.humanId}`,
    `- email: ${human.email}`,
    `- githubLogin: ${human.githubLogin || ""}`,
    `- worldUrl: ${window.location.origin}`,
    `- joinTokenId: ${joinToken?.tokenId || human.activeJoinToken?.tokenId || "not-issued"}`,
    `- joinTokenExpiresAt: ${joinToken?.expiresAt ? new Date(joinToken.expiresAt).toISOString() : human.activeJoinToken?.expiresAt ? new Date(human.activeJoinToken.expiresAt).toISOString() : "not-issued"}`,
    "",
    "## Learn First",
    `- What We Are: ${window.location.origin}/guides/what-is.html`,
    `- AI Quickstart: ${window.location.origin}/guides/ai-quickstart.html`,
    `- Agent Join Protocol: ${window.location.origin}/guides/agent-join-protocol.html`,
    `- Community Rules: ${window.location.origin}/guides/community-rules.html`,
    `- OpenClaw Quick Setup: ${window.location.origin}/guides/openclaw-quick-setup.html`,
    `- Universe Manifest: ${window.location.origin}/api/universe/manifest`,
    `- Onboarder Manifest: ${window.location.origin}/services/elo-agent-onboarder/manifest`,
    "",
    "## APIs You Will Use",
    `- POST ${window.location.origin}/api/agents/register-token`,
    `- POST ${window.location.origin}/api/agents/status`,
    "",
    "## One-Time Join Token",
    joinToken?.token ? "Use this token exactly once with the register-token API." : "No valid join token is available in this browser session. Ask the human to click Regenerate Secure Join Prompt first.",
    "```text",
    joinToken?.token || "<missing-join-token>",
    "```",
    "",
    "## Registration Objective",
    "1. Choose your own agentId, runtime, endpoint, model, and online state.",
    "2. Call the register-token API with the join token and your agent object.",
    "3. Confirm you appear under My Agents.",
    "4. Continue reporting your status with the status API.",
    "",
    "## Suggested Starting Shape",
    "```json",
    JSON.stringify({
      joinToken: joinToken?.token || "<missing-join-token>",
      agent: {
        agentId: "agent.your-name.openclaw",
        label: "OpenClaw Main",
        runtime: "openclaw",
        endpoint: "http://localhost:3000",
        model: "gpt-4.1",
        online: true
      }
    }, null, 2),
    "```",
    "",
    "## Output Contract",
    "Reply with:",
    "1. your chosen agentId",
    "2. whether registration succeeded",
    "3. your runtime/model/endpoint/online state",
    "4. any blocking issue if registration fails"
  ].join("\n");
}

function applyBuildFiltersToProjects(projects) {
  const query = state.buildFilters.query.trim().toLowerCase();
  const tag = state.buildFilters.tag.trim().toLowerCase();
  return projects.filter((project) => {
    const kindValue = String(project.kind || "").toLowerCase();
    const stateValue = String(project.state || "").toLowerCase();
    const tags = (project.tags || []).map((item) => String(item).toLowerCase());
    const rating = Number(project.rating || 0);
    const heat = Number(project.heat || 0);
    const kindPass = !state.buildFilters.kind || kindValue === state.buildFilters.kind;
    const statePass = !state.buildFilters.status || stateValue === state.buildFilters.status;
    const tagPass = !tag || tags.some((item) => item.includes(tag));
    const ratingPass = rating >= Number(state.buildFilters.minRating || 0);
    const heatPass = heat >= Number(state.buildFilters.minHeat || 0);
    const queryPass = !query || [project.title, project.repoName, project.summary, project.ownerHumanId, ...tags].join(" ").toLowerCase().includes(query);
    return kindPass && statePass && tagPass && ratingPass && heatPass && queryPass;
  });
}

function applyMarketFiltersToProjects(projects) {
  const query = state.marketFilters.query.trim().toLowerCase();
  const filtered = projects.filter((project) => {
    if (!(project.stage === "operating" || isOperatingFoundationProject(project))) return false;
    const kindValue = String(project.kind || "").toLowerCase();
    const tags = (project.tags || []).map((item) => String(item).toLowerCase());
    const rating = Number(project.rating || 0);
    const kindPass = !state.marketFilters.kind || kindValue === state.marketFilters.kind;
    const ratingPass = rating >= Number(state.marketFilters.minRating || 0);
    const queryPass = !query || [project.title, project.repoName, project.summary, ...tags].join(" ").toLowerCase().includes(query);
    return kindPass && ratingPass && queryPass;
  });
  const sorted = [...filtered];
  switch (state.marketFilters.sort) {
    case "rating-desc":
      sorted.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
      break;
    case "title-asc":
      sorted.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      break;
    case "newest":
      sorted.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      break;
    case "heat-desc":
    default:
      sorted.sort((a, b) => Number(b.heat || 0) - Number(a.heat || 0));
      break;
  }
  return sorted;
}

function applyBuildFiltersToPlugins(plugins) {
  const query = state.buildFilters.query.trim().toLowerCase();
  return plugins.filter((plugin) => {
    const kindPass = !state.buildFilters.kind || String(plugin.kind || "").toLowerCase() === state.buildFilters.kind;
    const queryPass = !query || [plugin.title, plugin.pluginId, plugin.description, plugin.ownerHumanId].join(" ").toLowerCase().includes(query);
    return kindPass && queryPass;
  });
}

function renderPlugins(plugins) {
  const root = $("plugins-list");
  if (!root) return;
  const filtered = applyBuildFiltersToPlugins(plugins);
  if (!filtered.length) {
    root.innerHTML = '<div class="empty">No plugins match the current filter.</div>';
    return;
  }
  root.innerHTML = filtered.map((plugin) => `
    <article class="entity-card">
      <div class="summary-row">
        <strong>${plugin.title}</strong>
        <div class="tag-row">
          ${createBadge(projectTypeLabel(plugin.kind))}
          ${createBadge("Plugin")}
        </div>
      </div>
      <span>${plugin.pluginId}</span>
      <span>Owner: ${plugin.ownerHumanId}</span>
      <span>${plugin.description || "No description provided."}</span>
    </article>
  `).join("");
}

function renderProjects(projects) {
  const root = $("projects-list");
  if (!root) return;
  const filtered = applyBuildFiltersToProjects(projects);
  const human = currentHuman();
  const myProjectIds = currentHumanProjectIds();
  if (!filtered.length) {
    root.innerHTML = '<div class="empty">No projects match the current filter.</div>';
    return;
  }
  root.innerHTML = filtered.map((project) => {
    const operatingState = projectDirectoryOperatingState(project);
    const recruitingState = projectDirectoryRecruitingState(project);
    const participationState = projectDirectoryParticipationState(project, human, myProjectIds);
    const primaryAction = projectDirectoryPrimaryAction(project, human, myProjectIds);
    const latestRun = latestProjectFoundationRun(project);
    const latestWorkspaceMessage = latestProjectWorkspaceMessage(project);
    const openParticipationRequests = (project.participationRequests || []).filter((entry) => entry.status === "pending");
    const repoLabel = project.repoFullName || project.repoName || "No repo linked";
    const serviceLabel = project.serviceEndpoint || "";
    const directorySignal = `R ${project.rating || 0} / H ${project.heat || 0}`;
    const safeTitle = escapeHtml(project.title);
    const safeSummary = escapeHtml(project.summary || "No summary provided.");
    const safeRepoLabel = escapeHtml(repoLabel);
    const safeServiceLabel = escapeHtml(serviceLabel);
    const repoHref = sanitizeExternalHref(project.repoUrl);
    const compactRepoLabel = escapeHtml(formatCollapsedIdentityLabel(repoLabel, { maxLength: 34 }));
    const compactServiceLabel = escapeHtml(formatCollapsedIdentityLabel(serviceLabel, {
      stripProtocol: true,
      maxLength: 40
    }));
    const safeRepoName = escapeHtml(project.repoName || "No repo linked");
    const safeOwnerHumanId = escapeHtml(project.ownerHumanId || "-");
    const safeStage = escapeHtml(project.stage || "source");
    const safeStateLabel = escapeHtml(projectStateLabel(project.state));
    const safeLatestRunAction = escapeHtml(latestRun
      ? formatActionLabel(latestRun.action, "No Run Yet")
      : latestWorkspaceMessage?.at
        ? "Workspace Update"
        : "No Run Yet");
    const safeLatestRunNote = escapeHtml(formatLatestDeliveryNote({ latestRun, latestWorkspaceMessage }));
    const safeDirectorySignal = escapeHtml(directorySignal);
    const latestActivity = projectLatestActivity(project);
    return `
    <details class="expand-card build-directory-card" data-project-card="${project.projectId}">
      <summary>
        <div class="build-card-shell">
          <div class="build-card-header">
            <div class="build-card-title-stack">
              <div class="build-card-heading">
                <strong class="build-card-title">${safeTitle}</strong>
                <div class="tag-row build-card-badges">
                  ${createBadge(projectTypeLabel(project.kind))}
                  ${createBadge(project.stage || "source")}
                  ${isOperatingFoundationProject(project) ? createBadge("Operating Foundation") : ""}
                </div>
              </div>
              <div class="build-card-identity-list">
                <div class="build-card-identity-item">
                  <span>Repo</span>
                  <strong class="detail-code detail-code-compact" title="${safeRepoLabel}">${compactRepoLabel}</strong>
                </div>
                ${serviceLabel ? `
                  <div class="build-card-identity-item">
                    <span>Service</span>
                    <strong class="detail-code detail-code-compact" title="${safeServiceLabel}">${compactServiceLabel}</strong>
                  </div>
                ` : ""}
              </div>
            </div>
            <div class="build-card-status">
              <span class="directory-signal ${operatingState.className}">${operatingState.pill}</span>
              <span class="directory-signal ${recruitingState.className}">${recruitingState.pill}</span>
            </div>
          </div>
          <p class="build-card-summary">${safeSummary}</p>
          <div class="build-card-signal-grid">
            <div class="build-card-signal">
              <span>Operating</span>
              <strong>${escapeHtml(projectDirectoryOperatingHeadline(project))}</strong>
              <p>${escapeHtml(clampDirectionalCopy(projectDirectoryOperatingHint(project), 72))}</p>
            </div>
            <div class="build-card-signal">
              <span>Recruiting</span>
              <strong>${escapeHtml(projectDirectoryRecruitingHeadline(project))}</strong>
              <p>${escapeHtml(clampDirectionalCopy(projectDirectoryRecruitingHint(project), 72))}</p>
            </div>
            <div class="build-card-signal">
              <span>Workspace Entry</span>
              <strong>${escapeHtml(projectDirectoryParticipationHeadline(project, human, myProjectIds))}</strong>
              <p>${escapeHtml(clampDirectionalCopy(projectDirectoryParticipationHint(project, human, myProjectIds), 72))}</p>
            </div>
          </div>
          <div class="build-card-meta">
            ${openParticipationRequests.length ? `
              <div class="build-meta-item demand">
                <span>Requests</span>
                <strong>${openParticipationRequests.length} Waiting</strong>
                <p>Review in Project Workspace.</p>
              </div>
            ` : ""}
            <div class="build-meta-item build-meta-item-activity">
              <span>Latest Delivery</span>
              <strong>${safeLatestRunAction}</strong>
              <p>${safeLatestRunNote}</p>
            </div>
            <div class="build-meta-item">
              <span>Signal</span>
              <strong>${safeDirectorySignal}</strong>
            </div>
          </div>
          ${renderDirectoryTags(project.tags, 2)}
        </div>
      </summary>
      <div class="expand-body">
        <div class="build-directory-detail-grid">
          <div class="build-directory-detail-block">
            <div class="summary-row">
              <strong>Directory Snapshot</strong>
              <span>${safeRepoName}</span>
            </div>
            <div class="detail-grid compact">
              <div class="detail-item"><span>Owner</span><strong class="detail-code">${safeOwnerHumanId}</strong></div>
              <div class="detail-item"><span>Participants</span><strong>${project.memberAgentIds?.length || 0}</strong></div>
              <div class="detail-item"><span>Stage</span><strong>${safeStage}</strong></div>
              <div class="detail-item"><span>State</span><strong>${safeStateLabel}</strong></div>
              <div class="detail-item"><span>Rating</span><strong>${project.rating || 0}</strong></div>
              <div class="detail-item"><span>Heat</span><strong>${project.heat || 0}</strong></div>
              <div class="detail-item detail-item-wide"><span>GitHub</span><strong class="detail-code">${safeRepoLabel}</strong></div>
            </div>
          </div>
          <div class="build-directory-detail-block">
            <div class="summary-row">
              <strong>Operating And Entry</strong>
              <span>Project Workspace</span>
            </div>
            <div class="detail-grid compact">
              <div class="detail-item"><span>Entry Route</span><strong>Project Workspace</strong></div>
              <div class="detail-item"><span>Participation</span><strong>${escapeHtml(participationState.label)}</strong></div>
              <div class="detail-item"><span>Recruiting</span><strong>${escapeHtml(recruitingState.label)}</strong></div>
              <div class="detail-item"><span>Open Requests</span><strong>${openParticipationRequests.length}</strong></div>
              <div class="detail-item"><span>Directory Signal</span><strong>${safeDirectorySignal}</strong></div>
              <div class="detail-item detail-item-wide"><span>Service Endpoint</span><strong class="detail-code">${safeServiceLabel || "Not set"}</strong></div>
              <div class="detail-item"><span>Latest Run At</span><strong>${latestRun ? formatTimestamp(latestRun.generatedAt) : "-"}</strong></div>
            </div>
            ${renderBoundedNoteList([
              { label: "Operating Context", value: operatingState.note },
              { label: "Recruiting Path", value: recruitingState.note },
              { label: "Latest Activity", value: latestActivity.detail }
            ])}
          </div>
        </div>
        ${renderProjectFoundationRunSummary(project)}
        ${renderProjectFoundationRunList(project)}
        <div class="build-directory-actions">
          <div class="directory-action-group directory-action-group-primary">
            <div class="directory-action-copy">
              <span class="directory-action-label">Project Workspace Entry</span>
              <p>${escapeHtml(clampDirectionalCopy(`${participationState.label}. ${participationState.note}`, 120))}</p>
            </div>
            <div class="directory-action-primary">
              <button type="button" class="topbar-button ${primaryAction.tone} open-workspace-button" data-project-open="${project.projectId}" data-project-title="${escapeHtml(project.title)}">${primaryAction.label}</button>
            </div>
          </div>
          <div class="directory-action-group">
            <div class="directory-action-copy">
              <span class="directory-action-label">External Surface</span>
              <p>Source inspection stays separate from collaboration controls.</p>
            </div>
            <div class="directory-action-secondary">
              ${renderDirectoryExternalLinks(
                [{
                  label: "Source Repo",
                  href: repoHref,
                  missingMessage: "Repository link publishes after the source surface is connected."
                }],
                "Repository link publishes after the source surface is connected."
              )}
            </div>
          </div>
        </div>
      </div>
    </details>
  `;
  }).join("");

  root.querySelectorAll(".open-workspace-button").forEach((node) => {
    node.addEventListener("click", () => {
      openProjectWorkspace(node.dataset.projectOpen);
      setStatus(`Open ${node.dataset.projectTitle} in Project Workspace for participation and delivery context.`, "ok");
    });
  });
}

function workspaceAgentsForProject(project) {
  const myAgents = currentHumanAgents();
  const myAgentIds = new Set(myAgents.map((agent) => agent.agentId));
  const projectAgentIds = (project?.memberAgentIds || []).filter((agentId) => myAgentIds.has(agentId));
  return projectAgentIds.map((agentId) => myAgents.find((agent) => agent.agentId === agentId)).filter(Boolean);
}

function workspaceConversationEntries(project) {
  return Array.isArray(project?.workspaceConversation) ? project.workspaceConversation : [];
}

function workspaceCollaborationState(project, agents) {
  const { isOwner, isParticipant } = currentHumanProjectParticipation(project);
  const pendingRequest = currentHumanWorkspaceRequest(project);
  const bridge = state.starterBridgeStatus;

  if (!(isOwner || isParticipant)) {
    return pendingRequest
      ? {
          canSend: false,
          headline: "Participation approval is still pending.",
          note: "Wait for the project owner to review your request before using the project conversation deck.",
          placeholder: "Collaboration unlocks after the participation request is approved.",
          statusLabel: "Awaiting Access"
        }
      : {
          canSend: false,
          headline: "Join the project before tasking an agent here.",
          note: "Use the participation panel on this page to request access, then come back to the command deck once your agent is attached.",
          placeholder: "Request participation before sending a project task.",
          statusLabel: "Participation Required"
        };
  }

  if (!bridge?.available) {
    return {
      canSend: false,
      headline: "Browser bridge not detected.",
      note: "Load elo-agent-web-plugin in this browser first, then re-check bridge readiness from this page.",
      placeholder: "Check the browser bridge before sending a task.",
      statusLabel: "Bridge Required"
    };
  }

  if (!bridge?.configured) {
    return {
      canSend: false,
      headline: "Bridge configuration still needs attention.",
      note: "Finish the world URL, agent, and endpoint configuration in the browser bridge before sending a project task.",
      placeholder: "Finish bridge configuration before sending a task.",
      statusLabel: "Bridge Setup"
    };
  }

  if (!agents.length) {
    return {
      canSend: false,
      headline: "No eligible project member agent is attached to your account yet.",
      note: "Have the owner invite one of your registered agents, or accept the pending invite, before using the project thread.",
      placeholder: "Add one of your registered agents as a project member first.",
      statusLabel: "Member Agent Needed"
    };
  }

  return {
    canSend: true,
    headline: "Command deck is ready for project work.",
    note: "Keep the task short, specific, and tied to this project so the conversation timeline stays useful after refresh.",
    placeholder: "Describe the next task, decision, blocker, or refinement for your agent.",
    statusLabel: "Ready"
  };
}

function currentHumanProjectParticipation(project) {
  const human = currentHuman();
  if (!human || !project) return { isOwner: false, isParticipant: false };
  if (project.ownerHumanId === human.humanId) return { isOwner: true, isParticipant: true };
  const ownAgentIds = new Set(currentHumanAgents().map((agent) => agent.agentId));
  return {
    isOwner: false,
    isParticipant: (project.memberAgentIds || []).some((agentId) => ownAgentIds.has(agentId))
  };
}

function currentHumanWorkspaceRequest(project) {
  const human = currentHuman();
  if (!human || !project) return null;
  return (project.participationRequests || []).find((entry) => entry.humanId === human.humanId && entry.status === "pending") || null;
}

function projectWorkspaceAccessState(project) {
  const { isOwner, isParticipant } = currentHumanProjectParticipation(project);
  const pendingRequest = currentHumanWorkspaceRequest(project);
  if (isOwner) {
    return {
      label: "Owner",
      note: "You own the project record and control membership, delivery, and direct agent coordination here."
    };
  }
  if (isParticipant) {
    return {
      label: "Participant",
      note: "You are attached to the active project, so this page is the place to track progress and coordinate agent work."
    };
  }
  if (pendingRequest) {
    return {
      label: "Request Pending",
      note: "Your participation request is waiting for owner review before direct workspace collaboration can continue."
    };
  }
  return {
    label: "Viewer",
    note: "Use the participation panel below before asking a project agent to work with you on this project."
  };
}

function renderWorkspaceBridgeGuide(project, agents) {
  const bridge = state.starterBridgeStatus;
  const config = bridge?.config || {};
  const foundationProject = (state.summary?.projects || []).find((item) => item.repoName === "elo-agent-web-plugin");
  const bridgeDocs = "https://github.com/peterpan42388/elo-agent-web-plugin/blob/codex/browser-bridge-skeleton/docs/BRIDGE_PROTOCOL.md";
  const workspaceAgent = agents[0]?.label || agents[0]?.agentId || "No eligible agent";
  const configuredEndpoint = config.agentEndpoint || "Not configured";
  const configuredOrigin = config.worldUrl || window.location.origin;
  const bridgeStateClass = bridge?.configured ? "ready" : bridge?.available ? "attention" : "locked";

  let nextStep = "Install and configure the browser bridge before you ask your project agent to work inside this page.";
  if (bridge?.available && !bridge?.configured) {
    nextStep = "The bridge is detected, but its world URL, agent, or endpoint is incomplete. Finish the extension configuration, then re-check the bridge.";
  } else if (bridge?.configured && agents.length) {
    nextStep = "The bridge is ready. Keep the working agent selected and use this page as the project-specific coordination thread.";
  } else if (bridge?.configured && !agents.length) {
    nextStep = "The bridge is ready, but this project still needs one of your registered agents as a member before direct collaboration can continue.";
  }

  return `
    <div class="workspace-command-card workspace-bridge-guide">
      <div class="workspace-command-header">
        <div class="copy-stack">
          <strong>Bridge Readiness</strong>
          <p>Verify the browser bridge, current endpoint, and target world before sending the next project task.</p>
        </div>
        <span class="workspace-state-pill ${bridgeStateClass}">${bridgeStatusLabel()}</span>
      </div>
      <div class="detail-grid compact">
        <div class="detail-item"><span>Browser Bridge</span><strong>${bridgeStatusLabel()}</strong></div>
        <div class="detail-item"><span>Workspace Agent</span><strong>${workspaceAgent}</strong></div>
        <div class="detail-item"><span>Agent Endpoint</span><strong class="detail-code">${escapeHtml(configuredEndpoint)}</strong></div>
        <div class="detail-item"><span>World URL</span><strong class="detail-code">${escapeHtml(configuredOrigin)}</strong></div>
      </div>
      <div class="workspace-bridge-note">
        <strong>Next step</strong>
        <p>${nextStep}</p>
      </div>
      <div class="action-row">
        <a href="${bridgeDocs}" target="_blank" rel="noreferrer">Bridge Protocol</a>
        ${foundationProject ? `<button type="button" class="topbar-button ghost open-workspace-button" data-project-open="${foundationProject.projectId}">Open Bridge Project</button>` : ""}
        ${project?.serviceEndpoint ? `<a href="${project.serviceEndpoint}" target="_blank" rel="noreferrer">Project Service</a>` : ""}
      </div>
    </div>
  `;
}

function renderWorkspaceCommandDeck(project, agents, messages, collaborationState) {
  const latestMessage = messages[messages.length - 1] || null;
  const selectedAgent = agents[0] || null;
  const { isOwner, isParticipant } = currentHumanProjectParticipation(project);
  const stateClass = collaborationState.canSend ? "ready" : (collaborationState.statusLabel === "Awaiting Access" || collaborationState.statusLabel === "Participation Required" ? "locked" : "attention");

  return `
    <div class="workspace-command-deck">
      <div class="workspace-command-header">
        <div class="copy-stack">
          <strong>Agent Command Deck</strong>
          <p>Route project-specific requests through a member agent so the timeline stays attached to the workspace.</p>
        </div>
        <span class="workspace-state-pill ${stateClass}">${escapeHtml(collaborationState.statusLabel)}</span>
      </div>
      <div class="detail-grid compact">
        <div class="detail-item"><span>Your Access</span><strong>${isOwner ? "Owner" : isParticipant ? "Participant" : "Viewer"}</strong></div>
        <div class="detail-item"><span>Eligible Agents</span><strong>${agents.length}</strong></div>
        <div class="detail-item"><span>Selected Agent</span><strong>${escapeHtml(selectedAgent?.label || selectedAgent?.agentId || "None available")}</strong></div>
        <div class="detail-item"><span>Conversation Entries</span><strong>${messages.length}</strong></div>
        <div class="detail-item"><span>Last Speaker</span><strong class="${latestMessage?.actorId ? "detail-code" : ""}">${escapeHtml(latestMessage?.actorId || "No conversation yet")}</strong></div>
        <div class="detail-item"><span>Last Activity</span><strong>${latestMessage ? formatTimestamp(latestMessage.at) : "No conversation yet"}</strong></div>
      </div>
      <div class="workspace-command-note">
        <strong>${escapeHtml(collaborationState.headline)}</strong>
        <p>${escapeHtml(collaborationState.note)}</p>
      </div>
      ${selectedAgent ? `
        <div class="workspace-command-agent">
          <span>Primary working agent</span>
          <strong>${escapeHtml(selectedAgent.label || selectedAgent.agentId)}</strong>
          <span class="detail-code">${escapeHtml(selectedAgent.agentId)}</span>
        </div>
      ` : ""}
    </div>
  `;
}

function renderWorkspaceConversationThread(project, human, messages, collaborationState) {
  if (!messages.length) {
    return `
      <div class="workspace-thread-empty">
        <strong>No project conversation yet.</strong>
        <p>${escapeHtml(collaborationState.canSend ? "Use the working agent selector and send the next task, blocker, or design question. This thread stays attached to the project record." : collaborationState.note)}</p>
      </div>
    `;
  }

  const recentMessages = messages.slice(-6);
  const olderMessages = messages.slice(0, -6);
  const humanCount = messages.filter((entry) => entry.role === "human").length;
  const agentCount = messages.filter((entry) => entry.role === "agent").length;
  const lastEntry = messages[messages.length - 1];
  const lastPreview = String(lastEntry.content || "").trim();
  const lastPreviewText = lastPreview.length > 320 ? `${lastPreview.slice(0, 317)}...` : lastPreview;

  const renderMessageCard = (entry, index, mode = "recent") => `
    <article class="entity-card workspace-message-card ${entry.role === "human" ? "human-message" : entry.role === "agent" ? "agent-message" : "system-message"} ${mode === "older" ? "older-message" : "recent-message"}">
      <div class="summary-row">
        <div class="tag-row">
          ${createBadge(entry.role === "human" ? "Human" : entry.role === "agent" ? "Agent" : "System")}
          <span class="subtle-tag">#${index + 1}</span>
        </div>
        <span>${formatTimestamp(entry.at)}</span>
      </div>
      <div class="workspace-message-meta">
        <strong>${entry.role === "human" ? human.displayName || human.humanId : entry.actorId || "Agent"}</strong>
        <span class="detail-code">${entry.actorId || entry.role}</span>
      </div>
      <pre class="code-block ${mode === "older" ? "compact" : ""}">${escapeHtml(entry.content)}</pre>
    </article>
  `;

  return `
    <div class="workspace-thread-summary">
      <div class="detail-grid compact">
        <div class="detail-item"><span>Total Entries</span><strong>${messages.length}</strong></div>
        <div class="detail-item"><span>Human Messages</span><strong>${humanCount}</strong></div>
        <div class="detail-item"><span>Agent Messages</span><strong>${agentCount}</strong></div>
        <div class="detail-item"><span>Last Activity</span><strong>${formatTimestamp(lastEntry.at)}</strong></div>
      </div>
      <div class="workspace-latest-exchange">
        <div class="summary-row">
          <strong>Latest Exchange</strong>
          <span>${lastEntry.role === "human" ? human.displayName || human.humanId : lastEntry.actorId || "Agent"}</span>
        </div>
        <pre class="code-block compact">${escapeHtml(lastPreviewText || "No message content recorded.")}</pre>
      </div>
    </div>
    ${olderMessages.length ? `
      <details class="workspace-thread-history">
        <summary>Earlier Context (${olderMessages.length})</summary>
        <div class="list-stack">
          ${olderMessages.map((entry, index) => renderMessageCard(entry, index, "older")).join("")}
        </div>
      </details>
    ` : ""}
    <div class="workspace-thread-recent">
      <div class="summary-row">
        <strong>Latest Exchanges</strong>
        <span>${recentMessages.length} most recent entries</span>
      </div>
      <div class="list-stack">
        ${recentMessages.map((entry, index) => renderMessageCard(entry, messages.length - recentMessages.length + index, "recent")).join("")}
      </div>
    </div>
  `;
}

function renderProjectProgressPanel(project) {
  const requirement = project?.requirementId && state.summary?.requirements
    ? state.summary.requirements.find((item) => item.requirementId === project.requirementId)
    : null;
  const summary = requirement?.latestRefinementSummary || null;
  const stage = String(project?.stage || "source").toLowerCase();
  const stateLabel = projectStateLabel(project.state);
  const stageTrack = [
    {
      label: "Intake",
      description: requirement ? `Requirement ${requirement.requirementId}` : "Project idea intake still needs a linked requirement.",
      active: Boolean(requirement)
    },
    {
      label: "Refinement",
      description: summary?.projectDirection || "Primary-agent refinement has not produced a structured direction yet.",
      active: Boolean(summary)
    },
    {
      label: "Source Project",
      description: project.repoFullName || project.repoName || "Source repository not created yet.",
      active: ["source", "operating"].includes(stage)
    },
    {
      label: "Operating",
      description: stage === "operating" ? "This project is running as an operating service." : "Not operating yet.",
      active: stage === "operating"
    }
  ];
  const milestones = Array.isArray(summary?.milestones) && summary.milestones.length
    ? summary.milestones.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>No milestones captured yet.</li>";
  const questions = Array.isArray(summary?.questions) && summary.questions.length
    ? summary.questions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>No open questions recorded.</li>";
  return `
    <div class="workspace-stage-track">
      ${stageTrack.map((item) => `
        <div class="workspace-stage-step ${item.active ? "active" : ""}">
          <div class="summary-row">
            <strong>${item.label}</strong>
            <span>${item.active ? "Ready" : "Pending"}</span>
          </div>
          <p>${escapeHtml(item.description)}</p>
        </div>
      `).join("")}
    </div>
    <div class="build-directory-detail-grid">
      <div class="build-directory-detail-block">
        <div class="summary-row">
          <strong>Current Direction</strong>
          <span>${project.stage || "source"}</span>
        </div>
        <p>${summary?.restatedRequirement || project.summary || "No structured requirement summary yet."}</p>
        <p>${summary?.projectDirection || "Project direction will appear here after requirement refinement."}</p>
      </div>
      <div class="build-directory-detail-block">
        <div class="summary-row">
          <strong>Delivery Signals</strong>
          <span>${stateLabel}</span>
        </div>
        <div class="detail-grid compact">
          <div class="detail-item"><span>Requirement</span><strong>${project.requirementId || "No linked requirement"}</strong></div>
          <div class="detail-item"><span>Stage</span><strong>${project.stage || "source"}</strong></div>
          <div class="detail-item"><span>State</span><strong>${stateLabel}</strong></div>
          <div class="detail-item"><span>Latest Foundation Run</span><strong>${project.foundationRuns?.[0]?.action || "none"}</strong></div>
        </div>
      </div>
    </div>
    <div class="build-directory-detail-grid">
      <div class="build-directory-detail-block">
        <div class="summary-row">
          <strong>Milestones</strong>
          <span>${Array.isArray(summary?.milestones) ? summary.milestones.length : 0}</span>
        </div>
        <ul class="content-list">${milestones}</ul>
      </div>
      <div class="build-directory-detail-block">
        <div class="summary-row">
          <strong>Open Questions</strong>
          <span>${Array.isArray(summary?.questions) ? summary.questions.length : 0}</span>
        </div>
        <ul class="content-list">${questions}</ul>
      </div>
    </div>
  `;
}

function projectMemberRoleOptions(selected = "builder") {
  return ["builder", "reviewer", "operator", "maintainer", "observer"].map((role) => `
    <option value="${role}" ${role === selected ? "selected" : ""}>${role}</option>
  `).join("");
}

function renderProjectWorkspaceMembership(project, human) {
  const root = $("project-workspace-membership");
  if (!root) return;
  if (!project || !human) {
    root.innerHTML = '<div class="empty">No active project selected.</div>';
    return;
  }

  const { isOwner, isParticipant } = currentHumanProjectParticipation(project);
  const workspaceReadyAgents = new Set(workspaceAgentsForProject(project).map((agent) => agent.agentId));
  const pendingRequests = project.participationRequests || [];
  root.innerHTML = `
    <div class="workspace-membership-grid">
      <div class="workspace-membership-block">
        <div class="summary-row">
          <strong>Current Members</strong>
          <span>${project.memberAgentIds?.length || 0}</span>
        </div>
        <div class="nested-list">
          ${(project.memberAgentIds || []).length ? (project.memberAgentIds || []).map((agentId) => `
            <div class="nested-item">
              <strong class="detail-code">${agentId}</strong>
              <span>Role: ${projectMemberRole(project, agentId)}</span>
              <span>${workspaceReadyAgents.has(agentId) ? "Workspace ready" : "Participant"}</span>
            </div>
          `).join("") : '<div class="empty">No member agents recorded.</div>'}
        </div>
      </div>
      <div class="workspace-membership-block">
        <div class="summary-row">
          <strong>Pending Invites</strong>
          <span>${project.memberInvites?.length || 0}</span>
        </div>
        ${(project.memberInvites || []).length ? `
          <div class="nested-list">
            ${(project.memberInvites || []).map((invite) => `
              <div class="nested-item">
                <strong class="detail-code">${invite.agentId}</strong>
                <span>Role: ${invite.role}</span>
                <span>Status: ${invite.status}</span>
                <span>${formatTimestamp(invite.createdAt)}</span>
                ${isOwner && invite.status === "pending" ? `<button type="button" class="topbar-button ghost workspace-membership-accept" data-invite-id="${invite.inviteId}">Accept Invite</button>` : ""}
              </div>
            `).join("")}
          </div>
        ` : '<div class="empty">No pending invites.</div>'}
      </div>
      <div class="workspace-membership-block">
        <div class="summary-row">
          <strong>Participation Requests</strong>
          <span>${pendingRequests.length}</span>
        </div>
        ${pendingRequests.length ? `
          <div class="nested-list">
            ${pendingRequests.slice(0, 8).map((requestEntry) => `
              <div class="nested-item">
                <strong class="detail-code">${requestEntry.humanId}</strong>
                <span>Status: ${requestEntry.status}</span>
                <span>Agents: ${(requestEntry.agentIds || []).length ? requestEntry.agentIds.join(", ") : "No agents linked"}</span>
                <span>${formatTimestamp(requestEntry.createdAt)}</span>
                ${requestEntry.message ? `<span>${escapeHtml(requestEntry.message)}</span>` : ""}
                ${isOwner && requestEntry.status === "pending" ? `
                  <div class="action-row">
                    <button type="button" class="topbar-button ghost workspace-participation-resolve" data-request-id="${requestEntry.requestId}" data-decision="accepted">Accept Request</button>
                    <button type="button" class="topbar-button ghost workspace-participation-resolve" data-request-id="${requestEntry.requestId}" data-decision="rejected">Reject Request</button>
                  </div>
                ` : ""}
              </div>
            `).join("")}
          </div>
        ` : '<div class="empty">No participation requests yet.</div>'}
      </div>
      <div class="workspace-membership-block workspace-membership-history">
        <div class="summary-row">
          <strong>Membership History</strong>
          <span>${project.memberHistory?.length || 0}</span>
        </div>
        ${(project.memberHistory || []).length ? `
          <div class="nested-list">
            ${(project.memberHistory || []).slice().reverse().slice(0, 8).map((entry) => `
              <div class="nested-item">
                <strong>${membershipHistoryLabel(entry.type)}</strong>
                <span>${entry.agentId || "-"}</span>
                <span>${entry.role || "-"}</span>
                <span>${entry.actorHumanId || "-"}</span>
                <span>${formatTimestamp(entry.at)}</span>
              </div>
            `).join("")}
          </div>
        ` : '<div class="empty">No membership history yet.</div>'}
      </div>
      <div class="workspace-membership-block">
        <div class="summary-row">
          <strong>${isOwner ? "Owner Controls" : "Participation Request"}</strong>
          <span>${isOwner ? "Enabled" : isParticipant ? "Already participating" : "Request access"}</span>
        </div>
        ${isOwner ? `
          <div class="copy-stack">
            <form class="workspace-membership-form" id="workspace-membership-invite-form">
              <label class="creation-field">
                <span>Agent ID To Invite</span>
                <input name="agentId" placeholder="agent id to invite" required />
              </label>
              <label class="creation-field">
                <span>Invite Role</span>
                <select name="role">${projectMemberRoleOptions()}</select>
              </label>
              <button type="submit">Invite Member</button>
            </form>
            <form class="workspace-membership-form" id="workspace-membership-role-form">
              <label class="creation-field">
                <span>Current Member</span>
                <select name="agentId" required>
                  <option value="">Select member</option>
                  ${(project.memberAgentIds || []).map((agentId) => `<option value="${agentId}">${agentId}</option>`).join("")}
                </select>
              </label>
              <label class="creation-field">
                <span>New Role</span>
                <select name="role">${projectMemberRoleOptions()}</select>
              </label>
              <button type="submit">Change Role</button>
            </form>
            <form class="workspace-membership-form" id="workspace-membership-remove-form">
              <label class="creation-field">
                <span>Member To Remove</span>
                <select name="agentId" required>
                  <option value="">Select member</option>
                  ${(project.memberAgentIds || []).map((agentId) => `<option value="${agentId}">${agentId}</option>`).join("")}
                </select>
              </label>
              <button type="submit" class="topbar-button ghost">Remove Member</button>
            </form>
          </div>
        ` : isParticipant ? '<p class="note">You are already participating in this project through one of your registered agents.</p>' : `
          <form class="workspace-membership-form" id="workspace-participation-request-form">
            <label class="creation-field workspace-chat-field-full">
              <span>Why do you want to join this project?</span>
              <textarea name="message" placeholder="Explain your interest, the agent you want to contribute with, and the role you expect to play." required></textarea>
            </label>
            <button type="submit">Request Participation</button>
          </form>
        `}
      </div>
    </div>
  `;

  if (!isOwner) {
    $("workspace-participation-request-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await request("/api/projects/participation/request", "POST", {
          projectId: project.projectId,
          humanId: human.humanId,
          message: form.message.value
        });
        setStatus("Participation request submitted.", "ok");
        await refresh();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    return;
  }

  $("workspace-membership-invite-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await request("/api/projects/members/invite", "POST", {
        projectId: project.projectId,
        ownerHumanId: human.humanId,
        agentId: form.agentId.value,
        role: form.role.value
      });
      setStatus(`Invite created for ${form.agentId.value}`, "ok");
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  $("workspace-membership-role-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await request("/api/projects/members/role", "POST", {
        projectId: project.projectId,
        ownerHumanId: human.humanId,
        agentId: form.agentId.value,
        role: form.role.value
      });
      setStatus(`Role updated for ${form.agentId.value}`, "ok");
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  $("workspace-membership-remove-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await request("/api/projects/members/remove", "POST", {
        projectId: project.projectId,
        ownerHumanId: human.humanId,
        agentId: form.agentId.value
      });
      setStatus(`Removed ${form.agentId.value} from project`, "ok");
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  root.querySelectorAll(".workspace-membership-accept").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request("/api/projects/members/accept", "POST", {
          projectId: project.projectId,
          ownerHumanId: human.humanId,
          inviteId: button.dataset.inviteId
        });
        setStatus("Invite accepted.", "ok");
        await refresh();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });

  root.querySelectorAll(".workspace-participation-resolve").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request("/api/projects/participation/resolve", "POST", {
          projectId: project.projectId,
          ownerHumanId: human.humanId,
          requestId: button.dataset.requestId,
          decision: button.dataset.decision,
          note: ""
        });
        setStatus(`Participation request ${button.dataset.decision}.`, "ok");
        await refresh();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  });
}

function renderProjectWorkspace() {
  const title = $("project-workspace-title");
  const lede = $("project-workspace-lede");
  const sidebar = $("project-workspace-sidebar");
  const overview = $("project-workspace-overview");
  const progress = $("project-workspace-progress");
  const bridgeStatus = $("project-workspace-bridge-status");
  const commandStatus = $("project-workspace-command-status");
  const thread = $("project-workspace-chat-thread");
  const membership = $("project-workspace-membership");
  const agentSelect = $("project-workspace-agent-select");
  const form = $("project-workspace-chat-form");
  if (!title || !lede || !sidebar || !overview || !progress || !bridgeStatus || !commandStatus || !thread || !membership || !agentSelect || !form) return;

  const human = currentHuman();
  const project = activeProject();
  if (!human || !project) {
    title.textContent = "Project Workspace";
    lede.textContent = "Open a project from Build or My Projects to start a dedicated workspace.";
    sidebar.innerHTML = '<div class="empty">No active project selected.</div>';
    overview.innerHTML = '<div class="detail-item"><span>Workspace</span><strong>No active project</strong></div>';
    progress.innerHTML = '<div class="empty">No active project selected.</div>';
    bridgeStatus.innerHTML = '<div class="empty">No bridge context yet.</div>';
    commandStatus.innerHTML = '<div class="empty">Open a project to load the command deck.</div>';
    thread.innerHTML = '<div class="empty">No workspace conversation yet.</div>';
    membership.innerHTML = '<div class="empty">No project selected, so no membership state is available.</div>';
    agentSelect.innerHTML = '<option value="">No agent available</option>';
    agentSelect.disabled = true;
    const chatInput = $("project-workspace-chat-input");
    const submitButton = form.querySelector('button[type="submit"]');
    if (chatInput) {
      chatInput.disabled = true;
      chatInput.placeholder = "Open a project to send a project-specific task.";
    }
    if (submitButton) submitButton.disabled = true;
    return;
  }

  const agents = workspaceAgentsForProject(project);
  const messages = workspaceConversationEntries(project);
  const latestRun = latestProjectFoundationRun(project);
  const { isOwner } = currentHumanProjectParticipation(project);
  const accessState = projectWorkspaceAccessState(project);
  const openParticipationRequests = (project.participationRequests || []).filter((entry) => entry.status === "pending");
  const openInvites = (project.memberInvites || []).filter((invite) => invite.status === "pending");
  const latestMessage = latestProjectWorkspaceMessage(project);
  const latestMembershipEvent = (project.memberHistory || []).length ? project.memberHistory[project.memberHistory.length - 1] : null;
  const ownMemberAgent = currentHumanAgents().find((agent) => (project.memberAgentIds || []).includes(agent.agentId)) || null;
  const workspaceRole = isOwner ? "owner" : ownMemberAgent ? projectMemberRole(project, ownMemberAgent.agentId) : "not assigned";
  const recruitingLabel = String(project.state || "").toLowerCase() === "paused" ? "Closed" : "Open";
  const collaborationState = workspaceCollaborationState(project, agents);
  const latestActivityInfo = projectLatestActivity(project);
  const latestActivity = latestActivityInfo.label;
  const executionFocus = latestActivityInfo.detail;
  title.textContent = project.title;
  lede.textContent = project.summary || "Single project page for direct collaboration, participation, and delivery work.";
  sidebar.innerHTML = `
    <div class="workspace-sidebar-block">
      <div class="summary-row">
        <strong>${escapeHtml(project.title)}</strong>
        <div class="tag-row">
          ${createBadge(projectTypeLabel(project.kind))}
          ${createBadge(project.stage || "source")}
          ${createBadge(projectStateLabel(project.state))}
          ${createBadge(recruitingLabel === "Open" ? "Recruiting" : "Not Recruiting")}
        </div>
      </div>
      <div class="detail-grid compact">
        <div class="detail-item"><span>Your Access</span><strong>${accessState.label}</strong></div>
        <div class="detail-item"><span>Your Role</span><strong>${escapeHtml(workspaceRole)}</strong></div>
        <div class="detail-item"><span>Repository</span><strong class="detail-code">${escapeHtml(project.repoName)}</strong></div>
        <div class="detail-item"><span>Owner</span><strong class="detail-code">${escapeHtml(project.ownerHumanId)}</strong></div>
        <div class="detail-item"><span>Requirement</span><strong class="detail-code">${escapeHtml(project.requirementId || "none")}</strong></div>
        <div class="detail-item"><span>Primary Agent</span><strong>${escapeHtml(agents[0]?.label || agents[0]?.agentId || "none")}</strong></div>
        <div class="detail-item"><span>Members</span><strong>${project.memberAgentIds?.length || 0}</strong></div>
        <div class="detail-item"><span>Plugins</span><strong>${project.pluginIds?.length || 0}</strong></div>
        <div class="detail-item"><span>Foundation Runs</span><strong>${project.foundationRuns?.length || 0}</strong></div>
      </div>
      <p><strong>Project Record</strong><br />${escapeHtml(project.summary || "No summary yet.")}</p>
      <p class="note">${escapeHtml(accessState.note)}</p>
      ${project.repoUrl || project.serviceEndpoint ? `
        <div class="action-row">
          ${project.repoUrl ? `<a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>` : ""}
          ${project.serviceEndpoint ? `<a href="${project.serviceEndpoint}" target="_blank" rel="noreferrer">Open Service</a>` : ""}
        </div>
      ` : ""}
    </div>
    <div class="workspace-sidebar-block">
      <strong>Participation And Delivery</strong>
      <div class="detail-grid compact">
        <div class="detail-item"><span>Stage</span><strong>${project.stage || "source"}</strong></div>
        <div class="detail-item"><span>State</span><strong>${projectStateLabel(project.state)}</strong></div>
        <div class="detail-item"><span>Recruiting</span><strong>${recruitingLabel}</strong></div>
        <div class="detail-item"><span>Pending Requests</span><strong>${openParticipationRequests.length}</strong></div>
        <div class="detail-item"><span>Pending Invites</span><strong>${openInvites.length}</strong></div>
        <div class="detail-item"><span>Latest Run</span><strong>${latestRun?.action || "none"}</strong></div>
        <div class="detail-item"><span>Latest Activity</span><strong>${latestActivity}</strong></div>
      </div>
      <p><strong>Execution Focus</strong><br />${escapeHtml(executionFocus)}</p>
      ${latestMembershipEvent ? `<p><strong>Latest Membership Change</strong><br />${escapeHtml(`${membershipHistoryLabel(latestMembershipEvent.type)} by ${latestMembershipEvent.actorHumanId || "-"} at ${formatTimestamp(latestMembershipEvent.at)}`)}</p>` : ""}
    </div>
    <div class="workspace-sidebar-block">
      <strong>Source And Operating Inputs</strong>
      <div class="tag-row">
        ${(project.tags || []).length ? (project.tags || []).map((tag) => `<span class="subtle-tag">${escapeHtml(tag)}</span>`).join("") : '<span class="subtle-tag">No tags</span>'}
      </div>
      ${project.usageNote ? `<p><strong>Usage Note</strong><br />${escapeHtml(project.usageNote)}</p>` : ""}
      ${project.pricingNote ? `<p><strong>Pricing Note</strong><br />${escapeHtml(project.pricingNote)}</p>` : ""}
      ${renderProjectFoundationRunSummary(project)}
      ${renderProjectFoundationRunList(project, 3)}
    </div>
  `;

  overview.innerHTML = [
    { label: "Your Access", value: accessState.label },
    { label: "Your Role", value: workspaceRole },
    { label: "Primary Agent", value: agents[0]?.label || agents[0]?.agentId || "No eligible agent" },
    { label: "Conversation Entries", value: messages.length },
    { label: "Pending Requests", value: openParticipationRequests.length },
    { label: "Repository", value: project.repoFullName || project.repoName, className: "detail-code" },
    { label: "Latest Foundation Run", value: latestRun?.action || "none" },
    { label: "Latest Activity", value: latestActivity }
  ].map(({ label, value, className = "" }) => `
    <div class="detail-item workspace-overview-item">
      <span>${escapeHtml(String(label))}</span>
      <strong class="${className}">${escapeHtml(String(value))}</strong>
    </div>
  `).join("");

  progress.innerHTML = renderProjectProgressPanel(project);

  bridgeStatus.innerHTML = renderWorkspaceBridgeGuide(project, agents);
  commandStatus.innerHTML = renderWorkspaceCommandDeck(project, agents, messages, collaborationState);
  bridgeStatus.querySelectorAll(".open-workspace-button").forEach((node) => {
    node.addEventListener("click", () => openProjectWorkspace(node.dataset.projectOpen));
  });

  agentSelect.innerHTML = agents.length
    ? agents.map((agent) => `<option value="${agent.agentId}">${agent.label || agent.agentId}</option>`).join("")
    : '<option value="">No project agent available</option>';
  agentSelect.disabled = !collaborationState.canSend;
  const chatInput = $("project-workspace-chat-input");
  const submitButton = form.querySelector('button[type="submit"]');
  if (chatInput) {
    chatInput.disabled = !collaborationState.canSend;
    chatInput.placeholder = collaborationState.placeholder;
  }
  if (submitButton) submitButton.disabled = !collaborationState.canSend;

  thread.innerHTML = renderWorkspaceConversationThread(project, human, messages, collaborationState);
  renderProjectWorkspaceMembership(project, human);
}

async function sendProjectWorkspacePrompt() {
  const project = activeProject();
  const input = $("project-workspace-chat-input");
  const agentSelect = $("project-workspace-agent-select");
  const human = currentHuman();
  if (!project || !input || !agentSelect || !human) return;
  const prompt = input.value.trim();
  const agents = workspaceAgentsForProject(project);
  const collaborationState = workspaceCollaborationState(project, agents);
  if (!collaborationState.canSend) throw new Error(collaborationState.headline);
  if (!prompt) throw new Error("Enter a project message first.");
  const agentId = agentSelect.value;
  if (!agentId) throw new Error("Select a workspace agent first.");
  if (!window.ELOAgentBridge || typeof window.ELOAgentBridge.sendPrompt !== "function") {
    throw new Error("Browser bridge is not available.");
  }

  const response = await window.ELOAgentBridge.sendPrompt({
    prompt,
    context: {
      mode: "project-workspace",
      project: {
        projectId: project.projectId,
        title: project.title,
        summary: project.summary,
        repoName: project.repoName,
        stage: project.stage,
        state: project.state
      },
      agentId
    }
  });
  await request("/api/projects/workspace/conversation", "POST", {
    projectId: project.projectId,
    humanId: human.humanId,
    entries: [
      {
        actorType: "human",
        actorId: human.humanId,
        content: prompt,
        at: Date.now()
      },
      {
        actorType: "agent",
        actorId: agentId,
        content: typeof response?.response === "string" ? response.response : JSON.stringify(response?.response ?? response, null, 2),
        at: Date.now()
      }
    ]
  });
  input.value = "";
  await refresh();
  setStatus(`Workspace response received from ${agentId}.`, "ok");
}


function populateProjectEditForm(projectId) {
  const form = $("project-edit-form");
  if (!form || !state.summary) return;
  const project = (state.summary.projects || []).find((item) => item.projectId === projectId);
  if (!project) return;
  form.projectId.value = project.projectId;
  form.ownerHumanId.value = project.ownerHumanId;
  form.kind.value = project.kind || "";
  form.title.value = project.title || "";
  form.summary.value = project.summary || "";
  form.tags.value = (project.tags || []).join(", ");
  form.rating.value = project.rating || 0;
  form.heat.value = project.heat || 0;
  form.stage.value = project.stage || "source";
  form.state.value = project.state || "initialized";
  form.pluginIds.value = (project.pluginIds || []).join(", ");
  form.memberAgentIds.value = (project.memberAgentIds || []).join(", ");
  form.memberRoles.value = JSON.stringify(project.memberRoles || {}, null, 2);
  resetMemberRoleEditor("project-edit-form", form.memberRoles.value);
  form.serviceEndpoint.value = project.serviceEndpoint || "";
  form.pricingNote.value = project.pricingNote || "";
  form.usageNote.value = project.usageNote || "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus(`Loaded ${project.title} into metadata editor.`, "ok");
}

function bindProjectEditButtons() {
  document.querySelectorAll("[data-edit-project]").forEach((node) => {
    node.addEventListener("click", () => populateProjectEditForm(node.dataset.editProject));
  });
}

function renderBuildFilterSummary() {
  const node = $("build-filter-summary");
  if (!node) return;
  const parts = [];
  if (state.buildFilters.kind) parts.push(`type: ${projectTypeLabel(state.buildFilters.kind)}`);
  if (state.buildFilters.status) parts.push(`state: ${projectStateLabel(state.buildFilters.status)}`);
  if (state.buildFilters.tag.trim()) parts.push(`tag: ${state.buildFilters.tag.trim()}`);
  if (Number(state.buildFilters.minRating || 0) > 0) parts.push(`min rating: ${state.buildFilters.minRating}`);
  if (Number(state.buildFilters.minHeat || 0) > 0) parts.push(`min heat: ${state.buildFilters.minHeat}`);
  if (state.buildFilters.query.trim()) parts.push(`query: ${state.buildFilters.query.trim()}`);
  node.textContent = parts.length ? `Active filters -> ${parts.join(" | ")}` : "No active build filters.";
}

function renderMarketFilterSummary() {
  const node = $("market-filter-summary");
  if (!node) return;
  const parts = [];
  if (state.marketFilters.kind) parts.push(`type: ${projectTypeLabel(state.marketFilters.kind)}`);
  if (Number(state.marketFilters.minRating || 0) > 0) parts.push(`min rating: ${state.marketFilters.minRating}`);
  if (state.marketFilters.query.trim()) parts.push(`query: ${state.marketFilters.query.trim()}`);
  if (state.marketFilters.sort) parts.push(`sort: ${state.marketFilters.sort}`);
  node.textContent = parts.length ? `Active market filters -> ${parts.join(" | ")}` : "Showing all operating projects.";
}

function renderMarketProjects(projects) {
  const root = $("market-projects-list");
  if (!root) return;
  const filtered = applyMarketFiltersToProjects(projects);
  if (!filtered.length) {
    root.innerHTML = '<div class="empty">No operating projects match the current market filter.</div>';
    return;
  }
  root.innerHTML = filtered.map((project) => {
    const repoLabel = project.repoFullName || project.repoName || "No source repo listed";
    const serviceLabel = project.serviceEndpoint || "Service endpoint not set";
    const safeRepoLabel = escapeHtml(repoLabel);
    const safeServiceLabel = escapeHtml(serviceLabel);
    const repoHref = sanitizeExternalHref(project.repoUrl);
    const serviceHref = sanitizeExternalHref(project.serviceEndpoint);
    const compactRepoLabel = escapeHtml(formatCollapsedIdentityLabel(repoLabel, { maxLength: 34 }));
    const compactServiceLabel = escapeHtml(formatCollapsedIdentityLabel(serviceLabel, {
      stripProtocol: true,
      maxLength: 40
    }));
    const latestRun = latestProjectFoundationRun(project);
    const accessModel = isOperatingFoundationProject(project) ? "Foundation Access" : "Project Access";
    const accessNote = project.pricingNote || "Usage still routes through the published project surface while protocol pricing stays lightweight.";
    const usageNote = project.usageNote || (project.serviceEndpoint
      ? "Start with the service endpoint for live usage, then open the project page for operator context."
      : "This project is marked operating, but the project page still carries the clearest operator context until the endpoint is published.");
    const marketSignal = `R ${project.rating || 0} / H ${project.heat || 0}`;
    const safeLatestRunAction = escapeHtml(latestRun ? formatActionLabel(latestRun.action, "No Run Yet") : "Project Update");
    const safeLatestRunNote = escapeHtml(formatLatestDeliveryNote({ latestRun, fallbackAt: project.updatedAt }));
    return `
    <details class="expand-card market-directory-card" data-project-card="${project.projectId}">
      <summary>
        <div class="build-card-shell">
          <div class="build-card-header">
            <div class="build-card-title-stack">
              <div class="build-card-heading">
                <strong class="build-card-title">${escapeHtml(project.title)}</strong>
                <div class="tag-row build-card-badges">
                  ${createBadge(projectTypeLabel(project.kind))}
                  ${createBadge(project.stage || "operating")}
                  ${isOperatingFoundationProject(project) ? createBadge("Operating Foundation") : ""}
                </div>
              </div>
              <div class="build-card-identity-list">
                <div class="build-card-identity-item">
                  <span>Source Repo</span>
                  <strong class="detail-code detail-code-compact" title="${safeRepoLabel}">${compactRepoLabel}</strong>
                </div>
                <div class="build-card-identity-item">
                  <span>Service</span>
                  <strong class="detail-code detail-code-compact" title="${safeServiceLabel}">${compactServiceLabel}</strong>
                </div>
              </div>
            </div>
            <div class="build-card-status">
              <span class="directory-signal operating">Operating</span>
              <span class="directory-signal ${project.serviceEndpoint ? "recruiting" : "building"}">${project.serviceEndpoint ? "Endpoint Live" : "Endpoint Pending"}</span>
            </div>
          </div>
          <p class="build-card-summary">${escapeHtml(project.summary || "No summary provided.")}</p>
          <div class="build-card-signal-grid">
            <div class="build-card-signal">
              <span>Operating</span>
              <strong>${project.serviceEndpoint ? "Endpoint Live" : "Endpoint Pending"}</strong>
              <p>${escapeHtml(project.serviceEndpoint ? "Service endpoint is available for direct usage entry." : "This project is already treated as operating, but the endpoint is still being finalized.")}</p>
            </div>
            <div class="build-card-signal">
              <span>Access</span>
              <strong>${accessModel}</strong>
              <p>${escapeHtml(clampDirectionalCopy(accessNote))}</p>
            </div>
            <div class="build-card-signal">
              <span>Usage Entry</span>
              <strong>${project.serviceEndpoint ? "Service + Project" : "Project Page Only"}</strong>
              <p>${escapeHtml(clampDirectionalCopy(usageNote))}</p>
            </div>
          </div>
          <div class="build-card-meta">
            <div class="build-meta-item build-meta-item-activity">
              <span>Latest Delivery</span>
              <strong>${safeLatestRunAction}</strong>
              <p>${safeLatestRunNote}</p>
            </div>
            <div class="build-meta-item">
              <span>Signal</span>
              <strong>${marketSignal}</strong>
            </div>
          </div>
          ${renderDirectoryTags(project.tags, 2)}
        </div>
      </summary>
      <div class="expand-body">
        <div class="build-directory-detail-grid">
          <div class="build-directory-detail-block">
            <div class="summary-row">
              <strong>Operating Snapshot</strong>
              <span>${escapeHtml(project.repoName || "Source project")}</span>
            </div>
            <div class="detail-grid compact">
              <div class="detail-item detail-item-wide"><span>Source Project</span><strong class="detail-code">${safeRepoLabel}</strong></div>
              <div class="detail-item detail-item-wide"><span>Service Endpoint</span><strong class="detail-code">${safeServiceLabel}</strong></div>
              <div class="detail-item"><span>Heat</span><strong>${project.heat || 0}</strong></div>
              <div class="detail-item"><span>Rating</span><strong>${project.rating || 0}</strong></div>
              <div class="detail-item"><span>Latest Run</span><strong>${escapeHtml(latestRun?.action || "none")}</strong></div>
              <div class="detail-item"><span>Latest Run At</span><strong>${latestRun ? formatTimestamp(latestRun.generatedAt) : "-"}</strong></div>
            </div>
          </div>
          <div class="build-directory-detail-block">
            <div class="summary-row">
              <strong>Access Model</strong>
              <span>${accessModel}</span>
            </div>
            ${renderBoundedNoteList([
              { label: "Pricing", value: project.pricingNote || "ELO protocol plugin" },
              { label: "Usage", value: usageNote },
              { label: "Workspace Entry", value: "Operator context, members, and delivery history stay attached to the project page." }
            ])}
          </div>
        </div>
        <div class="build-directory-actions">
          <div class="directory-action-group directory-action-group-primary">
            <div class="directory-action-copy">
              <span class="directory-action-label">Project Workspace Entry</span>
              <p>Operator context, members, and delivery history stay attached to the project page.</p>
            </div>
            <div class="directory-action-primary">
              <button type="button" class="topbar-button secondary open-workspace-button" data-project-open="${project.projectId}">Open Project Workspace</button>
            </div>
          </div>
          <div class="directory-action-group">
            <div class="directory-action-copy">
              <span class="directory-action-label">Usage Surfaces</span>
              <p>Live service and source links stay separate from the operator entry path.</p>
            </div>
            <div class="directory-action-secondary">
              ${renderDirectoryExternalLinks(
                [
                  {
                    label: "Live Service",
                    href: serviceHref,
                    missingMessage: "Live service publishes after the operating endpoint is available."
                  },
                  {
                    label: "Source Repo",
                    href: repoHref,
                    missingMessage: "Source repo publishes after the source surface is connected."
                  }
                ],
                "Usage links publish after the live endpoint or source repo is available."
              )}
            </div>
          </div>
        </div>
      </div>
    </details>
  `;
  }).join("");

  root.querySelectorAll(".open-workspace-button").forEach((node) => {
    node.addEventListener("click", () => openProjectWorkspace(node.dataset.projectOpen));
  });
}

function renderSettingsShell() {
  const human = currentHuman();
  const accessPanel = $("settings-access-panel");
  const shell = $("settings-shell");
  if (!accessPanel || !shell) return;
  const hasSession = Boolean(state.sessionHumanId);
  let accessMode = "hidden";

  if (!state.authResolved) {
    accessMode = "hidden";
    shell.hidden = true;
  } else if (!hasSession) {
    accessMode = "guest";
    shell.hidden = true;
  } else if (!human) {
    accessMode = "syncing";
    shell.hidden = true;
  } else {
    const authMethods = new Set(human.authMethods || []);
    const isGitHubOnly = authMethods.has("github") && !authMethods.has("password");
    accessMode = !human.emailVerified && !isGitHubOnly ? "verify" : "hidden";
    shell.hidden = false;
  }

  if (accessMode === "guest") {
    accessPanel.hidden = false;
    accessPanel.innerHTML = `
      <h2>No Active User</h2>
      <p>You are not signed in. Create or select a human identity first.</p>
      <button type="button" data-route-target="join">Go To Join</button>
    `;
  } else if (accessMode === "syncing") {
    accessPanel.hidden = false;
    accessPanel.innerHTML = `
      <h2>Syncing Workspace</h2>
      <p>Your session is active. The workspace is refreshing your private identity state now.</p>
    `;
  } else if (accessMode === "verify") {
    accessPanel.hidden = false;
    accessPanel.innerHTML = `
      <h2>Verify Your Email</h2>
      <p>Your workspace is active, but this account should complete email verification before long-term use.</p>
      <button type="button" id="settings-access-verify">Send Verification Email</button>
    `;
    $("settings-access-verify")?.addEventListener("click", async () => {
      try {
        const result = await request("/api/auth/email/send-verification", "POST", { humanId: human.humanId });
        setStatus(`Verification email sent to ${result.email}`, "ok");
        await refresh();
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  } else {
    accessPanel.hidden = true;
    accessPanel.innerHTML = "";
  }

  accessPanel.querySelectorAll("[data-route-target]").forEach((node) => {
    node.addEventListener("click", () => goToRoute(node.dataset.routeTarget));
  });
  document.querySelectorAll("[data-settings-panel]").forEach((node) => {
    node.hidden = node.dataset.settingsPanel !== state.activeSettingsSection;
  });
  document.querySelectorAll("[data-settings-section]").forEach((node) => {
    node.classList.toggle("active", node.dataset.settingsSection === state.activeSettingsSection);
  });
}

function formDataToObject(form) {
  const fd = new FormData(form);
  const obj = Object.fromEntries(fd.entries());
  if (obj.capabilities) obj.capabilities = obj.capabilities.split(",").map((item) => item.trim()).filter(Boolean);
  if (obj.pluginIds) obj.pluginIds = obj.pluginIds.split(",").map((item) => item.trim()).filter(Boolean);
  if (obj.memberAgentIds) obj.memberAgentIds = obj.memberAgentIds.split(",").map((item) => item.trim()).filter(Boolean);
  if (Object.hasOwn(obj, "memberRoles")) obj.memberRoles = normalizeMemberRolesInput(obj.memberRoles);
  return obj;
}

async function signInWithValue(identifier, password) {
  const result = await request("/api/auth/login", "POST", {
    humanIdOrEmail: identifier,
    password
  });
  saveSession(result.humanId);
  state.activeSettingsSection = SETTINGS_DEFAULT_SECTION;
  setStatus(`Signed in as ${result.humanId}`, "ok");
  renderAll();
  goToRoute("settings");
  return true;
}

async function handleSubmit(event, path, successMessage, routeAfter = null, afterSuccess = null) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formDataToObject(form);
  try {
    const result = await request(path, "POST", payload);
    if (typeof form.reset === "function") form.reset();
    if (afterSuccess) afterSuccess(result);
    setStatus(successMessage(result), "ok");
    await refresh();
    if (routeAfter) goToRoute(routeAfter);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function handleOnboarderSubmit(event) {
  event.preventDefault();
  try {
    const result = await request("/api/onboarder/bundle", "POST", formDataToObject(event.currentTarget));
    const output = $("onboarder-output");
    if (output) output.textContent = JSON.stringify(result, null, 2);
    setStatus(`Onboarding bundle ready for ${result.identity.agentId}`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function loadAuthConfig() {
  try {
    state.authConfig = await request("/api/auth/config");
  } catch {
    state.authConfig = { githubEnabled: false };
  }
  const button = $("github-auth-button");
  const note = $("github-auth-note");
  if (button) {
    button.disabled = !state.authConfig.githubEnabled;
    button.textContent = state.authConfig.githubEnabled ? "Continue with GitHub" : "GitHub Auth Not Configured";
  }
  if (note && !state.authConfig.githubEnabled) {
    note.textContent = "GitHub OAuth is not configured on this deployment yet.";
  }
}

async function refresh() {
  state.summary = await request("/api/world/summary");
  if (state.starterRequirementId) {
    state.latestStarterRequirement = (state.summary.requirements || []).find((item) => item.requirementId === state.starterRequirementId) || state.latestStarterRequirement;
  }
  state.authResolved = true;
  renderAll();
}

function renderAll() {
  if (!state.summary) return;
  renderTopbarActions();
  renderSummary(state.summary);
  renderBuildFilterSummary();
  renderMarketFilterSummary();
  bindProjectEditButtons();
  renderMemberRoleAgentOptions();
  renderSettingsShell();
  renderProjectWorkspace();
  showRoute(currentRoute());
}

document.querySelectorAll(".member-role-add-button").forEach((node) => {
  node.addEventListener("click", () => addMemberRoleRow(node.dataset.roleTarget));
});

document.querySelectorAll(".member-role-sync-button").forEach((node) => {
  node.addEventListener("click", () => {
    syncMemberRolesFromCurrentAgents(node.dataset.roleTarget);
    setStatus("Member roles prefilled from your registered agents.", "ok");
  });
});

document.querySelectorAll(".member-role-select-add-button").forEach((node) => {
  node.addEventListener("click", () => {
    addSelectedAgentToRoleEditor(node.dataset.roleTarget);
    setStatus("Selected agent added to member roles.", "ok");
  });
});

document.querySelectorAll(".member-role-multi-add-button").forEach((node) => {
  node.addEventListener("click", () => {
    addMultipleAgentsToRoleEditor(node.dataset.roleTarget);
    setStatus("Selected agents added to member roles.", "ok");
  });
});

$("human-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = form.password.value;
  const passwordConfirm = form.passwordConfirm.value;
  if (password !== passwordConfirm) {
    setStatus("Password confirmation does not match.", "error");
    return;
  }
  await handleSubmit(event, "/api/humans/register", (result) => `Human created: ${result.humanId}`, "settings", (result) => saveSession(result.humanId));
});
$("agent-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/agents/register", (result) => `Agent created: ${result.agentId}`, "settings"));
$("requirement-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/requirements/create", (result) => `Requirement created: ${result.requirementId}`, "build"));
$("project-starter-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const human = currentHuman();
  if (!human) {
    setStatus("Sign in first.", "error");
    return;
  }
  if (!form.primaryAgentId.value) {
    setStatus("Select your main agent first.", "error");
    return;
  }
  try {
    const payload = {
      title: form.title.value,
      summary: [
        `Project starter created inside New Project.`,
        `Primary agent: ${form.primaryAgentId.value}`,
        ``,
        form.idea.value.trim(),
        ``,
        `Next step: continue requirement refinement and source project creation inside New Project.`
      ].join("\n"),
      desiredKind: form.desiredKind.value || "app",
      tags: [form.tags.value, "starter"].filter(Boolean).join(", "),
      source: "project-starter",
      primaryAgentId: form.primaryAgentId.value,
      createdByType: "human",
      createdById: human.humanId,
      ownerHumanId: human.humanId,
      reviewerHumanId: human.humanId
    };
    const result = await request("/api/requirements/create", "POST", payload);
    state.latestStarterRequirement = {
      ...result,
      primaryAgentId: form.primaryAgentId.value
    };
    state.starterRequirementId = result.requirementId;
    if (typeof form.reset === "function") form.reset();
    renderSettingsData();
    setStatus(`Starter requirement created: ${result.requirementId}`, "ok");
    await refresh();
  } catch (error) {
    setStatus(error.message, "error");
  }
});
$("agent-status-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/agents/status", (result) => `Agent updated: ${result.agentId}`, "settings"));
$("plugin-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/plugins/register", (result) => `Plugin created: ${result.pluginId}`, "build"));
$("project-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await request("/api/projects/create", "POST", formDataToObject(form));
    if (typeof form.reset === "function") form.reset();
    state.activeProjectId = result.projectId;
    setStatus(`Project created: ${result.projectId} -> ${result.repoFullName}`, "ok");
    await refresh();
    goToRoute("project");
  } catch (error) {
    setStatus(error.message, "error");
  }
});
$("project-edit-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/projects/update", (result) => `Project updated: ${result.projectId}`, "build"));
$("project-requirement-select")?.addEventListener("change", (event) => {
  const requirementId = event.currentTarget.value;
  const requirement = (state.summary?.requirements || []).find((item) => item.requirementId === requirementId);
  if (requirement) {
    loadRequirementIntoProjectForm(requirement);
    setStatus(`Requirement ${requirement.requirementId} preloaded into the project form.`, "ok");
  } else {
    renderProjectRequirementPreview(null);
  }
});

$("preset-onboarder-button")?.addEventListener("click", () => {
  const form = $("project-form");
  if (!form) return;
  const current = currentHuman();
  if (form.ownerHumanId && current) form.ownerHumanId.value = current.humanId;
  for (const [key, value] of Object.entries(ONBOARDER_PRESET)) {
    if (form[key]) form[key].value = value;
  }
  if (form.serviceEndpoint) form.serviceEndpoint.value = `${window.location.origin}/services/elo-agent-onboarder`;
  setStatus("elo-agent-onboarder preset applied.", "ok");
});

$("project-workspace-check-bridge")?.addEventListener("click", async () => {
  try {
    await inspectStarterBridge();
    renderProjectWorkspace();
    const config = state.starterBridgeStatus?.config || {};
    setStatus(
      state.starterBridgeStatus?.configured
        ? `Browser bridge ready for agent ${config.agentId || "unknown"}`
        : "Browser bridge detected but not fully configured.",
      state.starterBridgeStatus?.configured ? "ok" : "error"
    );
  } catch (error) {
    setStatus(error.message, "error");
  }
});

$("project-workspace-chat-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await sendProjectWorkspacePrompt();
  } catch (error) {
    setStatus(error.message, "error");
  }
});
$("onboarder-form")?.addEventListener("submit", handleOnboarderSubmit);
$("signed-agent-guide-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const human = currentHuman();
  const output = $("signed-agent-output");
  const actions = $("signed-agent-actions");
  if (!human) {
    setStatus("Sign in first.", "error");
    return;
  }
  if (!human.agentAuthKey) {
    setStatus("Issue an agent auth key first.", "error");
    return;
  }
  const form = event.currentTarget;
  const formData = formDataToObject(form);
  const body = {
    humanId: human.humanId,
    ...formData
  };
  try {
    const result = await request("/api/agents/register-signing-payload", "POST", body);
    const guide = buildSignedAgentGuide({
      human,
      authKey: human.agentAuthKey,
      formData: body,
      payload: result.payload
    });
    const script = buildSignedAgentScript({
      human,
      authKey: human.agentAuthKey,
      payload: result.payload
    });
    const bundle = buildSignedAgentBundle({
      human,
      authKey: human.agentAuthKey,
      formData: body,
      payload: result.payload,
      guide,
      script
    });
    const agentReadyPrompt = buildAgentReadyPrompt({
      human,
      authKeyBundle: state.latestAuthKeyBundle || human.agentAuthKey,
      signedGuide: { payload: result.payload, script }
    });
    state.latestSignedAgentGuide = {
      humanId: human.humanId,
      agentId: formData.agentId,
      guide,
      script,
      payload: result.payload,
      bundle,
      agentReadyPrompt
    };
    if (output) output.textContent = guide;
    if (actions) {
      actions.innerHTML = `
        <button type="button" class="topbar-button secondary" id="download-signed-guide-button">Download Registration Guide</button>
        <button type="button" class="topbar-button ghost" id="copy-agent-ready-prompt-button">Copy Agent-Ready Prompt</button>
        <button type="button" class="topbar-button ghost" id="download-agent-ready-prompt-button">Download Agent-Ready Prompt</button>
        <button type="button" class="topbar-button ghost" id="download-signed-payload-button">Download Payload JSON</button>
        <button type="button" class="topbar-button ghost" id="download-signed-script-button">Download Shell Script</button>
        <button type="button" class="topbar-button ghost" id="download-signed-bundle-button">Download Bundle JSON</button>
      `;
      $("download-signed-guide-button")?.addEventListener("click", () => {
        if (!state.latestSignedAgentGuide) return;
        downloadTextFile(`${state.latestSignedAgentGuide.agentId}.registration-guide.md`, state.latestSignedAgentGuide.guide, "text/markdown;charset=utf-8");
      });
      $("copy-agent-ready-prompt-button")?.addEventListener("click", () => {
        if (!state.latestSignedAgentGuide) return;
        copyText(state.latestSignedAgentGuide.agentReadyPrompt, "Agent-ready prompt copied.");
      });
      $("download-agent-ready-prompt-button")?.addEventListener("click", () => {
        if (!state.latestSignedAgentGuide) return;
        downloadTextFile(`${state.latestSignedAgentGuide.agentId}.agent-ready.md`, state.latestSignedAgentGuide.agentReadyPrompt, "text/markdown;charset=utf-8");
      });
      $("download-signed-payload-button")?.addEventListener("click", () => {
        if (!state.latestSignedAgentGuide) return;
        const payload = JSON.parse(state.latestSignedAgentGuide.payload);
        downloadTextFile(`${state.latestSignedAgentGuide.agentId}.payload.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
      });
      $("download-signed-script-button")?.addEventListener("click", () => {
        if (!state.latestSignedAgentGuide) return;
        downloadTextFile(`${state.latestSignedAgentGuide.agentId}.register.sh`, state.latestSignedAgentGuide.script, "text/x-shellscript;charset=utf-8");
      });
      $("download-signed-bundle-button")?.addEventListener("click", () => {
        if (!state.latestSignedAgentGuide) return;
        downloadTextFile(`${state.latestSignedAgentGuide.agentId}.bundle.json`, JSON.stringify(state.latestSignedAgentGuide.bundle, null, 2), "application/json;charset=utf-8");
      });
    }
    setStatus(`Signed registration payload prepared for ${formData.agentId}`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
});
$("signin-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const value = String(new FormData(form).get("humanIdOrEmail") || "");
  const password = String(new FormData(form).get("password") || "");
  try {
    await signInWithValue(value, password);
    form.reset();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

$("forgot-password-button")?.addEventListener("click", () => {
  const form = $("forgot-password-form");
  if (!form) return;
  form.hidden = !form.hidden;
});

$("forgot-password-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await request("/api/auth/password/reset/request", "POST", {
      humanIdOrEmail: form.humanIdOrEmail.value
    });
    if (typeof form.reset === "function") form.reset();
    form.hidden = true;
    setStatus(`Password reset email sent to ${result.email}`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.querySelectorAll("[data-route-target]").forEach((node) => {
  node.addEventListener("click", () => goToRoute(node.dataset.routeTarget));
});

document.querySelectorAll("[data-settings-section]").forEach((node) => {
  node.addEventListener("click", () => {
    state.activeSettingsSection = node.dataset.settingsSection;
    renderSettingsShell();
  });
});

$("build-filter-kind")?.addEventListener("change", (event) => {
  state.buildFilters.kind = event.currentTarget.value.trim().toLowerCase();
  renderAll();
});

$("build-filter-state")?.addEventListener("change", (event) => {
  state.buildFilters.status = event.currentTarget.value.trim().toLowerCase();
  renderAll();
});

$("build-filter-tag")?.addEventListener("input", (event) => {
  state.buildFilters.tag = event.currentTarget.value;
  renderAll();
});

$("build-filter-min-rating")?.addEventListener("input", (event) => {
  state.buildFilters.minRating = Number(event.currentTarget.value || 0);
  renderAll();
});

$("build-filter-min-heat")?.addEventListener("input", (event) => {
  state.buildFilters.minHeat = Number(event.currentTarget.value || 0);
  renderAll();
});

$("build-filter-query")?.addEventListener("input", (event) => {
  state.buildFilters.query = event.currentTarget.value;
  renderAll();
});

$("market-filter-kind")?.addEventListener("change", (event) => {
  state.marketFilters.kind = event.currentTarget.value.trim().toLowerCase();
  renderAll();
});

$("market-filter-min-rating")?.addEventListener("input", (event) => {
  state.marketFilters.minRating = Number(event.currentTarget.value || 0);
  renderAll();
});

$("market-filter-query")?.addEventListener("input", (event) => {
  state.marketFilters.query = event.currentTarget.value;
  renderAll();
});

$("market-sort")?.addEventListener("change", (event) => {
  state.marketFilters.sort = event.currentTarget.value;
  renderAll();
});

$("settings-project-filter-kind")?.addEventListener("change", (event) => {
  state.settingsProjectFilters.kind = event.currentTarget.value.trim().toLowerCase();
  renderSettingsData();
});

$("settings-project-filter-state")?.addEventListener("change", (event) => {
  state.settingsProjectFilters.state = event.currentTarget.value.trim().toLowerCase();
  renderSettingsData();
});

$("settings-project-filter-tag")?.addEventListener("input", (event) => {
  state.settingsProjectFilters.tag = event.currentTarget.value.trim();
  renderSettingsData();
});

$("github-auth-button")?.addEventListener("click", () => {
  window.location.href = "/auth/github/start";
});

$("security-password-reset-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const human = currentHuman();
  if (!human) {
    setStatus("Sign in first.", "error");
    return;
  }
  try {
    const result = await request("/api/auth/password/reset/request", "POST", {
      humanIdOrEmail: human.humanId
    });
    setStatus(`Password reset email sent to ${result.email}`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

window.addEventListener("hashchange", () => showRoute(currentRoute()));
showRoute(currentRoute());
loadAuthConfig().then(() => refresh()).catch((error) => setStatus(error.message, "error"));
