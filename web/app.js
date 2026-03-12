const $ = (id) => document.getElementById(id);
const SESSION_KEY = "elo-open-world.session";
const SETTINGS_DEFAULT_SECTION = "profile";

const state = {
  summary: null,
  sessionHumanId: loadSession(),
  activeSettingsSection: SETTINGS_DEFAULT_SECTION,
  buildFilters: {
    kind: "",
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
  line.textContent = message;
  line.dataset.kind = kind;
}

function currentRoute() {
  const route = window.location.hash.replace("#", "").trim();
  return route || "home";
}

function allowedRoutes() {
  return new Set(["home", "join", "settings", "world", "build", "market", "docs"]);
}

function showRoute(route) {
  const nextRoute = allowedRoutes().has(route) ? route : "home";
  document.querySelectorAll("[data-route]").forEach((node) => {
    node.hidden = node.dataset.route !== nextRoute;
  });
  document.querySelectorAll("[data-route-link]").forEach((node) => {
    node.classList.toggle("active", node.dataset.routeLink === nextRoute);
  });
  renderTopbarActions();
  renderSettingsShell();
}

function goToRoute(route) {
  window.location.hash = route;
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
  return (state.summary.projects || []).filter((project) => project.ownerHumanId === human.humanId || (project.memberAgentIds || []).some((agentId) => agentIds.has(agentId)));
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
    "3. Register the agent through the Settings > My Agents workflow or prepare equivalent API payload.",
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

function renderTopbarActions() {
  const root = $("topbar-actions");
  const human = currentHuman();
  if (!human) {
    root.innerHTML = '<button type="button" class="topbar-button" data-route-target="join">Join</button>';
  } else {
    root.innerHTML = `
      <div class="session-chip">${human.displayName || human.humanId}</div>
      <button type="button" class="topbar-button secondary" data-route-target="settings">Settings</button>
      <button type="button" class="topbar-button ghost" id="signout-button">Sign Out</button>
    `;
    const signOut = $("signout-button");
    if (signOut) {
      signOut.addEventListener("click", () => {
        saveSession("");
        setStatus("Signed out.", "ok");
        goToRoute("home");
        renderAll();
      });
    }
  }
  root.querySelectorAll("[data-route-target]").forEach((node) => {
    node.addEventListener("click", () => goToRoute(node.dataset.routeTarget));
  });
}

function renderSummary(summary) {
  const grid = $("summary-grid");
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
  ].map(([label, value]) => `<article class="metric"><div class="label">${label}</div><div class="value">${value}</div></article>`).join("");
  renderInfrastructure(summary);
  renderProjectGraph(summary.projects || []);
  renderPlugins(summary.plugins || []);
  renderProjects(summary.projects || []);
  renderSettingsData();
}

function renderInfrastructure(summary) {
  const projects = summary.world?.infrastructure?.projects || [];
  const root = $("infra-diagram");
  const dynamicProjects = projects.length
    ? projects.map((project) => `<div class="infra-node project"><strong>${project.title}</strong><span>${project.repoName}</span><span>${project.state}</span></div>`).join("")
    : '<div class="infra-node project placeholder"><strong>No project yet</strong><span>Create elo-agent-onboarder here</span></div>';

  root.innerHTML = `
    <div class="infra-column">
      <div class="infra-node core"><strong>Identity Layer</strong><span>Email human, GitHub link, private settings state</span></div>
      <div class="infra-node core"><strong>Protocol Standards</strong><span>Shared project rules, manifest, healthcheck, universe identity</span></div>
    </div>
    <div class="infra-arrow">→</div>
    <div class="infra-column">
      <div class="infra-node plugin"><strong>Plugins</strong><span>ELO Protocol, Market, Social, Future integrations</span></div>
      <div class="infra-node plugin"><strong>Current Focus</strong><span>ELO OpenClaw Onboarding Assistant</span></div>
    </div>
    <div class="infra-arrow">→</div>
    <div class="infra-column">
      ${dynamicProjects}
    </div>
  `;
}

function renderProjectGraph(projects) {
  const root = $("project-graph");
  if (!projects.length) {
    root.innerHTML = '<div class="graph-empty">No source projects yet. Use Build to create the first project node.</div>';
    return;
  }
  const universeNode = '<div class="graph-node universe"><strong>elo-universe-0</strong><span>MetaVie deployment</span></div>';
  const projectNodes = projects.map((project) => `
    <div class="graph-column">
      <div class="graph-link"></div>
      <div class="graph-node project">
        <strong>${project.title}</strong>
        <span>${project.repoName}</span>
        <span>${project.kind}</span>
        <span>${project.state}</span>
      </div>
    </div>
  `).join("");
  root.innerHTML = `
    <div class="graph-stage">
      <div class="graph-root">${universeNode}</div>
      <div class="graph-children">${projectNodes}</div>
    </div>
  `;
}

function agentWorkStatus(agent) {
  if (agent.online) return "Online";
  return "Idle";
}

function renderSettingsData() {
  const human = currentHuman();
  $("agent-markdown-output").textContent = buildAgentMarkdownPrompt();
  if (!human) {
    $("settings-profile").innerHTML = "";
    $("my-agents-list").innerHTML = "";
    $("my-projects-list").innerHTML = "";
    return;
  }

  $("settings-profile").innerHTML = [
    ["Human ID", human.humanId],
    ["Email", human.email],
    ["GitHub", human.githubLogin || "Not linked"],
    ["Display Name", human.displayName || human.humanId]
  ].map(([k, v]) => `<div class="detail-item"><span>${k}</span><strong>${v}</strong></div>`).join("");

  const agents = currentHumanAgents();
  const agentsRoot = $("my-agents-list");
  if (!agents.length) {
    agentsRoot.innerHTML = '<div class="empty">No agents registered for this user yet.</div>';
  } else {
    agentsRoot.innerHTML = agents.map((agent) => {
      const relatedProjects = currentHumanProjects().filter((project) => (project.memberAgentIds || []).includes(agent.agentId));
      return `
        <details class="expand-card">
          <summary>
            <strong>${agent.label || agent.agentId}</strong>
            <span>${agent.agentId}</span>
            <span>Status: ${agentWorkStatus(agent)}</span>
          </summary>
          <div class="expand-body">
            <p>Model: ${agent.model || "unknown"}</p>
            <p>Runtime: ${agent.runtime || "openclaw"}</p>
            <p>Endpoint: ${agent.endpoint || "not set"}</p>
            <p>Role: active participant</p>
            <p>Contribution: pending richer scoring model</p>
            <div class="nested-list">
              ${relatedProjects.length ? relatedProjects.map((project) => `<div class="nested-item"><strong>${project.title}</strong><span>${project.state}</span><span>Role: contributor</span></div>`).join("") : '<div class="empty">No related projects yet.</div>'}
            </div>
          </div>
        </details>
      `;
    }).join("");
  }

  const projects = currentHumanProjects();
  const projectsRoot = $("my-projects-list");
  if (!projects.length) {
    projectsRoot.innerHTML = '<div class="empty">No projects linked to this user yet.</div>';
  } else {
    projectsRoot.innerHTML = projects.map((project) => `
      <details class="expand-card">
        <summary>
          <strong>${project.title}</strong>
          <span>${project.kind}</span>
          <span>${project.state}</span>
        </summary>
        <div class="expand-body">
          <p>Purpose: ${project.summary || "not specified"}</p>
          <p>Phase: ${project.state}</p>
          <p>Type: public infrastructure / source project baseline</p>
          <p>Tags: ${project.kind}</p>
          <p>Members: ${(project.memberAgentIds || []).join(", ") || "none"}</p>
          <a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
        </div>
      </details>
    `).join("");
  }
}

function renderPlugins(plugins) {
  const root = $("plugins-list");
  if (!root) return;
  if (!plugins.length) {
    root.innerHTML = '<div class="empty">No plugins registered yet.</div>';
    return;
  }
  root.innerHTML = applyBuildFiltersToPlugins(plugins).map((plugin) => `
    <article class="entity-card">
      <strong>${plugin.title}</strong>
      <span>${plugin.pluginId}</span>
      <span>Kind: ${plugin.kind}</span>
      <span>Owner: ${plugin.ownerHumanId}</span>
    </article>
  `).join("");
}

function applyBuildFiltersToProjects(projects) {
  const query = state.buildFilters.query.trim().toLowerCase();
  return projects.filter((project) => {
    const kindPass = !state.buildFilters.kind || (project.kind || "").toLowerCase() === state.buildFilters.kind;
    const queryPass = !query || [project.title, project.repoName, project.summary].join(" ").toLowerCase().includes(query);
    return kindPass && queryPass;
  });
}

function applyBuildFiltersToPlugins(plugins) {
  const query = state.buildFilters.query.trim().toLowerCase();
  return plugins.filter((plugin) => {
    const kindPass = !state.buildFilters.kind || (plugin.kind || "").toLowerCase() === state.buildFilters.kind;
    const queryPass = !query || [plugin.title, plugin.pluginId, plugin.description].join(" ").toLowerCase().includes(query);
    return kindPass && queryPass;
  });
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
    <article class="entity-card">
      <strong>${project.title}</strong>
      <span>${project.repoName}</span>
      <span>Type: ${project.kind}</span>
      <span>State: ${project.state}</span>
      <span>Owner: ${project.ownerHumanId}</span>
      <a href="${project.repoUrl}" target="_blank" rel="noreferrer">Open GitHub Repo</a>
    </article>
  `).join("");
}

async function refresh() {
  state.summary = await request("/api/world/summary");
  renderAll();
}

function renderAll() {
  if (!state.summary) return;
  renderTopbarActions();
  renderSummary(state.summary);
  renderSettingsShell();
  showRoute(currentRoute());
}

function formDataToObject(form) {
  const fd = new FormData(form);
  const obj = Object.fromEntries(fd.entries());
  if (obj.capabilities) obj.capabilities = obj.capabilities.split(",").map((x) => x.trim()).filter(Boolean);
  if (obj.pluginIds) obj.pluginIds = obj.pluginIds.split(",").map((x) => x.trim()).filter(Boolean);
  if (obj.memberAgentIds) obj.memberAgentIds = obj.memberAgentIds.split(",").map((x) => x.trim()).filter(Boolean);
  return obj;
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

function renderSettingsShell() {
  const human = currentHuman();
  const guest = $("settings-guest");
  const shell = $("settings-shell");
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

async function handleOnboarderSubmit(event) {
  event.preventDefault();
  try {
    const result = await request("/api/onboarder/bundle", "POST", formDataToObject(event.currentTarget));
    $("onboarder-output").textContent = JSON.stringify(result, null, 2);
    setStatus(`Onboarding bundle ready for ${result.identity.agentId}`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

$("human-form").addEventListener("submit", (event) => handleSubmit(event, "/api/humans/register", (result) => `Human created: ${result.humanId}`, "settings", (result) => saveSession(result.humanId)));
$("agent-form").addEventListener("submit", (event) => handleSubmit(event, "/api/agents/register", (result) => `Agent created: ${result.agentId}`, "settings", null));
$("agent-status-form").addEventListener("submit", (event) => handleSubmit(event, "/api/agents/status", (result) => `Agent updated: ${result.agentId}`, "settings", null));
$("plugin-form").addEventListener("submit", (event) => handleSubmit(event, "/api/plugins/register", (result) => `Plugin created: ${result.pluginId}`, "build", null));
$("project-form").addEventListener("submit", (event) => handleSubmit(event, "/api/projects/create", (result) => `Project created: ${result.projectId} -> ${result.repoFullName}`, "build", null));
$("onboarder-form").addEventListener("submit", handleOnboarderSubmit);
$("signin-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const value = String(form.get("humanIdOrEmail") || "");
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

$("build-filter-kind").addEventListener("change", (event) => {
  state.buildFilters.kind = event.currentTarget.value.trim().toLowerCase();
  renderAll();
});
$("build-filter-query").addEventListener("input", (event) => {
  state.buildFilters.query = event.currentTarget.value;
  renderAll();
});

window.addEventListener("hashchange", () => showRoute(currentRoute()));
showRoute(currentRoute());
refresh().catch((error) => setStatus(error.message, "error"));
