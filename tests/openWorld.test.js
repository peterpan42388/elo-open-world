import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
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
    displayName: "Leo",
    password: "test-password-1"
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
    githubLogin: "peterpan42388",
    password: "test-password-2"
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
  assert.match(members, /role=builder/);

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
    email: "nogh@example.com",
    password: "test-password-3"
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
    githubLogin: "peterpan42388",
    password: "test-password-4"
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
    githubLogin: "peterpan42388",
    password: "test-password-5"
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


test("project metadata update should persist editable fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-update-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  await world.identity.registerHuman({
    humanId: "human.edit",
    email: "edit@example.com",
    githubLogin: "peterpan42388",
    password: "test-password-6"
  });

  await world.identity.registerAgent({
    agentId: "agent.edit.openclaw",
    humanId: "human.edit",
    label: "Edit Agent",
    model: "claude-3.7-sonnet",
    online: true
  });

  const project = await world.projects.create({
    ownerHumanId: "human.edit",
    repoName: "editable-project",
    kind: "app",
    title: "Editable Project"
  });

  const updated = await world.projects.updateMetadata({
    projectId: project.projectId,
    ownerHumanId: "human.edit",
    title: "Editable Project Updated",
    tags: ["edited", "market"],
    rating: 4.9,
    heat: 900,
    stage: "operating",
    state: "operating",
    memberAgentIds: ["agent.edit.openclaw"],
    memberRoles: { "agent.edit.openclaw": "operator" },
    serviceEndpoint: "https://world.metavie.co/services/editable-project",
    pricingNote: "10 ELO per call",
    usageNote: "Call from your agent workflow"
  });

  assert.equal(updated.title, "Editable Project Updated");
  assert.deepEqual(updated.tags, ["edited", "market"]);
  assert.equal(updated.rating, 4.9);
  assert.equal(updated.heat, 900);
  assert.equal(updated.stage, "operating");
  assert.equal(updated.state, "operating");
  assert.deepEqual(updated.memberRoles, { "agent.edit.openclaw": "operator" });
  assert.equal(updated.serviceEndpoint, "https://world.metavie.co/services/editable-project");
  assert.equal(world.projects.listOperating().length, 1);
});

test("project member roles should reject unknown role values", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-member-roles-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  await world.identity.registerHuman({
    humanId: "human.roles",
    email: "roles@example.com",
    githubLogin: "peterpan42388",
    password: "test-password-roles"
  });

  await world.identity.registerAgent({
    agentId: "agent.roles.openclaw",
    humanId: "human.roles",
    label: "Roles Agent",
    model: "claude-3.7-sonnet",
    online: true
  });

  await assert.rejects(
    () => world.projects.create({
      ownerHumanId: "human.roles",
      repoName: "bad-member-role",
      kind: "app",
      title: "Bad Member Role",
      memberAgentIds: ["agent.roles.openclaw"],
      memberRoles: { "agent.roles.openclaw": "captain" }
    }),
    /memberRole must be one of/
  );
});

test("project member roles should accept stringified JSON input", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-member-roles-json-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  await world.identity.registerHuman({
    humanId: "human.rolesjson",
    email: "rolesjson@example.com",
    githubLogin: "peterpan42388",
    password: "test-password-rolesjson"
  });

  await world.identity.registerAgent({
    agentId: "agent.rolesjson.openclaw",
    humanId: "human.rolesjson",
    label: "Roles JSON Agent",
    model: "claude-3.7-sonnet",
    online: true
  });

  const project = await world.projects.create({
    ownerHumanId: "human.rolesjson",
    repoName: "json-member-role",
    kind: "app",
    title: "JSON Member Role",
    memberAgentIds: ["agent.rolesjson.openclaw"],
    memberRoles: "{\"agent.rolesjson.openclaw\":\"maintainer\"}"
  });

  assert.deepEqual(project.memberRoles, { "agent.rolesjson.openclaw": "maintainer" });
});

test("project membership workflow should support invite accept role change and removal", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-membership-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  await world.identity.registerHuman({
    humanId: "human.owner",
    email: "owner@example.com",
    githubLogin: "peterpan42388",
    password: "test-password-9"
  });

  await world.identity.registerAgent({
    agentId: "agent.owner.main",
    humanId: "human.owner",
    online: true
  });

  await world.identity.registerAgent({
    agentId: "agent.owner.worker",
    humanId: "human.owner",
    online: true
  });

  const project = await world.projects.create({
    ownerHumanId: "human.owner",
    repoName: "membership-project",
    kind: "app",
    title: "Membership Project",
    memberAgentIds: ["agent.owner.main"]
  });

  const invited = await world.projects.inviteMember({
    projectId: project.projectId,
    ownerHumanId: "human.owner",
    agentId: "agent.owner.worker",
    role: "operator"
  });
  assert.equal(invited.memberInvites.length, 1);
  assert.equal(invited.memberInvites[0].status, "pending");

  const accepted = await world.projects.acceptInvite({
    projectId: project.projectId,
    ownerHumanId: "human.owner",
    inviteId: invited.memberInvites[0].inviteId
  });
  assert.ok(accepted.memberAgentIds.includes("agent.owner.worker"));
  assert.equal(accepted.memberRoles["agent.owner.worker"], "operator");

  const changed = await world.projects.changeMemberRole({
    projectId: project.projectId,
    ownerHumanId: "human.owner",
    agentId: "agent.owner.worker",
    role: "maintainer"
  });
  assert.equal(changed.memberRoles["agent.owner.worker"], "maintainer");

  const removed = await world.projects.removeMember({
    projectId: project.projectId,
    ownerHumanId: "human.owner",
    agentId: "agent.owner.worker"
  });
  assert.ok(!removed.memberAgentIds.includes("agent.owner.worker"));
  assert.ok((removed.memberHistory || []).some((entry) => entry.type === "member-removed" && entry.agentId === "agent.owner.worker"));
});


test("local auth should accept email and password after registration", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-auth-"));
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects")
  }).init();

  await world.identity.registerHuman({
    humanId: "human.auth",
    email: "auth@example.com",
    password: "secret-123"
  });

  const auth = world.identity.authenticateLocal({
    humanIdOrEmail: "auth@example.com",
    password: "secret-123"
  });

  assert.equal(auth.humanId, "human.auth");
  assert.equal(auth.email, "auth@example.com");
  assert.equal(auth.passwordHash, undefined);
});

test("email verification and github link management should update human identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-identity-management-"));
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects")
  }).init();

  await world.identity.registerHuman({
    humanId: "human.manage",
    email: "manage@example.com",
    password: "secret-456"
  });

  const issued = await world.identity.issueEmailVerification({ humanId: "human.manage", ttlMs: 60_000 });
  assert.equal(issued.human.emailVerified, false);
  const verified = await world.identity.verifyEmailToken(issued.token);
  assert.equal(verified.emailVerified, true);

  const linked = await world.identity.linkGitHubHuman({
    humanId: "human.manage",
    githubLogin: "peterpan42388",
    displayName: "Manager"
  });
  assert.equal(linked.githubLogin, "peterpan42388");
  assert.ok(linked.authMethods.includes("github"));

  const unlinked = await world.identity.unlinkGitHubHuman({ humanId: "human.manage" });
  assert.equal(unlinked.githubLogin, "");
  assert.ok(!unlinked.authMethods.includes("github"));
});

test("human auth keypair should support signed agent registration", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-signed-agent-"));
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects")
  }).init();

  await world.identity.registerHuman({
    humanId: "human.signed",
    email: "signed@example.com",
    password: "secret-789"
  });

  const issued = await world.identity.issueHumanAuthKeypair({ humanId: "human.signed" });
  assert.equal(issued.algorithm, "ed25519");
  assert.match(issued.privateKeyPem, /BEGIN PRIVATE KEY/);

  const agent = {
    agentId: "agent.signed.openclaw",
    label: "Signed OpenClaw",
    runtime: "openclaw",
    endpoint: "http://127.0.0.1:3001",
    online: true,
    model: "claude-3.7-sonnet"
  };
  const payload = world.identity.agentRegistrationSigningPayload({
    humanId: "human.signed",
    ...agent
  });
  const privateKey = crypto.createPrivateKey(issued.privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(payload), privateKey).toString("base64");

  const created = await world.identity.registerAgentSigned({
    humanId: "human.signed",
    keyId: issued.keyId,
    signature,
    agent
  });

  assert.equal(created.agentId, "agent.signed.openclaw");
  assert.equal(created.humanId, "human.signed");
  assert.equal(created.authKeyId, issued.keyId);
});

test("password reset should issue a token and allow local sign-in with the new password", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-password-reset-"));
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects")
  }).init();

  await world.identity.registerHuman({
    humanId: "human.reset",
    email: "reset@example.com",
    password: "old-password-1"
  });

  const issued = await world.identity.issuePasswordReset({
    humanIdOrEmail: "human.reset"
  });

  assert.equal(issued.human.humanId, "human.reset");
  assert.ok(issued.token);

  await world.identity.resetPasswordWithToken({
    token: issued.token,
    password: "new-password-2"
  });

  const signedIn = world.identity.authenticateLocal({
    humanIdOrEmail: "human.reset",
    password: "new-password-2"
  });

  assert.equal(signedIn.humanId, "human.reset");
});

test("requirements should be creatable by humans and linked into project creation", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-requirements-"));
  const github = new FakeGitHubRepoService();
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects"),
    githubRepoService: github
  }).init();

  await world.identity.registerHuman({
    humanId: "human.req",
    email: "req@example.com",
    githubLogin: "peterpan42388",
    password: "secret-req"
  });

  const requirement = await world.requirements.create({
    title: "Create onboarding skill",
    summary: "Need a project that helps new users configure OpenClaw and join the world.",
    desiredKind: "app",
    tags: ["onboarding", "skill"],
    createdByType: "human",
    createdById: "human.req"
  });

  assert.equal(requirement.status, "drafted");

  const project = await world.projects.create({
    ownerHumanId: "human.req",
    repoName: "elo-agent-onboarder-req",
    kind: "app",
    title: "Requirement Linked Project",
    requirementId: requirement.requirementId
  });

  assert.equal(project.requirementId, requirement.requirementId);
  const linked = world.requirements.list()[0];
  assert.equal(linked.status, "implemented");
  assert.equal(linked.linkedProjectId, project.projectId);
});

test("requirements should support explicit accepted and rejected status updates", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-requirement-status-"));
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects")
  }).init();

  await world.identity.registerHuman({
    humanId: "human.reqstate",
    email: "reqstate@example.com",
    password: "secret-status"
  });

  const requirement = await world.requirements.create({
    title: "Review requirement flow",
    createdByType: "human",
    createdById: "human.reqstate"
  });

  const accepted = await world.requirements.updateStatus({
    requirementId: requirement.requirementId,
    status: "accepted",
    reviewerHumanId: "human.reqstate"
  });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.reviewerHumanId, "human.reqstate");

  const rejected = await world.requirements.updateStatus({
    requirementId: requirement.requirementId,
    status: "rejected",
    reviewerHumanId: "human.reqstate"
  });
  assert.equal(rejected.status, "rejected");
});

test("requirements should require a valid reviewer for accept or reject", async () => {
  const root = await mkdtemp(join(tmpdir(), "open-world-requirement-reviewer-"));
  const world = await new OpenWorldFramework({
    stateFile: join(root, "state.json"),
    projectsRoot: join(root, "projects")
  }).init();

  await world.identity.registerHuman({
    humanId: "human.owner",
    email: "owner@example.com",
    password: "secret-owner"
  });
  await world.identity.registerHuman({
    humanId: "human.reviewer",
    email: "reviewer@example.com",
    password: "secret-reviewer"
  });
  await world.identity.registerHuman({
    humanId: "human.other",
    email: "other@example.com",
    password: "secret-other"
  });

  const requirement = await world.requirements.create({
    title: "Need review guard",
    createdByType: "human",
    createdById: "human.owner",
    reviewerHumanId: "human.reviewer"
  });

  await assert.rejects(
    () => world.requirements.updateStatus({
      requirementId: requirement.requirementId,
      status: "accepted"
    }),
    /reviewerHumanId is required/
  );

  await assert.rejects(
    () => world.requirements.updateStatus({
      requirementId: requirement.requirementId,
      status: "accepted",
      reviewerHumanId: "human.other"
    }),
    /assigned reviewer or requirement owner/
  );

  const accepted = await world.requirements.updateStatus({
    requirementId: requirement.requirementId,
    status: "accepted",
    reviewerHumanId: "human.reviewer",
    reviewNote: "Review passed."
  });
  assert.equal(accepted.reviewerHumanId, "human.reviewer");
  assert.equal(accepted.reviewNote, "Review passed.");
  assert.equal(accepted.acceptedByHumanId, "human.reviewer");
  assert.equal(accepted.rejectedByHumanId, "");
  assert.ok(accepted.reviewedAt > 0);
  assert.equal(accepted.reviewHistory.length, 1);
  assert.equal(accepted.reviewHistory[0].status, "accepted");

  const rereview = await world.requirements.updateStatus({
    requirementId: requirement.requirementId,
    status: "drafted",
    reviewerHumanId: "human.reviewer",
    reviewNote: "Needs another pass."
  });
  assert.equal(rereview.status, "drafted");
  assert.equal(rereview.rereviewCount, 1);
  assert.equal(rereview.reviewHistory.at(-1).status, "rereview-requested");
});
