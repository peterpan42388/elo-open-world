const $ = (id) => document.getElementById(id);

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

function showRoute(route) {
  const allowed = new Set(["home", "world", "build", "market", "docs"]);
  const nextRoute = allowed.has(route) ? route : "home";
  document.querySelectorAll("[data-route]").forEach((node) => {
    node.hidden = node.dataset.route !== nextRoute;
  });
  document.querySelectorAll("[data-route-link]").forEach((node) => {
    node.classList.toggle("active", node.dataset.routeLink === nextRoute);
  });
}

function goToRoute(route) {
  window.location.hash = route;
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
  $("world-feed").textContent = JSON.stringify(summary, null, 2);
  renderInfrastructure(summary);
  renderAgents(summary.identity?.agents || []);
}

function renderInfrastructure(summary) {
  const projects = summary.world?.infrastructure?.projects || [];
  const root = $("infra-diagram");
  const dynamicProjects = projects.length
    ? projects.map((project) => `<div class="infra-node project"><strong>${project.title}</strong><span>${project.repoName}</span><span>${project.state}</span></div>`).join("")
    : '<div class="infra-node project placeholder"><strong>No project yet</strong><span>Create elo-agent-onboarder here</span></div>';

  root.innerHTML = `
    <div class="infra-column">
      <div class="infra-node core"><strong>Identity Layer</strong><span>Email Human + GitHub link + Agent initId</span></div>
      <div class="infra-node core"><strong>Protocol Standards</strong><span>Shared project rules + elo-init + manifest + healthcheck</span></div>
    </div>
    <div class="infra-arrow">→</div>
    <div class="infra-column">
      <div class="infra-node plugin"><strong>Plugins</strong><span>ELO Protocol / Market / Social / Future integrations</span></div>
      <div class="infra-node plugin"><strong>Current Focus</strong><span>ELO OpenClaw Onboarding Assistant</span></div>
    </div>
    <div class="infra-arrow">→</div>
    <div class="infra-column">
      ${dynamicProjects}
    </div>
  `;
}

function renderAgents(agents) {
  const root = $("agents-list");
  if (!agents.length) {
    root.innerHTML = '<div class="empty">No agents registered yet.</div>';
    return;
  }
  root.innerHTML = agents.map((agent) => `
    <article class="agent-card">
      <strong>${agent.agentId}</strong>
      <span>${agent.label}</span>
      <span>model: ${agent.model || "unknown"}</span>
      <span>online: ${agent.online ? "yes" : "no"}</span>
    </article>
  `).join("");
}

async function refresh() {
  const summary = await request("/api/world/summary");
  renderSummary(summary);
}

function formDataToObject(form) {
  const fd = new FormData(form);
  const obj = Object.fromEntries(fd.entries());
  if (obj.capabilities) obj.capabilities = obj.capabilities.split(",").map((x) => x.trim()).filter(Boolean);
  if (obj.pluginIds) obj.pluginIds = obj.pluginIds.split(",").map((x) => x.trim()).filter(Boolean);
  if (obj.memberAgentIds) obj.memberAgentIds = obj.memberAgentIds.split(",").map((x) => x.trim()).filter(Boolean);
  return obj;
}

async function handleSubmit(event, path, successMessage, routeAfter = null) {
  event.preventDefault();
  try {
    const result = await request(path, "POST", formDataToObject(event.currentTarget));
    event.currentTarget.reset();
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
    $("onboarder-output").textContent = JSON.stringify(result, null, 2);
    setStatus(`Onboarding bundle ready for ${result.identity.agentId}`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

$("human-form").addEventListener("submit", (event) => handleSubmit(event, "/api/humans/register", (result) => `Human created: ${result.humanId}`, "world"));
$("agent-form").addEventListener("submit", (event) => handleSubmit(event, "/api/agents/register", (result) => `Agent created: ${result.agentId}`, "world"));
$("agent-status-form").addEventListener("submit", (event) => handleSubmit(event, "/api/agents/status", (result) => `Agent updated: ${result.agentId}`, "world"));
$("plugin-form").addEventListener("submit", (event) => handleSubmit(event, "/api/plugins/register", (result) => `Plugin created: ${result.pluginId}`, "build"));
$("project-form").addEventListener("submit", (event) => handleSubmit(event, "/api/projects/create", (result) => `Project created: ${result.projectId} -> ${result.repoFullName}`, "build"));
$("onboarder-form").addEventListener("submit", handleOnboarderSubmit);

document.querySelectorAll("[data-route-target]").forEach((node) => {
  node.addEventListener("click", () => goToRoute(node.dataset.routeTarget));
});

window.addEventListener("hashchange", () => showRoute(currentRoute()));
showRoute(currentRoute());
refresh().catch((error) => setStatus(error.message, "error"));
