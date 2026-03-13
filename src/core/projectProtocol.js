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
      memberInvites: [],
      memberHistory: safeMemberAgentIds.map((agentId) => ({
        type: "member-added",
        agentId,
        role: safeMemberRoles[agentId],
        actorHumanId: safeOwnerHumanId,
        at: now()
      })),
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

  async inviteMember({ projectId, ownerHumanId, agentId, role = "builder" }) {
    const project = this.#assertOwnerProject({ projectId, ownerHumanId });
    const safeAgentId = token("agentId", agentId);
    this.identityRegistry.getAgent(safeAgentId);
    const safeRole = token("memberRole", String(role), 64).toLowerCase();
    if (!ALLOWED_MEMBER_ROLES.has(safeRole)) {
      throw new Error(`memberRole must be one of: ${[...ALLOWED_MEMBER_ROLES].join(", ")}`);
    }
    if ((project.memberAgentIds || []).includes(safeAgentId)) {
      throw new Error("agent is already a project member");
    }
    project.memberInvites = project.memberInvites || [];
    const existingInvite = project.memberInvites.find((invite) => invite.agentId === safeAgentId && invite.status === "pending");
    if (existingInvite) throw new Error("pending invite already exists for this agent");
    const invite = {
      inviteId: uid("invite"),
      agentId: safeAgentId,
      role: safeRole,
      status: "pending",
      createdAt: now(),
      actorHumanId: token("ownerHumanId", ownerHumanId)
    };
    project.memberInvites.push(invite);
    project.memberHistory = project.memberHistory || [];
    project.memberHistory.push({
      type: "member-invited",
      agentId: safeAgentId,
      role: safeRole,
      actorHumanId: token("ownerHumanId", ownerHumanId),
      at: now()
    });
    project.updatedAt = now();
    await this.onChange();
    return { ...project };
  }

  async acceptInvite({ projectId, ownerHumanId, inviteId }) {
    const project = this.#assertOwnerProject({ projectId, ownerHumanId });
    const safeInviteId = token("inviteId", inviteId, 128);
    const invite = (project.memberInvites || []).find((item) => item.inviteId === safeInviteId);
    if (!invite) throw new Error(`unknown inviteId: ${safeInviteId}`);
    if (invite.status !== "pending") throw new Error("invite is not pending");
    project.memberAgentIds = project.memberAgentIds || [];
    if (!project.memberAgentIds.includes(invite.agentId)) {
      project.memberAgentIds.push(invite.agentId);
    }
    project.memberRoles = normalizeMemberRoles({
      ...(project.memberRoles || {}),
      [invite.agentId]: invite.role
    }, project.memberAgentIds);
    invite.status = "accepted";
    invite.acceptedAt = now();
    project.memberHistory = project.memberHistory || [];
    project.memberHistory.push({
      type: "member-added",
      agentId: invite.agentId,
      role: invite.role,
      actorHumanId: token("ownerHumanId", ownerHumanId),
      at: now()
    });
    project.updatedAt = now();
    await this.onChange();
    return { ...project };
  }

  async changeMemberRole({ projectId, ownerHumanId, agentId, role }) {
    const project = this.#assertOwnerProject({ projectId, ownerHumanId });
    const safeAgentId = token("agentId", agentId);
    if (!(project.memberAgentIds || []).includes(safeAgentId)) {
      throw new Error("agent is not a current project member");
    }
    const safeRole = token("memberRole", String(role), 64).toLowerCase();
    if (!ALLOWED_MEMBER_ROLES.has(safeRole)) {
      throw new Error(`memberRole must be one of: ${[...ALLOWED_MEMBER_ROLES].join(", ")}`);
    }
    project.memberRoles = normalizeMemberRoles({
      ...(project.memberRoles || {}),
      [safeAgentId]: safeRole
    }, project.memberAgentIds || []);
    project.memberHistory = project.memberHistory || [];
    project.memberHistory.push({
      type: "member-role-changed",
      agentId: safeAgentId,
      role: safeRole,
      actorHumanId: token("ownerHumanId", ownerHumanId),
      at: now()
    });
    project.updatedAt = now();
    await this.onChange();
    return { ...project };
  }

  async removeMember({ projectId, ownerHumanId, agentId }) {
    const project = this.#assertOwnerProject({ projectId, ownerHumanId });
    const safeAgentId = token("agentId", agentId);
    if (!(project.memberAgentIds || []).includes(safeAgentId)) {
      throw new Error("agent is not a current project member");
    }
    project.memberAgentIds = (project.memberAgentIds || []).filter((item) => item !== safeAgentId);
    project.memberRoles = normalizeMemberRoles(
      Object.fromEntries(Object.entries(project.memberRoles || {}).filter(([key]) => key !== safeAgentId)),
      project.memberAgentIds
    );
    project.memberHistory = project.memberHistory || [];
    project.memberHistory.push({
      type: "member-removed",
      agentId: safeAgentId,
      actorHumanId: token("ownerHumanId", ownerHumanId),
      at: now()
    });
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

  #assertOwnerProject({ projectId, ownerHumanId }) {
    const safeProjectId = token("projectId", projectId);
    const project = this.projects.get(safeProjectId);
    if (!project) throw new Error(`unknown projectId: ${safeProjectId}`);
    const safeOwnerHumanId = token("ownerHumanId", ownerHumanId);
    if (project.ownerHumanId !== safeOwnerHumanId) {
      throw new Error("only the project owner can manage membership");
    }
    return project;
  }
}
