import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function projectReadme({ title, summary, projectId, rulesPath }) {
  return `# ${title}

## Project Rules (Must Read First)
- [Rules/Rule.md](${rulesPath}/Rule.md)
- [Rules/Spirit.md](${rulesPath}/Spirit.md)
- [Rules/Target.md](${rulesPath}/Target.md)
- [Rules/Legality.md](${rulesPath}/Legality.md)
- [Rules/Review.md](${rulesPath}/Review.md)
- [Rules/Rejection.md](${rulesPath}/Rejection.md)

## Summary
${summary || "This project is initialized from ELO Open World and follows the shared open-world project baseline."}

## Project ID
- ${projectId}
`;
}

function rulesIndex() {
  return `# Rules

All participants must read [Rule.md](./Rule.md) first.
`;
}

function ruleMd() {
  return `# Rule

All contributors, humans and agents, must follow the shared ELO Open World project baseline before proposing, implementing, reviewing, or merging changes.
`;
}

function spiritMd() {
  return `# Spirit

- Open source first
- Decentralized coordination
- Human and AI prosperity
- Protect weaker participants
- Shared standards before isolated power
`;
}

function targetMd(title) {
  return `# Target

This project exists inside ELO Open World as a shared open-world project. Its immediate target is to deliver practical public infrastructure without breaking the shared rules baseline.

## Current Focus
- Project: ${title}
- Keep the integration surface compatible with ELO Open World
- Keep work transparent and reviewable
`;
}

function legalityMd() {
  return `# Legality

This repository is initialized as an open-source project. Operators, deployers, and downstream users remain responsible for compliance, audits, and jurisdiction-specific obligations.
`;
}

function reviewMd() {
  return `# Review

Every contribution must include:
- clear change intent
- tests or validation notes
- rollback notes when relevant
- compliance with project and open-world rules
`;
}

function rejectionMd() {
  return `# Rejection

Reject changes that:
- break shared rules
- add opaque or unverifiable behavior
- skip review requirements
- create avoidable legal or security risk
`;
}

function historyReadme() {
  return `# History

This folder records project evolution, decisions, and contributor journey.
`;
}

function historyMd() {
  return `# History

## v0.1
- Repository initialized from ELO Open World project template.
`;
}

function mindJourneyMd(title) {
  return `# MindJourney

${title} was initialized from the ELO Open World framework as part of the shared open-world project system.
`;
}

function membersMd({ ownerHuman, memberAgents, memberRoles = {}, memberInvites = [], memberHistory = [] }) {
  const lines = [
    "# Members",
    "",
    "## Human Owner",
    `- HumanID: ${ownerHuman.humanId}`,
    `- Email: ${ownerHuman.email}`,
    `- GitHub: ${ownerHuman.githubLogin || "not linked"}`,
    "",
    "## Agent Members"
  ];
  if (!memberAgents.length) {
    lines.push("- No agents registered yet.");
  } else {
    for (const agent of memberAgents) {
      lines.push(`- ${agent.agentId} | role=${memberRoles[agent.agentId] || "builder"} | model=${agent.model || "unknown"} | online=${agent.online ? "yes" : "no"}`);
    }
  }
  lines.push("", "## Pending Invites");
  if (!memberInvites.length) {
    lines.push("- No pending invites.");
  } else {
    for (const invite of memberInvites) {
      lines.push(`- ${invite.agentId} | role=${invite.role} | status=${invite.status} | createdAt=${invite.createdAt}`);
    }
  }
  lines.push("", "## Membership History");
  if (!memberHistory.length) {
    lines.push("- No membership history yet.");
  } else {
    for (const entry of memberHistory) {
      lines.push(`- ${entry.type} | agent=${entry.agentId || "-"} | role=${entry.role || "-"} | actor=${entry.actorHumanId || "-"} | at=${entry.at}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function foundationRunsMd({ foundationRuns = [] }) {
  const lines = [
    "# Foundation Runs",
    "",
    "This file records foundation operator runs generated from ELO Open World.",
    "",
    "## Recent Runs"
  ];
  if (!foundationRuns.length) {
    lines.push("- No foundation runs recorded yet.");
  } else {
    for (const run of foundationRuns) {
      lines.push(
        `- ${run.generatedAt} | action=${run.action} | agent=${run.agentId} | profile=${run.profile || "-"} | contract=${run.contract || "-"} | templates=${run.templateCount || 0} | artifacts=${run.artifactFileCount || 0} | target=${run.target || "-"} | runtimeMode=${run.runtimeMode || "-"}`
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function eloInitMd({ projectId, repoName, repoFullName, pluginIds, ownerHuman, memberAgents }) {
  return `# elo-init

## Open World Integration
- projectId: ${projectId}
- repoName: ${repoName}
- repoFullName: ${repoFullName}
- ownerHumanId: ${ownerHuman.humanId}
- ownerGithubLogin: ${ownerHuman.githubLogin || ""}
- pluginIds: ${pluginIds.join(", ")}
- memberAgentIds: ${memberAgents.map((agent) => agent.agentId).join(", ")}

## Baseline
- This project was initialized by ELO Open World.
- Shared rules are editable by the project initiator after creation.
- Integration with ELO Open World requires keeping this file present and current.
`;
}

function pluginManifest({ projectId, repoName, title, summary, pluginIds }) {
  return JSON.stringify({
    schemaVersion: "elo-open-world.plugin.v1",
    projectId,
    repoName,
    title,
    summary,
    pluginIds,
    healthcheckFile: "openworld.healthcheck.json"
  }, null, 2);
}

function healthcheckManifest({ repoName }) {
  return JSON.stringify({
    schemaVersion: "elo-open-world.healthcheck.v1",
    repoName,
    checks: [
      { key: "repository", status: "required" },
      { key: "rules-baseline", status: "required" },
      { key: "history-baseline", status: "required" },
      { key: "elo-init", status: "required" }
    ]
  }, null, 2);
}

export class ProjectInitializer {
  constructor({ projectsRoot, githubRepoService }) {
    this.projectsRoot = projectsRoot;
    this.githubRepoService = githubRepoService;
  }

  async initialize({ projectId, repoName, title, summary, ownerHuman, memberAgents, memberRoles = {}, memberHistory = [], memberInvites = [], foundationRuns = [], pluginIds, visibility = "public" }) {
    const localPath = join(this.projectsRoot, repoName);
    const repoSeed = { owner: ownerHuman.githubLogin, repo: repoName, sourceDir: localPath, visibility };

    try {
      await access(localPath);
      throw new Error(`project local path already exists: ${localPath}`);
    } catch (error) {
      if (error && error.message?.startsWith("project local path already exists")) throw error;
      if (!error || error.code !== "ENOENT") throw error;
    }

    await mkdir(join(localPath, "Rules"), { recursive: true });
    await mkdir(join(localPath, "History"), { recursive: true });

    const repoFullName = `${ownerHuman.githubLogin}/${repoName}`;
    await this.#writeProjectFiles({
      localPath,
      title,
      summary,
      projectId,
      repoName,
      repoFullName,
      ownerHuman,
      memberAgents,
      memberRoles,
      memberHistory,
      memberInvites,
      foundationRuns,
      pluginIds
    });

    await this.#initGit(localPath);
    const remote = await this.githubRepoService.createInitializedRepo(repoSeed);

    await writeFile(join(localPath, "elo-init.md"), eloInitMd({ projectId, repoName, repoFullName: remote.repoFullName, pluginIds, ownerHuman, memberAgents }));
    return {
      localPath,
      repoFullName: remote.repoFullName,
      repoUrl: remote.repoUrl
    };
  }

  async #writeProjectFiles({ localPath, title, summary, projectId, repoName, repoFullName, ownerHuman, memberAgents, memberRoles, memberHistory, memberInvites, foundationRuns, pluginIds }) {
    const writes = [
      [join(localPath, "README.md"), projectReadme({ title, summary, projectId, rulesPath: "./Rules" })],
      [join(localPath, "Rules", "README.md"), rulesIndex()],
      [join(localPath, "Rules", "Rule.md"), ruleMd()],
      [join(localPath, "Rules", "Spirit.md"), spiritMd()],
      [join(localPath, "Rules", "Target.md"), targetMd(title)],
      [join(localPath, "Rules", "Legality.md"), legalityMd()],
      [join(localPath, "Rules", "Review.md"), reviewMd()],
      [join(localPath, "Rules", "Rejection.md"), rejectionMd()],
      [join(localPath, "History", "README.md"), historyReadme()],
      [join(localPath, "History", "History.md"), historyMd()],
      [join(localPath, "History", "MindJourney.md"), mindJourneyMd(title)],
      [join(localPath, "History", "Members.md"), membersMd({ ownerHuman, memberAgents, memberRoles, memberHistory, memberInvites })],
      [join(localPath, "History", "FoundationRuns.md"), foundationRunsMd({ foundationRuns })],
      [join(localPath, "openworld.plugin.json"), `${pluginManifest({ projectId, repoName, title, summary, pluginIds })}\n`],
      [join(localPath, "openworld.healthcheck.json"), `${healthcheckManifest({ repoName })}\n`],
      [join(localPath, "elo-init.md"), eloInitMd({ projectId, repoName, repoFullName, pluginIds, ownerHuman, memberAgents })]
    ];
    await Promise.all(writes.map(([file, content]) => writeFile(file, content, "utf8")));
  }

  async syncMembershipDocs({ localPath, ownerHuman, memberAgents, memberRoles = {}, memberInvites = [], memberHistory = [] }) {
    await writeFile(
      join(localPath, "History", "Members.md"),
      membersMd({ ownerHuman, memberAgents, memberRoles, memberInvites, memberHistory }),
      "utf8"
    );
  }

  async syncFoundationRunsDocs({ localPath, foundationRuns = [] }) {
    await writeFile(
      join(localPath, "History", "FoundationRuns.md"),
      foundationRunsMd({ foundationRuns }),
      "utf8"
    );
  }

  async #initGit(localPath) {
    await execFileAsync("git", ["init", "-b", "main"], { cwd: localPath });
    await execFileAsync("git", ["config", "user.name", "ELO Open World"], { cwd: localPath });
    await execFileAsync("git", ["config", "user.email", "openworld@local.invalid"], { cwd: localPath });
    await execFileAsync("git", ["add", "."], { cwd: localPath });
    await execFileAsync("git", ["commit", "-m", "chore: initialize open world project"], { cwd: localPath });
  }
}
