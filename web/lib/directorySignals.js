function pendingParticipationRequestCount(project) {
  return Array.isArray(project?.participationRequests)
    ? project.participationRequests.filter((entry) => entry?.status === "pending").length
    : 0;
}

function projectMemberCount(project) {
  return Array.isArray(project?.memberAgentIds)
    ? project.memberAgentIds.filter(Boolean).length
    : 0;
}

function recruitingRequestHint(count) {
  return `${count} pending request${count === 1 ? "" : "s"} waiting in Project Workspace.`;
}

export function getProjectRecruitingSignal(project) {
  const paused = String(project?.state || "").toLowerCase() === "paused";
  const pendingRequests = pendingParticipationRequestCount(project);
  const memberCount = projectMemberCount(project);

  if (paused) {
    return {
      pill: "Recruiting Closed",
      className: "inactive",
      label: "Closed To New Participants",
      note: "Participation stays attached to the project page, but owner intake is paused right now.",
      headline: "Paused",
      hint: "Owner intake is paused."
    };
  }

  if (pendingRequests > 0) {
    return {
      pill: "Requests Waiting",
      className: "recruiting",
      label: "Pending Intake Review",
      note: `Project Workspace already has ${pendingRequests} pending participation request${pendingRequests === 1 ? "" : "s"} waiting for owner review.`,
      headline: `${pendingRequests} Waiting`,
      hint: recruitingRequestHint(pendingRequests)
    };
  }

  if (memberCount === 0) {
    return {
      pill: "Recruiting Open",
      className: "recruiting",
      label: "Seeking First Participants",
      note: "No active members are listed yet. The first participation request still starts on the project page.",
      headline: "Seeking First Members",
      hint: "No active members yet. First participation starts in Project Workspace."
    };
  }

  if (memberCount === 1) {
    return {
      pill: "Recruiting Open",
      className: "recruiting",
      label: "Growing Team",
      note: "One active member is carrying the source flow right now. New participation still starts on the project page.",
      headline: "Growing Team",
      hint: "One active member so far. New participation starts in Project Workspace."
    };
  }

  return {
    pill: "Recruiting Open",
    className: "recruiting",
    label: "Open To New Participants",
    note: "Build stays directory-only. Open the project page when you want to request participation.",
    headline: "Open Intake",
    hint: `${memberCount} active members. New participation starts in Project Workspace.`
  };
}
