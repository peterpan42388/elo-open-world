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
    kind: "app",
    title: "ELO OpenClaw Onboarding Assistant",
    summary: "First onboarding project",
    memberAgentIds: ["agent.leo.openclaw"],
    pluginIds: ["plugin.elo-protocol"],
    tags: ["onboarding", "openclaw"],
    rating: 4.4,
    heat: 240,
    stage: "operating",
    serviceEndpoint: "https://world.metavie.co/services/elo-agent-onboarder",
    pricingNote: "Free during bootstrap",
    usageNote: "Call the endpoint after generating your onboarding bundle."
  });

  assert.match(project.projectId, /^owp_/);
  assert.equal(project.repoFullName, "peterpan42388/elo-agent-onboarder");
  assert.equal(project.rating, 4.4);
  assert.equal(project.heat, 240);
  assert.deepEqual(project.tags, ["onboarding", "openclaw"]);
  assert.equal(project.stage, "operating");
  assert.equal(project.serviceEndpoint, "https://world.metavie.co/services/elo-agent-onboarder");
  assert.equal(project.pricingNote, "Free during bootstrap");
  assert.equal(project.usageNote, "Call the endpoint after generating your onboarding bundle.");
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
  assert.match(stateRaw, /onboarding/);
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

test("onboarder bundle should generate env json and curl for registered agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-onboarder-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  await world.identity.registerHuman({
    humanId: "human.bundle",
    email: "bundle@example.com",
    githubLogin: "peterpan42388"
  });

  await world.identity.registerAgent({
    agentId: "agent.bundle.openclaw",
    humanId: "human.bundle",
    model: "claude-3.7-sonnet",
    online: true
  });

  const bundle = world.onboarder.generateBundle({
    humanId: "human.bundle",
    agentId: "agent.bundle.openclaw",
    worldUrl: "http://127.0.0.1:8788",
    machineLabel: "leo-mbp"
  });

  assert.equal(bundle.identity.humanId, "human.bundle");
  assert.equal(bundle.identity.agentId, "agent.bundle.openclaw");
  assert.match(bundle.files.env, /ELO_OPEN_WORLD_AGENT_ID=agent\.bundle\.openclaw/);
  assert.match(bundle.files.json, /"machineLabel": "leo-mbp"/);
  assert.match(bundle.files.curl, /api\/agents\/status/);
});

test("universe manifest should expose federation baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-manifest-"));
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    universeConfig: {
      universeId: "elo-universe-9",
      publicBaseUrl: "https://world.example.com",
      operatorLabel: "Example Operator",
      sourceRevision: "abc123"
    }
  }).init();

  const manifest = world.manifest();
  assert.equal(manifest.universeId, "elo-universe-9");
  assert.equal(manifest.publicBaseUrl, "https://world.example.com");
  assert.equal(manifest.operatorLabel, "Example Operator");
  assert.equal(manifest.sourceRevision, "abc123");
  assert.match(manifest.summaryUrl, /api\/world\/summary$/);
  assert.match(manifest.manifestUrl, /api\/universe\/manifest$/);
  assert.ok(Array.isArray(manifest.supportedStandards));
  assert.ok(manifest.supportedStandards.includes("openworld.universe.v1"));
});


test("operating projects list should only expose operating stage items", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-operating-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  await world.identity.registerHuman({
    humanId: "human.ops",
    email: "ops@example.com",
    githubLogin: "peterpan42388"
  });

  await world.projects.create({
    ownerHumanId: "human.ops",
    repoName: "source-project",
    kind: "app",
    title: "Source Project",
    stage: "source"
  });

  await world.projects.create({
    ownerHumanId: "human.ops",
    repoName: "operating-project",
    kind: "app",
    title: "Operating Project",
    stage: "operating",
    rating: 4.8,
    heat: 120
  });

  const operating = world.projects.listOperating();
  assert.equal(operating.length, 1);
  assert.equal(operating[0].repoName, "operating-project");
  assert.equal(operating[0].stage, "operating");
});
