const $ = (id) => document.getElementById(id);

async function request(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function renderSummary(summary) {
  const grid = $("summary-grid");
  const humans = summary.identity?.totals?.humans ?? 0;
  const agents = summary.identity?.totals?.agents ?? 0;
  const plugins = summary.plugins?.length ?? 0;
  const projects = summary.projects?.length ?? 0;
  grid.innerHTML = [
    ["Humans", humans],
    ["Agents", agents],
    ["Plugins", plugins],
    ["Projects", projects]
  ].map(([label, value]) => `<article class="metric"><div class="label">${label}</div><div class="value">${value}</div></article>`).join("");
  $("world-feed").textContent = JSON.stringify(summary, null, 2);
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
  return obj;
}

$("human-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await request("/api/humans/register", "POST", formDataToObject(event.currentTarget));
  event.currentTarget.reset();
  await refresh();
});

$("agent-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await request("/api/agents/register", "POST", formDataToObject(event.currentTarget));
  event.currentTarget.reset();
  await refresh();
});

$("plugin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await request("/api/plugins/register", "POST", formDataToObject(event.currentTarget));
  event.currentTarget.reset();
  await refresh();
});

$("project-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await request("/api/projects/create", "POST", formDataToObject(event.currentTarget));
  event.currentTarget.reset();
  await refresh();
});

refresh();
