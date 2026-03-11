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

export class PluginRegistry {
  constructor() {
    this.plugins = new Map();
  }

  register({ pluginId, ownerHumanId, kind, title, endpoint = "", description = "", capabilities = [] }) {
    const safePluginId = token("pluginId", pluginId);
    if (this.plugins.has(safePluginId)) throw new Error(`duplicate pluginId: ${safePluginId}`);
    const plugin = {
      pluginId: safePluginId,
      ownerHumanId: token("ownerHumanId", ownerHumanId),
      kind: token("kind", kind, 64),
      title: text("title", title, 160) || safePluginId,
      endpoint: text("endpoint", endpoint, 256),
      description: text("description", description, 1000),
      capabilities: Array.isArray(capabilities) ? capabilities.map((x) => token("capability", String(x), 64)) : [],
      createdAt: Date.now()
    };
    this.plugins.set(safePluginId, plugin);
    return plugin;
  }

  list() {
    return [...this.plugins.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
}
