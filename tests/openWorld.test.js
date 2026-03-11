import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OpenWorldFramework } from "../src/core/openWorld.js";

class FakeGitHubRepoService {
  constructor() {
    this.calls = [];
  }

  async createInitializedRepo(input) {
    this.calls.push(input);
    return {
      repoFullName: `${input.owner}/${input.repo}`,
      repoUrl: `https://github.com/${input.owner}/${input.repo}`
    };
  }
}

test("open world should register humans with email and agents with status", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-test-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  const human = await world.identity.registerHuman({
    humanId: "human.leo",
    email: "leo@example.com",
    githubLogin: "peterpan42388",
    displayName: "Leo"
  });
  assert.equal(human.email, "leo@example.com");
  assert.equal(human.admissionMethod, "email");

  const agent = await world.identity.registerAgent({
    agentId: "agent.leo.openclaw",
    humanId: "human.leo",
    label: "OpenClaw Main",
    model: "claude-3.7-sonnet",
    online: true
  });
  assert.match(agent.initId, /^init:/);
  assert.ok(agent.currentCredits > 0);
  assert.equal(agent.online, true);
  assert.equal(agent.model, "claude-3.7-sonnet");

  const updated = await world.identity.updateAgentStatus({
    agentId: "agent.leo.openclaw",
    online: false,
    model: "gpt-4.1"
  });
  assert.equal(updated.online, false);
  assert.equal(updated.model, "gpt-4.1");

  const summary = world.summary();
  assert.equal(summary.identity.totals.humans, 1);
  assert.equal(summary.identity.totals.agents, 1);
  assert.equal(summary.identity.totals.onlineAgents, 0);
});

test("project creation should require github-linked human and initialize repo scaffold", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-project-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  await world.identity.registerHuman({
    humanId: "human.leo",
    email: "leo@example.com",
    githubLogin: "peterpan42388"
  });

  await world.identity.registerAgent({
    agentId: "agent.leo.openclaw",
    humanId: "human.leo",
    label: "OpenClaw Main",
    model: "claude-3.7-sonnet",
    online: true
  });

  const project = await world.projects.create({
    ownerHumanId: "human.leo",
    repoName: "elo-agent-onboarder",
    kind: "plugin",
    title: "ELO OpenClaw Onboarding Assistant",
    summary: "First onboarding project",
    memberAgentIds: ["agent.leo.openclaw"],
    pluginIds: ["plugin.elo-protocol"]
  });

  assert.match(project.projectId, /^owp_/);
  assert.equal(project.repoFullName, "peterpan42388/elo-agent-onboarder");
  assert.equal(github.calls.length, 1);

  const localRoot = join(root, "projects", "elo-agent-onboarder");
  await access(join(localRoot, "README.md"));
  await access(join(localRoot, "Rules", "Rule.md"));
  await access(join(localRoot, "History", "Members.md"));
  await access(join(localRoot, "elo-init.md"));
  await access(join(localRoot, "openworld.plugin.json"));
  await access(join(localRoot, "openworld.healthcheck.json"));

  const members = await readFile(join(localRoot, "History", "Members.md"), "utf8");
  assert.match(members, /agent\.leo\.openclaw/);

  const stateRaw = await readFile(join(root, "state.json"), "utf8");
  assert.match(stateRaw, /elo-agent-onboarder/);
});

test("project creation should fail without githubLogin", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-project-fail-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  await world.identity.registerHuman({
    humanId: "human.no-gh",
    email: "nogh@example.com"
  });

  await assert.rejects(
    () =>
      world.projects.create({
        ownerHumanId: "human.no-gh",
        repoName: "should-fail",
        kind: "plugin",
        title: "Should Fail"
      }),
    /must link githubLogin/
  );
});
