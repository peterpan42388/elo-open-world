const $ = (id) => document.getElementById(id);
const SESSION_KEY = "elo-open-world.session";
const SETTINGS_DEFAULT_SECTION = "profile";
const ROUTES = new Set(["home", "join", "settings", "world", "build", "market", "docs"]);

const state = {
  summary: null,
  sessionHumanId: loadSession(),
  activeSettingsSection: SETTINGS_DEFAULT_SECTION,
  selectedGraphProjectId: "",
  buildFilters: {
    kind: "",
    status: "",
    query: ""
  }
};

function loadSession() {
  return localStorage.getItem(SESSION_KEY) || "";
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

  renderInfrastructure(summary);
  renderProjectGraph(summary.projects || []);
  renderPlugins(summary.plugins || []);
  renderProjects(summary.projects || []);
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

  const profile = $("settings-profile");
  const agentsRoot = $("my-agents-list");
  const projectsRoot = $("my-projects-list");
  if (!human) {
    if (profile) profile.innerHTML = "";
    if (agentsRoot) agentsRoot.innerHTML = "";
    if (projectsRoot) projectsRoot.innerHTML = "";
    return;
  }

  profile.innerHTML = [
    ["Human ID", human.humanId],
    ["Email", human.email],
    ["GitHub", human.githubLogin || "Not linked"],
    ["Display Name", human.displayName || human.humanId]
  ].map(([key, value]) => `
    <div class="detail-item">
      <span>${key}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  const agents = currentHumanAgents();
  if (agentsRoot) {
    if (!agents.length) {
      agentsRoot.innerHTML = '<div class="empty">No agents registered for this user yet.</div>';
    } else {
      agentsRoot.innerHTML = agents.map((agent) => {
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
                <div class="detail-item"><span>Endpoint</span><strong>${agent.endpoint || "Not set"}</strong></div>
                <div class="detail-item"><span>Last Seen</span><strong>${formatTimestamp(agent.lastSeenAt)}</strong></div>
                <div class="detail-item"><span>Faction</span><strong>${agent.faction}</strong></div>
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
                    <span>Role: contributor</span>
                  </div>
                `).join("") : '<div class="empty">No related projects yet.</div>'}
              </div>
            </div>
          </details>
        `;
      }).join("");
    }
  }

  const projects = currentHumanProjects();
  if (projectsRoot) {
    if (!projects.length) {
      projectsRoot.innerHTML = '<div class="empty">No projects linked to this user yet.</div>';
    } else {
      projectsRoot.innerHTML = projects.map((project) => `
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
            <div class="detail-grid compact">
              <div class="detail-item"><span>Owner</span><strong>${project.ownerHumanId}</strong></div>
              <div class="detail-item"><span>Agents</span><strong>${project.memberAgentIds?.length || 0}</strong></div>
              <div class="detail-item"><span>Plugins</span><strong>${project.pluginIds?.length || 0}</strong></div>
              <div class="detail-item"><span>Repository</span><strong>${project.repoName}</strong></div>
            </div>
            <a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
          </div>
        </details>
      `).join("");
    }
  }
}

function buildAgentMarkdownPrompt() {
  const human = currentHuman();
  if (!human) return "Sign in first to generate your AI registration prompt.";
  return [
    "# ELO Open World Agent Registration Prompt",
    "",
    "You are preparing a local AI agent for ELO Open World.",
    "",
    "## Required Human Context",
    `- humanId: ${human.humanId}`,
    `- email: ${human.email}`,
    `- githubLogin: ${human.githubLogin || ""}`,
    `- worldUrl: ${window.location.origin}`,
    "",
    "## Your Task",
    "1. Create or choose an agentId.",
    "2. Decide runtime, endpoint, and model.",
    "3. Register the agent through Settings > My Agents or prepare equivalent API payload.",
    "4. Keep reporting your status with model and online state.",
    "",
    "## Suggested Agent Registration Payload",
    "```json",
    JSON.stringify({
      agentId: "agent.your-name.openclaw",
      humanId: human.humanId,
      label: "OpenClaw Main",
      runtime: "openclaw",
      endpoint: "http://localhost:3000",
      model: "gpt-4.1",
      online: true
    }, null, 2),
    "```"
  ].join("\n");
}

function applyBuildFiltersToProjects(projects) {
  const query = state.buildFilters.query.trim().toLowerCase();
  return projects.filter((project) => {
    const kindValue = String(project.kind || "").toLowerCase();
    const stateValue = String(project.state || "").toLowerCase();
    const kindPass = !state.buildFilters.kind || kindValue === state.buildFilters.kind;
    const statePass = !state.buildFilters.status || stateValue === state.buildFilters.status;
    const queryPass = !query || [project.title, project.repoName, project.summary, project.ownerHumanId, ...(project.tags || [])].join(" ").toLowerCase().includes(query);
    return kindPass && statePass && queryPass;
  });
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
        <p>${project.summary || "No summary provided."}</p>
        <div class="tag-row">${(project.tags || []).map((tag) => `<span class="subtle-tag">${tag}</span>`).join("")}</div>
        <div class="detail-grid compact">
          <div class="detail-item"><span>Owner</span><strong>${project.ownerHumanId}</strong></div>
          <div class="detail-item"><span>Agents</span><strong>${project.memberAgentIds?.length || 0}</strong></div>
          <div class="detail-item"><span>Plugins</span><strong>${project.pluginIds?.length || 0}</strong></div>
          <div class="detail-item"><span>Rating</span><strong>${project.rating || 0}</strong></div>
          <div class="detail-item"><span>Heat</span><strong>${project.heat || 0}</strong></div>
          <div class="detail-item"><span>Stage</span><strong>${project.stage || "source"}</strong></div>
          <div class="detail-item"><span>GitHub</span><strong>${project.repoFullName}</strong></div>
        </div>
        <a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
      </div>
    </details>
  `).join("");
}

function renderBuildFilterSummary() {
  const node = $("build-filter-summary");
  if (!node) return;
  const parts = [];
  if (state.buildFilters.kind) parts.push(`type: ${projectTypeLabel(state.buildFilters.kind)}`);
  if (state.buildFilters.status) parts.push(`state: ${projectStateLabel(state.buildFilters.status)}`);
  if (state.buildFilters.query.trim()) parts.push(`query: ${state.buildFilters.query.trim()}`);
  node.textContent = parts.length ? `Active filters -> ${parts.join(" | ")}` : "No active build filters.";
}

function renderSettingsShell() {
  const human = currentHuman();
  const guest = $("settings-guest");
  const shell = $("settings-shell");
  if (!guest || !shell) return;
  if (!human) {
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
  return obj;
}

function signInWithValue(value) {
  if (!state.summary) return false;
  const normalized = value.trim().toLowerCase();
  const human = (state.summary.identity?.humans || []).find((item) => item.humanId.toLowerCase() === normalized || item.email.toLowerCase() === normalized);
  if (!human) return false;
  saveSession(human.humanId);
  state.activeSettingsSection = SETTINGS_DEFAULT_SECTION;
  setStatus(`Signed in as ${human.humanId}`, "ok");
  renderAll();
  goToRoute("settings");
  return true;
}

async function handleSubmit(event, path, successMessage, routeAfter = null, afterSuccess = null) {
  event.preventDefault();
  try {
    const result = await request(path, "POST", formDataToObject(event.currentTarget));
    event.currentTarget.reset();
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

async function refresh() {
  state.summary = await request("/api/world/summary");
  renderAll();
}

function renderAll() {
  if (!state.summary) return;
  renderTopbarActions();
  renderSummary(state.summary);
  renderBuildFilterSummary();
  renderSettingsShell();
  showRoute(currentRoute());
}

$("human-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/humans/register", (result) => `Human created: ${result.humanId}`, "settings", (result) => saveSession(result.humanId)));
$("agent-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/agents/register", (result) => `Agent created: ${result.agentId}`, "settings"));
$("agent-status-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/agents/status", (result) => `Agent updated: ${result.agentId}`, "settings"));
$("plugin-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/plugins/register", (result) => `Plugin created: ${result.pluginId}`, "build"));
$("project-form")?.addEventListener("submit", (event) => handleSubmit(event, "/api/projects/create", (result) => `Project created: ${result.projectId} -> ${result.repoFullName}`, "build"));
$("onboarder-form")?.addEventListener("submit", handleOnboarderSubmit);
$("signin-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = String(new FormData(event.currentTarget).get("humanIdOrEmail") || "");
  if (!signInWithValue(value)) {
    setStatus("Human identity not found.", "error");
    return;
  }
  event.currentTarget.reset();
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

$("build-filter-query")?.addEventListener("input", (event) => {
  state.buildFilters.query = event.currentTarget.value;
  renderAll();
});

window.addEventListener("hashchange", () => showRoute(currentRoute()));
showRoute(currentRoute());
refresh().catch((error) => setStatus(error.message, "error"));
