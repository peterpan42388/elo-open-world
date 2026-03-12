import { asArray, csvArray, now, numberInRange, slug, text, token, uid } from "../lib/validation.js";

export class ProjectProtocol {
  constructor({ projects = [], identityRegistry, onChange = async () => {}, projectInitializer } = {}) {
    this.projects = new Map(projects.map((project) => [project.projectId, { ...project }]));
    this.identityRegistry = identityRegistry;
    this.onChange = onChange;
    this.projectInitializer = projectInitializer;
  }

  async create({
    ownerHumanId,
    kind,
    title,
    summary = "",
    pluginIds = [],
    repoName,
    memberAgentIds = [],
    visibility = "public",
    tags = [],
    rating = 0,
    heat = 0,
    stage = "source"
  }) {
    const safeOwnerHumanId = token("ownerHumanId", ownerHumanId);
    const ownerHuman = this.identityRegistry.getHuman(safeOwnerHumanId);
    if (!ownerHuman.githubLogin) throw new Error("owner human must link githubLogin before creating a project");

    const safeRepoName = slug("repoName", repoName, 100);
    const safeKind = token("kind", kind, 64);
    const safePluginIds = asArray(pluginIds, "pluginId");
    const safeMemberAgentIds = asArray(memberAgentIds, "agentId");
    const safeTags = csvArray(tags, "tag", 64);
    const safeStage = token("stage", stage, 32).toLowerCase();
    const safeRating = numberInRange("rating", rating, 0, 5, 0);
    const safeHeat = numberInRange("heat", heat, 0, 1_000_000, 0);
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
      visibility,
      tags: safeTags,
      rating: safeRating,
      heat: safeHeat,
      stage: safeStage
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
      tags: safeTags,
      rating: safeRating,
      heat: safeHeat,
      stage: safeStage,
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
    return [...this.projects.values()].sort((a, b) => {
      if ((b.heat || 0) !== (a.heat || 0)) return (b.heat || 0) - (a.heat || 0);
      return a.createdAt - b.createdAt;
    });
  }

  snapshot() {
    return { projects: this.list() };
  }
}
