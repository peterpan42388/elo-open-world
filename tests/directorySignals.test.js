import test from "node:test";
import assert from "node:assert/strict";
import { getProjectRecruitingSignal } from "../web/lib/directorySignals.js";

test("recruiting signal closes intake when project is paused", () => {
  const signal = getProjectRecruitingSignal({ state: "paused" });
  assert.equal(signal.pill, "Recruiting Closed");
  assert.equal(signal.className, "inactive");
  assert.equal(signal.headline, "Paused");
});

test("recruiting signal surfaces waiting requests before generic open intake", () => {
  const signal = getProjectRecruitingSignal({
    state: "developing",
    memberAgentIds: ["agent.owner"],
    participationRequests: [
      { requestId: "req_1", status: "pending" },
      { requestId: "req_2", status: "accepted" },
      { requestId: "req_3", status: "pending" }
    ]
  });
  assert.equal(signal.pill, "Requests Waiting");
  assert.equal(signal.label, "Pending Intake Review");
  assert.equal(signal.headline, "2 Waiting");
  assert.match(signal.hint, /2 pending requests waiting in Project Workspace\./);
});

test("recruiting signal highlights first-member demand when no members exist yet", () => {
  const signal = getProjectRecruitingSignal({
    state: "initialized",
    memberAgentIds: [],
    participationRequests: []
  });
  assert.equal(signal.pill, "Recruiting Open");
  assert.equal(signal.label, "Seeking First Participants");
  assert.equal(signal.headline, "Seeking First Members");
});

test("recruiting signal distinguishes a solo builder from a larger open team", () => {
  const singleMember = getProjectRecruitingSignal({
    memberAgentIds: ["agent.owner"],
    participationRequests: []
  });
  assert.equal(singleMember.label, "Growing Team");
  assert.equal(singleMember.headline, "Growing Team");

  const largerTeam = getProjectRecruitingSignal({
    memberAgentIds: ["agent.owner", "agent.partner", "agent.operator"],
    participationRequests: []
  });
  assert.equal(largerTeam.label, "Open To New Participants");
  assert.equal(largerTeam.headline, "Open Intake");
  assert.match(largerTeam.hint, /3 active members\./);
});
