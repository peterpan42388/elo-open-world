import { csvArray, now, text, token, uid } from "../lib/validation.js";

export class ProjectRequirementRegistry {
  constructor({ requirements = [], identityRegistry, onChange = async () => {} } = {}) {
    this.requirements = new Map(requirements.map((item) => [item.requirementId, { ...item }]));
    this.identityRegistry = identityRegistry;
    this.onChange = onChange;
  }

  async create({
    title,
    summary = "",
    desiredKind = "other",
    tags = [],
    createdByType,
    createdById,
    ownerHumanId = ""
  }) {
    const safeCreatedByType = token("createdByType", createdByType, 32).toLowerCase();
    if (!["human", "agent"].includes(safeCreatedByType)) throw new Error("createdByType must be human or agent");
    const safeCreatedById = token("createdById", createdById, 128);
    const safeOwnerHumanId = ownerHumanId ? token("ownerHumanId", ownerHumanId, 128) : "";
    if (safeCreatedByType === "human") {
      this.identityRegistry.getHuman(safeCreatedById);
    } else {
      const agent = this.identityRegistry.getAgent(safeCreatedById);
      if (safeOwnerHumanId && agent.humanId !== safeOwnerHumanId) {
        throw new Error("agent ownerHumanId does not match provided ownerHumanId");
      }
    }

    const requirement = {
      requirementId: uid("owr"),
      title: text("title", title, 160),
      summary: text("summary", summary, 2000),
      desiredKind: token("desiredKind", desiredKind, 64).toLowerCase(),
      tags: csvArray(tags, "tag", 64),
      createdByType: safeCreatedByType,
      createdById: safeCreatedById,
      ownerHumanId: safeCreatedByType === "human" ? safeCreatedById : safeOwnerHumanId || this.identityRegistry.getAgent(safeCreatedById).humanId,
      status: "drafted",
      linkedProjectId: "",
      createdAt: now(),
      updatedAt: now()
    };

    this.requirements.set(requirement.requirementId, requirement);
    await this.onChange();
    return { ...requirement };
  }

  attachToProject(requirementId, projectId) {
    if (!requirementId) return null;
    const safeRequirementId = token("requirementId", requirementId, 128);
    const requirement = this.requirements.get(safeRequirementId);
    if (!requirement) throw new Error(`unknown requirementId: ${safeRequirementId}`);
    requirement.status = "implemented";
    requirement.linkedProjectId = token("projectId", projectId, 128);
    requirement.updatedAt = now();
    return { ...requirement };
  }

  async updateStatus({ requirementId, status }) {
    const safeRequirementId = token("requirementId", requirementId, 128);
    const safeStatus = token("status", status, 32).toLowerCase();
    if (!["drafted", "accepted", "rejected", "implemented"].includes(safeStatus)) {
      throw new Error("invalid requirement status");
    }
    const requirement = this.requirements.get(safeRequirementId);
    if (!requirement) throw new Error(`unknown requirementId: ${safeRequirementId}`);
    if (requirement.linkedProjectId && safeStatus !== "implemented") {
      throw new Error("implemented requirement cannot move to a non-implemented state");
    }
    requirement.status = safeStatus;
    requirement.updatedAt = now();
    await this.onChange();
    return { ...requirement };
  }

  list() {
    return [...this.requirements.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  snapshot() {
    return { requirements: this.list() };
  }
}
