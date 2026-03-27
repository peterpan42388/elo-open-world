import { csvArray, now, text, token, uid } from "../lib/validation.js";

function buildTimelineEntry({ type, actorType = "system", actorId = "", summary = "", details = {} }) {
  return {
    timelineId: uid("evt"),
    type: token("type", type, 64).toLowerCase(),
    actorType: token("actorType", actorType || "system", 32).toLowerCase(),
    actorId: actorId ? token("actorId", actorId, 128) : "",
    summary: text("summary", summary || "", 2000),
    details: details && typeof details === "object" ? JSON.parse(JSON.stringify(details)) : {},
    createdAt: now()
  };
}

function normalizeRefinementSummary(response) {
  const source = response && typeof response === "object" ? response : {};
  const restatedRequirement = text("restatedRequirement", source.restatedRequirement || source.message || "", 4000);
  const projectDirection = text("projectDirection", source.projectDirection || "", 4000);
  const milestones = Array.isArray(source.milestones)
    ? source.milestones.map((item) => text("milestone", String(item), 512)).filter(Boolean)
    : [];
  const questions = Array.isArray(source.questions)
    ? source.questions.map((item) => text("question", String(item), 512)).filter(Boolean)
    : [];
  return {
    restatedRequirement,
    projectDirection,
    milestones,
    questions
  };
}

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
    source = "manual",
    primaryAgentId = "",
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
    const safePrimaryAgentId = primaryAgentId ? token("primaryAgentId", primaryAgentId, 128) : "";
    if (safePrimaryAgentId) {
      const agent = this.identityRegistry.getAgent(safePrimaryAgentId);
      const effectiveOwnerHumanId = safeCreatedByType === "human"
        ? safeCreatedById
        : safeOwnerHumanId || this.identityRegistry.getAgent(safeCreatedById).humanId;
      if (agent.humanId !== effectiveOwnerHumanId) {
        throw new Error("primaryAgentId must belong to the requirement owner");
      }
    }
    if (reviewerHumanId) this.identityRegistry.getHuman(token("reviewerHumanId", reviewerHumanId, 128));

    const requirement = {
      requirementId: uid("owr"),
      title: text("title", title, 160),
      summary: text("summary", summary, 2000),
      desiredKind: token("desiredKind", desiredKind, 64).toLowerCase(),
      tags: csvArray(tags, "tag", 64),
      source: token("source", source || "manual", 64).toLowerCase(),
      primaryAgentId: safePrimaryAgentId,
      createdByType: safeCreatedByType,
      createdById: safeCreatedById,
      ownerHumanId: safeCreatedByType === "human" ? safeCreatedById : safeOwnerHumanId || this.identityRegistry.getAgent(safeCreatedById).humanId,
      reviewerHumanId: reviewerHumanId ? token("reviewerHumanId", reviewerHumanId, 128) : "",
      reviewNote: text("reviewNote", reviewNote, 2000),
      acceptedByHumanId: "",
      rejectedByHumanId: "",
      reviewHistory: [],
      conversationTimeline: [],
      refinementCount: 0,
      agentRefinements: [],
      latestRefinementSummary: {
        restatedRequirement: "",
        projectDirection: "",
        milestones: [],
        questions: []
      },
      rereviewCount: 0,
      status: "drafted",
      linkedProjectId: "",
      createdAt: now(),
      updatedAt: now(),
      reviewedAt: 0
    };

    requirement.conversationTimeline.push(buildTimelineEntry({
      type: safeCreatedByType === "human" ? "requirement-created" : "agent-requirement-created",
      actorType: safeCreatedByType,
      actorId: safeCreatedById,
      summary: `Requirement created from ${requirement.source}.`,
      details: {
        title: requirement.title,
        desiredKind: requirement.desiredKind,
        source: requirement.source,
        primaryAgentId: requirement.primaryAgentId
      }
    }));

    this.requirements.set(requirement.requirementId, requirement);
    await this.onChange();
    return { ...requirement };
  }

  async addRefinement({ requirementId, humanId, agentId, response, prompt = "", promptedAt = 0 }) {
    const safeRequirementId = token("requirementId", requirementId, 128);
    const safeHumanId = token("humanId", humanId, 128);
    const safeAgentId = token("agentId", agentId, 128);
    const requirement = this.requirements.get(safeRequirementId);
    if (!requirement) throw new Error(`unknown requirementId: ${safeRequirementId}`);

    const human = this.identityRegistry.getHuman(safeHumanId);
    const agent = this.identityRegistry.getAgent(safeAgentId);
    if (human.humanId !== requirement.ownerHumanId) {
      throw new Error("only the requirement owner can persist agent refinements");
    }
    if (agent.humanId !== requirement.ownerHumanId) {
      throw new Error("agentId must belong to the requirement owner");
    }
    const normalizedPrompt = text("prompt", prompt || "", 20000);
    const safePromptedAt = Number(promptedAt) > 0 ? Number(promptedAt) : now();
    const normalizedResponse = typeof response === "string"
      ? { message: text("response", response, 8000) }
      : response && typeof response === "object"
        ? JSON.parse(JSON.stringify(response))
        : { message: "" };

    const entry = {
      agentId: safeAgentId,
      humanId: safeHumanId,
      promptedAt: safePromptedAt,
      respondedAt: now(),
      prompt: normalizedPrompt,
      response: normalizedResponse,
      summary: normalizeRefinementSummary(normalizedResponse)
    };
    requirement.agentRefinements.push(entry);
    requirement.refinementCount = requirement.agentRefinements.length;
    requirement.latestRefinementSummary = entry.summary;
    requirement.updatedAt = entry.respondedAt;
    if (normalizedPrompt) {
      requirement.conversationTimeline.push({
        timelineId: uid("evt"),
        type: "human-starter-message",
        actorType: "human",
        actorId: safeHumanId,
        summary: normalizedPrompt.slice(0, 240),
        details: {
          prompt: normalizedPrompt,
          requirementId: safeRequirementId,
          primaryAgentId: safeAgentId
        },
        createdAt: safePromptedAt
      });
    }
    requirement.conversationTimeline.push(buildTimelineEntry({
      type: "agent-refinement",
      actorType: "agent",
      actorId: safeAgentId,
      summary: entry.summary.restatedRequirement || "Agent refined the starter requirement.",
      details: {
        humanId: safeHumanId,
        projectDirection: entry.summary.projectDirection,
        milestones: entry.summary.milestones,
        questions: entry.summary.questions,
        prompt: normalizedPrompt,
        response: normalizedResponse
      }
    }));
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
    requirement.conversationTimeline.push(buildTimelineEntry({
      type: "project-created-from-requirement",
      actorType: "system",
      actorId: requirement.ownerHumanId,
      summary: "Requirement transitioned into a source project.",
      details: {
        linkedProjectId: requirement.linkedProjectId
      }
    }));
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
      requirement.conversationTimeline.push(buildTimelineEntry({
        type: "requirement-accepted",
        actorType: "human",
        actorId: safeReviewerHumanId,
        summary: "Requirement accepted for implementation.",
        details: {
          reviewNote: requirement.reviewNote
        }
      }));
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
      requirement.conversationTimeline.push(buildTimelineEntry({
        type: "requirement-rejected",
        actorType: "human",
        actorId: safeReviewerHumanId,
        summary: "Requirement rejected and returned for revision.",
        details: {
          reviewNote: requirement.reviewNote
        }
      }));
    }
    if (safeStatus === "drafted" && requirement.reviewHistory.length) {
      requirement.rereviewCount += 1;
      requirement.reviewHistory.push({
        status: "rereview-requested",
        reviewerHumanId: safeReviewerHumanId,
        reviewNote: requirement.reviewNote,
        reviewedAt: requirement.updatedAt
      });
      requirement.conversationTimeline.push(buildTimelineEntry({
        type: "rereview-requested",
        actorType: "human",
        actorId: safeReviewerHumanId,
        summary: "Re-review requested.",
        details: {
          reviewNote: requirement.reviewNote,
          rereviewCount: requirement.rereviewCount
        }
      }));
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
