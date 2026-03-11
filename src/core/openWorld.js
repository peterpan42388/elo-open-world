import { IdentityRegistry } from "./identityRegistry.js";
import { PluginRegistry } from "./pluginRegistry.js";
import { ProjectProtocol } from "./projectProtocol.js";

export class OpenWorldFramework {
  constructor() {
    this.identity = new IdentityRegistry();
    this.plugins = new PluginRegistry();
    this.projects = new ProjectProtocol();
  }

  summary() {
    return {
      world: {
        name: "ELO Open World",
        generatedAt: Date.now()
      },
      identity: this.identity.summary(),
      plugins: this.plugins.list(),
      projects: this.projects.list()
    };
  }
}
