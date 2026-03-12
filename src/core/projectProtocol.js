import { asArray, csvArray, now, numberInRange, slug, text, token, uid } from "../lib/validation.js";

const ALLOWED_MEMBER_ROLES = new Set(["builder", "reviewer", "operator", "maintainer", "observer"]);

function normalizeMemberRoles(memberRoles, memberAgentIds) {
  let raw = memberRoles;
  if (raw === undefined || raw === null || raw === "") raw = {};
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new Error("memberRoles must be valid JSON when provided as a string");
    }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("memberRoles must be an object");
  }
  const normalized = {};
  for (const agentId of memberAgentIds) {
    const role = raw[agentId] === undefined ? "builder" : token("memberRole", String(raw[agentId]), 64).toLowerCase();
    if (!ALLOWED_MEMBER_ROLES.has(role)) {
      throw new Error(`memberRole must be one of: ${[...ALLOWED_MEMBER_ROLES].join(", ")}`);
    }
    normalized[agentId] = role;
  }
  return normalized;
}

export class ProjectProtocol {
  constructor({ projects = [], identityRegistry, requirementRegistry = null, onChange = async () => {}, projectInitializer } = {}) {
    this.projects = new Map(projects.map((project) => [project.projectId, { ...project }]));
    this.identityRegistry = identityRegistry;
    this.requirementRegistry = requirementRegistry;
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
    stage = "source",
    serviceEndpoint = "",
    pricingNote = "",
    usageNote = "",
    requirementId = "",
    memberRoles = {}
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
    const safeServiceEndpoint = text("serviceEndpoint", serviceEndpoint, 256);
    const safePricingNote = text("pricingNote", pricingNote, 256);
    const safeUsageNote = text("usageNote", usageNote, 1000);
    const memberAgents = safeMemberAgentIds.map((agentId) => this.identityRegistry.getAgent(agentId));
    const safeMemberRoles = normalizeMemberRoles(memberRoles, safeMemberAgentIds);

    const projectId = uid("owp");
    const initialized = await this.projectInitializer.initialize({
      projectId,
      repoName: safeRepoName,
      title: text("title", title, 160) || safeRepoName,
      summary: text("summary", summary, 1000),
      ownerHuman,
      memberAgents,
      memberRoles: safeMemberRoles,
      pluginIds: safePluginIds,
      visibility,
      tags: safeTags,
      rating: safeRating,
      heat: safeHeat,
      stage: safeStage,
      serviceEndpoint: safeServiceEndpoint,
      pricingNote: safePricingNote,
      usageNote: safeUsageNote
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
      memberRoles: safeMemberRoles,
      tags: safeTags,
      rating: safeRating,
      heat: safeHeat,
      stage: safeStage,
      requirementId: requirementId ? token("requirementId", requirementId, 128) : "",
      serviceEndpoint: safeServiceEndpoint,
      pricingNote: safePricingNote,
      usageNote: safeUsageNote,
      repoName: safeRepoName,
      repoFullName: initialized.repoFullName,
      repoUrl: initialized.repoUrl,
      localPath: initialized.localPath,
      state: "initialized",
      createdAt: now(),
      updatedAt: now()
    };
    this.projects.set(projectId, project);
    if (project.requirementId && this.requirementRegistry) {
      this.requirementRegistry.attachToProject(project.requirementId, projectId);
    }
    await this.onChange();
    return project;
  }

  async updateMetadata({
    projectId,
    ownerHumanId,
    kind,
    title,
    summary,
    pluginIds,
    memberAgentIds,
    tags,
    rating,
    heat,
    stage,
    state,
    serviceEndpoint,
    pricingNote,
    usageNote,
    memberRoles
  }) {
    const safeProjectId = token("projectId", projectId);
    const project = this.projects.get(safeProjectId);
    if (!project) throw new Error(`unknown projectId: ${safeProjectId}`);

    const safeOwnerHumanId = token("ownerHumanId", ownerHumanId);
    if (project.ownerHumanId !== safeOwnerHumanId) {
      throw new Error("only the project owner can update metadata");
    }

    if (kind !== undefined) project.kind = token("kind", kind, 64);
    if (title !== undefined) project.title = text("title", title, 160) || project.title;
    if (summary !== undefined) project.summary = text("summary", summary, 1000);
    if (pluginIds !== undefined) project.pluginIds = asArray(pluginIds, "pluginId");
    if (memberAgentIds !== undefined) {
      const safeMemberAgentIds = asArray(memberAgentIds, "agentId");
      safeMemberAgentIds.forEach((agentId) => this.identityRegistry.getAgent(agentId));
      project.memberAgentIds = safeMemberAgentIds;
      project.memberRoles = normalizeMemberRoles(memberRoles !== undefined ? memberRoles : project.memberRoles || {}, safeMemberAgentIds);
    }
    if (memberAgentIds === undefined && memberRoles !== undefined) {
      project.memberRoles = normalizeMemberRoles(memberRoles, project.memberAgentIds || []);
    }
    if (tags !== undefined) project.tags = csvArray(tags, "tag", 64);
    if (rating !== undefined) project.rating = numberInRange("rating", rating, 0, 5, project.rating || 0);
    if (heat !== undefined) project.heat = numberInRange("heat", heat, 0, 1_000_000, project.heat || 0);
    if (stage !== undefined) project.stage = token("stage", stage, 32).toLowerCase();
    if (state !== undefined) project.state = token("state", state, 32).toLowerCase();
    if (serviceEndpoint !== undefined) project.serviceEndpoint = text("serviceEndpoint", serviceEndpoint, 256);
    if (pricingNote !== undefined) project.pricingNote = text("pricingNote", pricingNote, 256);
    if (usageNote !== undefined) project.usageNote = text("usageNote", usageNote, 1000);
    project.updatedAt = now();

    await this.onChange();
    return { ...project };
  }

  list() {
    return [...this.projects.values()].sort((a, b) => {
      if ((b.heat || 0) !== (a.heat || 0)) return (b.heat || 0) - (a.heat || 0);
      return a.createdAt - b.createdAt;
    });
  }

  listOperating() {
    return this.list().filter((project) => project.stage === "operating");
  }

  snapshot() {
    return { projects: this.list() };
  }
}
