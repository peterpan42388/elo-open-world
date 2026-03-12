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
    ownerHumanId = "",
    reviewerHumanId = "",
    reviewNote = ""
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
    if (reviewerHumanId) this.identityRegistry.getHuman(token("reviewerHumanId", reviewerHumanId, 128));

    const requirement = {
      requirementId: uid("owr"),
      title: text("title", title, 160),
      summary: text("summary", summary, 2000),
      desiredKind: token("desiredKind", desiredKind, 64).toLowerCase(),
      tags: csvArray(tags, "tag", 64),
      createdByType: safeCreatedByType,
      createdById: safeCreatedById,
      ownerHumanId: safeCreatedByType === "human" ? safeCreatedById : safeOwnerHumanId || this.identityRegistry.getAgent(safeCreatedById).humanId,
      reviewerHumanId: reviewerHumanId ? token("reviewerHumanId", reviewerHumanId, 128) : "",
      reviewNote: text("reviewNote", reviewNote, 2000),
      acceptedByHumanId: "",
      rejectedByHumanId: "",
      reviewHistory: [],
      rereviewCount: 0,
      status: "drafted",
      linkedProjectId: "",
      createdAt: now(),
      updatedAt: now(),
      reviewedAt: 0
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

  async updateStatus({ requirementId, status, reviewerHumanId = "", reviewNote = "" }) {
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
    const safeReviewerHumanId = reviewerHumanId ? token("reviewerHumanId", reviewerHumanId, 128) : "";
    if (["accepted", "rejected"].includes(safeStatus)) {
      if (!safeReviewerHumanId) throw new Error("reviewerHumanId is required when accepting or rejecting a requirement");
      this.identityRegistry.getHuman(safeReviewerHumanId);
      const existingReviewer = requirement.reviewerHumanId || "";
      const ownerHumanId = requirement.ownerHumanId || "";
      if (existingReviewer && safeReviewerHumanId !== existingReviewer && safeReviewerHumanId !== ownerHumanId) {
        throw new Error("reviewerHumanId must match the assigned reviewer or requirement owner");
      }
    }
    if (safeStatus === "drafted" && requirement.status !== "drafted") {
      if (!safeReviewerHumanId) throw new Error("reviewerHumanId is required when requesting re-review");
      this.identityRegistry.getHuman(safeReviewerHumanId);
      const existingReviewer = requirement.reviewerHumanId || "";
      const ownerHumanId = requirement.ownerHumanId || "";
      if (existingReviewer && safeReviewerHumanId !== existingReviewer && safeReviewerHumanId !== ownerHumanId) {
        throw new Error("reviewerHumanId must match the assigned reviewer or requirement owner");
      }
    }
    requirement.status = safeStatus;
    if (safeReviewerHumanId) requirement.reviewerHumanId = safeReviewerHumanId;
    if (reviewNote !== undefined) requirement.reviewNote = text("reviewNote", reviewNote, 2000);
    requirement.updatedAt = now();
    if (safeStatus === "accepted") {
      requirement.acceptedByHumanId = safeReviewerHumanId;
      requirement.rejectedByHumanId = "";
      requirement.reviewedAt = requirement.updatedAt;
      requirement.reviewHistory.push({
        status: safeStatus,
        reviewerHumanId: safeReviewerHumanId,
        reviewNote: requirement.reviewNote,
        reviewedAt: requirement.reviewedAt
      });
    }
    if (safeStatus === "rejected") {
      requirement.rejectedByHumanId = safeReviewerHumanId;
      requirement.acceptedByHumanId = "";
      requirement.reviewedAt = requirement.updatedAt;
      requirement.reviewHistory.push({
        status: safeStatus,
        reviewerHumanId: safeReviewerHumanId,
        reviewNote: requirement.reviewNote,
        reviewedAt: requirement.reviewedAt
      });
    }
    if (safeStatus === "drafted" && requirement.reviewHistory.length) {
      requirement.rereviewCount += 1;
      requirement.reviewHistory.push({
        status: "rereview-requested",
        reviewerHumanId: safeReviewerHumanId,
        reviewNote: requirement.reviewNote,
        reviewedAt: requirement.updatedAt
      });
    }
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
