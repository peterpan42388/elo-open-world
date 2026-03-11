import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { IdentityRegistry } from "./identityRegistry.js";
import { PluginRegistry } from "./pluginRegistry.js";
import { ProjectProtocol } from "./projectProtocol.js";
import { StateStore } from "../services/stateStore.js";
import { GitHubRepoService } from "../services/githubRepoService.js";
import { ProjectInitializer } from "../services/projectInitializer.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export class OpenWorldFramework {
  constructor({ stateFile, projectsRoot, githubRepoService } = {}) {
    this.stateFile = stateFile || join(ROOT, "runtime", "state.json");
    this.projectsRoot = projectsRoot || join(ROOT, "runtime", "projects");
    this.store = new StateStore(this.stateFile);
    this.githubRepoService = githubRepoService || new GitHubRepoService();
    this.projectInitializer = new ProjectInitializer({
      projectsRoot: this.projectsRoot,
      githubRepoService: this.githubRepoService
    });
    this.identity = null;
    this.plugins = null;
    this.projects = null;
  }

  async init() {
    await mkdir(this.projectsRoot, { recursive: true });
    const snapshot = await this.store.load();
    const persist = async () => {
      await this.store.save(this.snapshot());
    };
    this.identity = new IdentityRegistry({ humans: snapshot.humans, agents: snapshot.agents, onChange: persist });
    this.plugins = new PluginRegistry({ plugins: snapshot.plugins, onChange: persist });
    this.projects = new ProjectProtocol({
      projects: snapshot.projects,
      identityRegistry: this.identity,
      onChange: persist,
      projectInitializer: this.projectInitializer
    });
    return this;
  }

  snapshot() {
    return {
      ...this.identity.snapshot(),
      ...this.plugins.snapshot(),
      ...this.projects.snapshot()
    };
  }

  summary() {
    return {
      world: {
        name: "ELO Open World",
        generatedAt: Date.now(),
        infrastructure: {
          core: [
            "Identity Layer",
            "Protocol Standards",
            "Plugin Extensions",
            "Project Protocol",
            "Web UI"
          ],
          projects: this.projects.list().map((project) => ({
            projectId: project.projectId,
            title: project.title,
            repoName: project.repoName,
            state: project.state
          }))
        }
      },
      identity: this.identity.summary(),
      plugins: this.plugins.list(),
      projects: this.projects.list()
    };
  }
}
