import { asArray, now, slug, text, token, uid } from "../lib/validation.js";

export class ProjectProtocol {
  constructor({ projects = [], identityRegistry, onChange = async () => {}, projectInitializer } = {}) {
    this.projects = new Map(projects.map((project) => [project.projectId, { ...project }]));
    this.identityRegistry = identityRegistry;
    this.onChange = onChange;
    this.projectInitializer = projectInitializer;
  }

  async create({ ownerHumanId, kind, title, summary = "", pluginIds = [], repoName, memberAgentIds = [], visibility = "public" }) {
    const safeOwnerHumanId = token("ownerHumanId", ownerHumanId);
    const ownerHuman = this.identityRegistry.getHuman(safeOwnerHumanId);
    if (!ownerHuman.githubLogin) throw new Error("owner human must link githubLogin before creating a project");

    const safeRepoName = slug("repoName", repoName, 100);
    const safeKind = token("kind", kind, 64);
    const safePluginIds = asArray(pluginIds, "pluginId");
    const safeMemberAgentIds = asArray(memberAgentIds, "agentId");
    const memberAgents = safeMemberAgentIds.map((agentId) => this.identityRegistry.getAgent(agentId));

    const projectId = uid("owp");
    const initialized = await this.projectInitializer.initialize({
      projectId,
      repoName: safeRepoName,
      title: text("title", title, 160) || safeRepoName,
      summary: text("summary", summary, 1000),
      ownerHuman,
      memberAgents,
      pluginIds: safePluginIds,
      visibility
    });

    const project = {
      projectId,
      ownerHumanId: safeOwnerHumanId,
      ownerGithubLogin: ownerHuman.githubLogin,
      kind: safeKind,
      title: text("title", title, 160) || safeRepoName,
      summary: text("summary", summary, 1000),
      pluginIds: safePluginIds,
      memberAgentIds: safeMemberAgentIds,
      repoName: safeRepoName,
      repoFullName: initialized.repoFullName,
      repoUrl: initialized.repoUrl,
      localPath: initialized.localPath,
      state: "initialized",
      createdAt: now()
    };
    this.projects.set(projectId, project);
    await this.onChange();
    return project;
  }

  list() {
    return [...this.projects.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  snapshot() {
    return { projects: this.list() };
  }
}
