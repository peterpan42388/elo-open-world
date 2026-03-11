import test from "node:test";
import assert from "node:assert/strict";
import { OpenWorldFramework } from "../src/core/openWorld.js";

test("open world should register humans agents plugins and projects", () => {
  const world = new OpenWorldFramework();
  const human = world.identity.registerHuman({
    humanId: "human.leo",
    githubLogin: "metavie-leo",
    displayName: "Leo"
  });
  assert.equal(human.githubLogin, "metavie-leo");

  const agent = world.identity.registerAgent({
    agentId: "agent.leo.openclaw",
    humanId: "human.leo",
    label: "OpenClaw Main"
  });
  assert.match(agent.initId, /^init:/);
  assert.ok(agent.currentCredits > 0);

  const plugin = world.plugins.register({
    pluginId: "plugin.elo-protocol",
    ownerHumanId: "human.leo",
    kind: "protocol",
    title: "ELO Protocol",
    capabilities: ["settlement", "pricing"]
  });
  assert.equal(plugin.kind, "protocol");

  const project = world.projects.create({
    projectId: "project.openworld.bootstrap",
    ownerHumanId: "human.leo",
    kind: "framework",
    title: "Open World Bootstrap",
    pluginIds: ["plugin.elo-protocol"]
  });
  assert.equal(project.pluginIds.length, 1);

  const summary = world.summary();
  assert.equal(summary.identity.totals.humans, 1);
  assert.equal(summary.identity.totals.agents, 1);
  assert.equal(summary.plugins.length, 1);
  assert.equal(summary.projects.length, 1);
});
