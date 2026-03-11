import { asArray, now, text, token } from "../lib/validation.js";

export class PluginRegistry {
  constructor({ plugins = [], onChange = async () => {} } = {}) {
    this.plugins = new Map(plugins.map((plugin) => [plugin.pluginId, { ...plugin }]));
    this.onChange = onChange;
  }

  async register({ pluginId, ownerHumanId, kind, title, endpoint = "", description = "", capabilities = [] }) {
    const safePluginId = token("pluginId", pluginId);
    if (this.plugins.has(safePluginId)) throw new Error(`duplicate pluginId: ${safePluginId}`);
    const plugin = {
      pluginId: safePluginId,
      ownerHumanId: token("ownerHumanId", ownerHumanId),
      kind: token("kind", kind, 64),
      title: text("title", title, 160) || safePluginId,
      endpoint: text("endpoint", endpoint, 256),
      description: text("description", description, 1000),
      capabilities: asArray(capabilities, "capability", 64),
      manifestStandard: "elo-open-world.plugin.v1",
      healthcheckStandard: "elo-open-world.healthcheck.v1",
      createdAt: now()
    };
    this.plugins.set(safePluginId, plugin);
    await this.onChange();
    return plugin;
  }

  list() {
    return [...this.plugins.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  snapshot() {
    return { plugins: this.list() };
  }
}
