function token(name, value, maxLen = 128) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const v = value.trim();
  if (!v) throw new Error(`${name} is required`);
  if (v.length > maxLen) throw new Error(`${name} too long`);
  if (!/^[A-Za-z0-9._:/@-]+$/.test(v)) throw new Error(`${name} contains invalid characters`);
  return v;
}

function text(name, value, maxLen = 512) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const v = value.trim();
  if (v.length > maxLen) throw new Error(`${name} too long`);
  return v;
}

export class ProjectProtocol {
  constructor() {
    this.projects = new Map();
  }

  create({ projectId, ownerHumanId, kind, title, summary = "", pluginIds = [] }) {
    const safeProjectId = token("projectId", projectId);
    if (this.projects.has(safeProjectId)) throw new Error(`duplicate projectId: ${safeProjectId}`);
    const project = {
      projectId: safeProjectId,
      ownerHumanId: token("ownerHumanId", ownerHumanId),
      kind: token("kind", kind, 64),
      title: text("title", title, 160) || safeProjectId,
      summary: text("summary", summary, 1000),
      pluginIds: Array.isArray(pluginIds) ? pluginIds.map((x) => token("pluginId", String(x), 128)) : [],
      state: "active",
      createdAt: Date.now()
    };
    this.projects.set(safeProjectId, project);
    return project;
  }

  list() {
    return [...this.projects.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
}
