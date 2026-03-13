const $ = (id) => document.getElementById(id);
const SESSION_KEY = "elo-open-world.session";
const SETTINGS_DEFAULT_SECTION = "profile";
const ROUTES = new Set(["home", "join", "settings", "world", "build", "market", "docs"]);
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
  selectedGraphProjectId: "",
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
  latestStarterConversation: null
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

function foundationProjects() {
  if (!state.summary) return [];
  const preferredRepos = new Set([
    "peterpan42388/elo-agent-onboarder",
    "peterpan42388/elo-agent-web-plugin"
  ]);
  return (state.summary.projects || []).filter((project) => preferredRepos.has(project.repoFullName));
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
  return `<span class="badge badge-${tone}">${label}</span>`;
}

function formatTimestamp(ts) {
  if (!ts) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
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
    "3. When ready, tell the human to continue in Build with this requirement.",
    "4. Once a source project exists, participate under the assigned project role.",
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
      ...agents.map((agent) => `<option value="${agent.agentId}">${agent.label || agent.agentId} · ${agent.agentId}</option>`)
    ].join("");
    if (agents.some((agent) => agent.agentId === current)) select.value = current;
  });
  document.querySelectorAll(".member-role-agent-multi-select").forEach((select) => {
    const selected = new Set([...select.selectedOptions].map((option) => option.value));
    select.innerHTML = agents.map((agent) => `<option value="${agent.agentId}">${agent.label || agent.agentId} · ${agent.agentId}</option>`).join("");
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
  renderProjectGraph(summary.projects || []);
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
    <div class="infra-arrow">→</div>
    <div class="infra-column">
      <div class="infra-node plugin"><strong>Plugins</strong><span>ELO Protocol, Market, Social, future integrations</span></div>
      <div class="infra-node plugin"><strong>Current Focus</strong><span>ELO OpenClaw Onboarding Assistant</span></div>
    </div>
    <div class="infra-arrow">→</div>
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

function renderProjectGraph(projects) {
  const root = $("project-graph");
  const legend = $("graph-legend");
  const relations = $("graph-relations");
  if (!root || !legend || !relations) return;

  legend.innerHTML = `
    <h3>Legend</h3>
    <div class="legend-item"><span class="legend-dot universe"></span><span>Universe Root</span></div>
    <div class="legend-item"><span class="legend-dot project"></span><span>Source Project</span></div>
    <div class="legend-item"><span class="legend-dot owner"></span><span>Shared Owner Link</span></div>
    <div class="legend-item"><span class="legend-dot plugin"></span><span>Plugin Attachment</span></div>
    <div class="legend-item"><span class="legend-dot agent"></span><span>Shared Agent Participation</span></div>
  `;

  if (!projects.length) {
    state.selectedGraphProjectId = "";
    root.innerHTML = '<div class="graph-empty">No source projects yet. Use Build to create the first project node.</div>';
    relations.innerHTML = `
      <h3>Relations</h3>
      <div class="relation-card empty">No project relations yet.</div>
    `;
    return;
  }

  const selectedProject = projects.find((project) => project.projectId === state.selectedGraphProjectId) || projects[0];
  state.selectedGraphProjectId = selectedProject.projectId;

  const universeNode = `
    <div class="graph-node universe">
      <strong>elo-universe-0</strong>
      <span>MetaVie deployment</span>
      <span>${projects.length} connected source project${projects.length > 1 ? "s" : ""}</span>
    </div>
  `;

  const projectNodes = projects.map((project) => {
    const selected = project.projectId === state.selectedGraphProjectId;
    return `
      <div class="graph-column">
        <div class="graph-link"></div>
        <button type="button" class="graph-node-button ${selected ? "selected" : ""}" data-graph-project="${project.projectId}">
          <div class="graph-node project ${selected ? "selected" : ""}">
            <div class="graph-node-top">
              <strong>${project.title}</strong>
              ${createBadge(projectStateLabel(project.state))}
            </div>
            <span>${project.repoName}</span>
            <div class="tag-row">
              ${createBadge(projectTypeLabel(project.kind))}
              <span class="subtle-tag">Owner: ${project.ownerHumanId}</span>
            </div>
            <span>${project.memberAgentIds?.length || 0} agent member${(project.memberAgentIds?.length || 0) === 1 ? "" : "s"}</span>
            <span>${project.pluginIds?.length || 0} plugin link${(project.pluginIds?.length || 0) === 1 ? "" : "s"}</span>
            <div class="tag-row">${(project.tags || []).slice(0, 3).map((tag) => `<span class="subtle-tag">${tag}</span>`).join("")}</div>
          </div>
        </button>
      </div>
    `;
  }).join("");

  const { sharedOwners, topPlugins, linkedAgents } = buildGraphRelations(projects);
  const related = relatedProjectsForSelection(projects, selectedProject);

  relations.innerHTML = `
    <h3>Relations</h3>
    <div class="relation-card selected-project-card">
      <strong>Selected Project</strong>
      <span>${selectedProject.title}</span>
      <div class="tag-row">
        ${createBadge(projectTypeLabel(selectedProject.kind))}
        ${createBadge(projectStateLabel(selectedProject.state))}
      </div>
      <span>Owner: ${selectedProject.ownerHumanId}</span>
      <span>Agents: ${selectedProject.memberAgentIds?.length || 0}</span>
      <span>Plugins: ${selectedProject.pluginIds?.length || 0}</span>
      <span>Rating: ${selectedProject.rating || 0}</span>
      <span>Heat: ${selectedProject.heat || 0}</span>
      <div class="tag-row">${(selectedProject.tags || []).map((tag) => `<span class="subtle-tag">${tag}</span>`).join("")}</div>
      <a href="${selectedProject.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
    </div>
    <div class="relation-card">
      <strong>Shared Owner Links</strong>
      <span>${related.ownerMatches.length ? related.ownerMatches.map((project) => project.title).join(", ") : "No same-owner neighbor projects."}</span>
    </div>
    <div class="relation-card">
      <strong>Shared Plugin Links</strong>
      <span>${related.pluginMatches.length ? related.pluginMatches.map((project) => project.title).join(", ") : "No shared-plugin neighbor projects."}</span>
    </div>
    <div class="relation-card">
      <strong>Shared Agent Links</strong>
      <span>${related.agentMatches.length ? related.agentMatches.map((project) => project.title).join(", ") : "No shared-agent neighbor projects."}</span>
    </div>
    <div class="relation-card compact-summary">
      <strong>Universe Summary</strong>
      <span>Owners with multiple projects: ${sharedOwners.length || 0}</span>
      <span>Top plugin attachments: ${topPlugins.length ? topPlugins.map(([pluginId, count]) => `${pluginId} (${count})`).join(", ") : "none"}</span>
      <span>Linked agent references: ${linkedAgents}</span>
    </div>
  `;

  root.innerHTML = `
    <div class="graph-stage">
      <div class="graph-root">${universeNode}</div>
      <div class="graph-children">${projectNodes}</div>
    </div>
  `;

  root.querySelectorAll("[data-graph-project]").forEach((node) => {
    node.addEventListener("click", () => {
      state.selectedGraphProjectId = node.dataset.graphProject;
      renderProjectGraph(projects);
    });
  });
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
  const projectForm = $("project-form");
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
          <button type="button" class="topbar-button secondary" id="starter-open-build-link">Open Build With Requirement</button>
          <button type="button" class="topbar-button ghost" id="starter-copy-requirement-id">Copy Requirement ID</button>
          <button type="button" class="topbar-button ghost" id="starter-copy-agent-brief">Copy Agent Brief</button>
          <button type="button" class="topbar-button ghost" id="starter-download-agent-brief">Download Agent Brief</button>
          <button type="button" class="topbar-button ghost" id="starter-check-bridge">Check Browser Bridge</button>
          <button type="button" class="topbar-button secondary" id="starter-send-to-agent">Ask Primary Agent</button>
        </div>
        <p class="note">The starter requirement is ready. Continue in Build when you want to create the GitHub source project. If the browser plugin is configured, you can ask your primary agent to refine the idea first.</p>
        <div class="copy-stack">
          <p class="note">Need the browser bridge first? Load the extension from the <code>elo-agent-web-plugin</code> repository and configure your local agent endpoint.</p>
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
      $("starter-open-build-link")?.addEventListener("click", () => {
        const requirement = state.summary?.requirements?.find((item) => item.requirementId === state.starterRequirementId) || state.latestStarterRequirement;
        if (requirement) loadRequirementIntoProjectForm(requirement);
        goToRoute("build");
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
      foundationsRoot.innerHTML = foundations.length ? foundations.map((project) => `
        <details class="expand-card" open>
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
            <div class="tag-row">${(project.tags || []).map((tag) => `<span class="subtle-tag">${tag}</span>`).join("")}</div>
            <div class="detail-grid compact">
              <div class="detail-item"><span>Repository</span><strong>${project.repoFullName}</strong></div>
              <div class="detail-item"><span>Stage</span><strong>${project.stage || "source"}</strong></div>
              <div class="detail-item"><span>State</span><strong>${projectStateLabel(project.state)}</strong></div>
              <div class="detail-item"><span>Service</span><strong class="detail-code">${project.serviceEndpoint || "Not exposed yet"}</strong></div>
            </div>
            <div class="action-row">
              <a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
              ${project.serviceEndpoint ? `<a href="${project.serviceEndpoint}" target="_blank" rel="noreferrer">Open Service</a>` : ""}
            </div>
          </div>
        </details>
      `).join("") : '<div class="empty">Foundation projects will appear here after registration into the universe.</div>';
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
            <p>This workspace will evolve into project membership, governance, and contribution management. The current version focuses on visibility and project identity.</p>
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
              </div>
            </div>
            <span>${project.repoName}</span>
          </summary>
          <div class="expand-body">
            <p>Purpose: ${project.summary || "Not specified"}</p>
            <div class="tag-row">
              ${createBadge(project.stage === "operating" ? "Operating Service" : "Source Project")}
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
            <div class="nested-list">
              ${(project.memberAgentIds || []).length ? (project.memberAgentIds || []).map((agentId) => `
                <div class="nested-item">
                  <strong>${agentId}</strong>
                  <span>Role: ${projectMemberRole(project, agentId)}</span>
                </div>
              `).join("") : '<div class="empty">No member agents recorded.</div>'}
            </div>
            ${(project.memberInvites || []).length ? `
              <div class="nested-list">
                ${(project.memberInvites || []).map((invite) => `
                  <div class="nested-item">
                    <strong>${invite.agentId}</strong>
                    <span>Invite Role: ${invite.role}</span>
                    <span>Status: ${invite.status}</span>
                    ${project.ownerHumanId === human.humanId && invite.status === "pending" ? `<button type="button" class="topbar-button ghost membership-accept-button" data-project-id="${project.projectId}" data-invite-id="${invite.inviteId}">Accept Invite</button>` : ""}
                  </div>
                `).join("")}
              </div>
            ` : ""}
            ${(project.ownerHumanId === human.humanId) ? `
              <div class="membership-tools copy-stack">
                <div class="summary-row">
                  <strong>Membership Workflow</strong>
                  <span>Owner controls</span>
                </div>
                <form class="membership-invite-form" data-project-id="${project.projectId}">
                  <input name="agentId" placeholder="agent id to invite" required />
                  <select name="role">
                    <option value="builder">builder</option>
                    <option value="reviewer">reviewer</option>
                    <option value="operator">operator</option>
                    <option value="maintainer">maintainer</option>
                    <option value="observer">observer</option>
                  </select>
                  <button type="submit">Invite Member</button>
                </form>
                <form class="membership-role-form" data-project-id="${project.projectId}">
                  <select name="agentId">
                    <option value="">Select member</option>
                    ${(project.memberAgentIds || []).map((agentId) => `<option value="${agentId}">${agentId}</option>`).join("")}
                  </select>
                  <select name="role">
                    <option value="builder">builder</option>
                    <option value="reviewer">reviewer</option>
                    <option value="operator">operator</option>
                    <option value="maintainer">maintainer</option>
                    <option value="observer">observer</option>
                  </select>
                  <button type="submit">Change Role</button>
                </form>
                <form class="membership-remove-form" data-project-id="${project.projectId}">
                  <select name="agentId">
                    <option value="">Select member</option>
                    ${(project.memberAgentIds || []).map((agentId) => `<option value="${agentId}">${agentId}</option>`).join("")}
                  </select>
                  <button type="submit">Remove Member</button>
                </form>
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
          <button type="button" class="topbar-button secondary edit-project-button" data-edit-project="${project.projectId}">Edit Metadata</button>
          <button type="button" class="topbar-button ghost" data-route-target="build">Open In Build</button>
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
      projectsRoot.querySelectorAll(".membership-invite-form").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          try {
            const payload = {
              projectId: form.dataset.projectId,
              ownerHumanId: human.humanId,
              agentId: form.agentId.value,
              role: form.role.value
            };
            await request("/api/projects/members/invite", "POST", payload);
            setStatus(`Invite created for ${payload.agentId}`, "ok");
            await refresh();
          } catch (error) {
            setStatus(error.message, "error");
          }
        });
      });
      projectsRoot.querySelectorAll(".membership-accept-button").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await request("/api/projects/members/accept", "POST", {
              projectId: button.dataset.projectId,
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
      projectsRoot.querySelectorAll(".membership-role-form").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          try {
            await request("/api/projects/members/role", "POST", {
              projectId: form.dataset.projectId,
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
      });
      projectsRoot.querySelectorAll(".membership-remove-form").forEach((form) => {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          try {
            await request("/api/projects/members/remove", "POST", {
              projectId: form.dataset.projectId,
              ownerHumanId: human.humanId,
              agentId: form.agentId.value
            });
            setStatus(`Removed ${form.agentId.value} from project`, "ok");
            await refresh();
          } catch (error) {
            setStatus(error.message, "error");
          }
        });
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
    ...available.map((item) => `<option value="${item.requirementId}">${item.requirementId} · ${item.title}</option>`)
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
    if (project.stage !== "operating") return false;
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
  if (!filtered.length) {
    root.innerHTML = '<div class="empty">No projects match the current filter.</div>';
    return;
  }
  root.innerHTML = filtered.map((project) => `
    <details class="expand-card" data-project-card="${project.projectId}">
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
        <div class="tag-row">${(project.tags || []).map((tag) => `<span class="subtle-tag">${tag}</span>`).join("")}</div>
        <div class="detail-grid compact">
          <div class="detail-item"><span>Owner</span><strong>${project.ownerHumanId}</strong></div>
          <div class="detail-item"><span>Agents</span><strong>${project.memberAgentIds?.length || 0}</strong></div>
          <div class="detail-item"><span>Plugins</span><strong>${project.pluginIds?.length || 0}</strong></div>
          <div class="detail-item"><span>Rating</span><strong>${project.rating || 0}</strong></div>
          <div class="detail-item"><span>Heat</span><strong>${project.heat || 0}</strong></div>
          <div class="detail-item"><span>Stage</span><strong>${project.stage || "source"}</strong></div>
          <div class="detail-item"><span>Service Endpoint</span><strong>${project.serviceEndpoint || "Not set"}</strong></div>
          <div class="detail-item"><span>GitHub</span><strong>${project.repoFullName}</strong></div>
        </div>
        <div class="nested-list">
          ${(project.memberAgentIds || []).length ? (project.memberAgentIds || []).map((agentId) => `
            <div class="nested-item">
              <strong>${agentId}</strong>
              <span>Role: ${projectMemberRole(project, agentId)}</span>
            </div>
          `).join("") : '<div class="empty">No member agents recorded.</div>'}
        </div>
        <p>Pricing: ${project.pricingNote || "Not specified"}</p>
        <p>Usage: ${project.usageNote || "Not specified"}</p>
        <div class="tag-row action-row">
          <button type="button" class="topbar-button secondary edit-project-button" data-edit-project="${project.projectId}">Edit Metadata</button>
          <a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
        </div>
      </div>
    </details>
  `).join("");
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
  root.innerHTML = filtered.map((project) => `
    <details class="expand-card" data-project-card="${project.projectId}">
      <summary>
        <div class="summary-row">
          <strong>${project.title}</strong>
          <div class="tag-row">
            ${createBadge(projectTypeLabel(project.kind))}
            ${createBadge(`Rating ${project.rating || 0}`)}
          </div>
        </div>
        <span>${project.repoName}</span>
      </summary>
      <div class="expand-body">
        <p>${project.summary || "No summary provided."}</p>
        <div class="tag-row">${(project.tags || []).map((tag) => `<span class="subtle-tag">${tag}</span>`).join("")}</div>
        <div class="detail-grid compact">
          <div class="detail-item"><span>Source Project</span><strong>${project.repoFullName}</strong></div>
          <div class="detail-item"><span>Stage</span><strong>${project.stage || "operating"}</strong></div>
          <div class="detail-item"><span>Heat</span><strong>${project.heat || 0}</strong></div>
          <div class="detail-item"><span>Service Endpoint</span><strong>${project.serviceEndpoint || "Not set"}</strong></div>
        </div>
        <p>Pricing: ${project.pricingNote || "ELO protocol plugin"}</p>
        <p>Usage: ${project.usageNote || "Let your agent call the source project endpoint after deployment and settle through the future ELO protocol layer."}</p>
        <a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open Source Project</a>
      </div>
    </details>
  `).join("");
}

function renderSettingsShell() {
  const human = currentHuman();
  const guest = $("settings-guest");
  const shell = $("settings-shell");
  if (!guest || !shell) return;
  if (!state.authResolved) {
    guest.hidden = true;
    shell.hidden = true;
  } else if (!human) {
    guest.hidden = false;
    shell.hidden = true;
  } else {
    guest.hidden = true;
    shell.hidden = false;
  }
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
        `Project starter created inside My Projects.`,
        `Primary agent: ${form.primaryAgentId.value}`,
        ``,
        form.idea.value.trim(),
        ``,
        `Next step: continue requirement refinement and source project creation inside Build.`
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
$("project-starter-open-build")?.addEventListener("click", () => {
  goToRoute("build");
  window.setTimeout(() => {
    $("project-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 50);
});
$("agent-status-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/agents/status", (result) => `Agent updated: ${result.agentId}`, "settings"));
$("plugin-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/plugins/register", (result) => `Plugin created: ${result.pluginId}`, "build"));
$("project-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/projects/create", (result) => `Project created: ${result.projectId} -> ${result.repoFullName}`, "build"));
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
