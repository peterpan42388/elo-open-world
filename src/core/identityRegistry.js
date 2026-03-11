import crypto from "node:crypto";

const DEFAULT_FACTIONS = [
  { key: "civilian", weight: 0.8, initialCredits: 5000 },
  { key: "middle", weight: 0.18, initialCredits: 500000 },
  { key: "elite", weight: 0.02, initialCredits: 50000000 }
];

function round(n) {
  return Math.round(Number(n) * 1_000_000) / 1_000_000;
}

function token(name, value, maxLen = 128) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const v = value.trim();
  if (!v) throw new Error(`${name} is required`);
  if (v.length > maxLen) throw new Error(`${name} too long`);
  if (!/^[A-Za-z0-9._:/@-]+$/.test(v)) throw new Error(`${name} contains invalid characters`);
  return v;
}

function text(name, value, maxLen = 512) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const v = value.trim();
  if (v.length > maxLen) throw new Error(`${name} too long`);
  return v;
}

export class IdentityRegistry {
  constructor(factions = DEFAULT_FACTIONS) {
    this.factions = factions;
    this.humans = new Map();
    this.agents = new Map();
    this.worldProfiles = new Map();
  }

  registerHuman({ humanId, githubLogin, displayName = "" }) {
    const safeHumanId = token("humanId", humanId);
    const safeGithubLogin = token("githubLogin", githubLogin);
    if (this.humans.has(safeHumanId)) throw new Error(`duplicate humanId: ${safeHumanId}`);
    const record = {
      humanId: safeHumanId,
      githubLogin: safeGithubLogin,
      displayName: text("displayName", displayName, 128) || safeHumanId,
      createdAt: Date.now()
    };
    this.humans.set(safeHumanId, record);
    return record;
  }

  registerAgent({ agentId, humanId, label = "", runtime = "openclaw", endpoint = "" }) {
    const safeAgentId = token("agentId", agentId);
    const safeHumanId = token("humanId", humanId);
    if (!this.humans.has(safeHumanId)) throw new Error(`unknown humanId: ${safeHumanId}`);
    if (this.agents.has(safeAgentId)) throw new Error(`duplicate agentId: ${safeAgentId}`);
    const profile = this.#createWorldProfile(safeAgentId);
    const record = {
      agentId: safeAgentId,
      humanId: safeHumanId,
      label: text("label", label, 128) || safeAgentId,
      runtime: text("runtime", runtime, 64) || "openclaw",
      endpoint: text("endpoint", endpoint, 256),
      initId: profile.initId,
      faction: profile.faction,
      initialCredits: profile.initialCredits,
      currentCredits: profile.initialCredits,
      createdAt: Date.now()
    };
    this.agents.set(safeAgentId, record);
    this.worldProfiles.set(profile.initId, { ...profile, agentId: safeAgentId, humanId: safeHumanId });
    return record;
  }

  addCredits(agentId, amount) {
    const agent = this.#getAgent(agentId);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) throw new Error("amount must be > 0");
    agent.currentCredits = round(agent.currentCredits + n);
    return { agentId: agent.agentId, currentCredits: agent.currentCredits };
  }

  summary() {
    const factions = {};
    for (const faction of this.factions) {
      factions[faction.key] = { count: 0, totalCredits: 0 };
    }
    for (const agent of this.agents.values()) {
      const bucket = factions[agent.faction] ?? { count: 0, totalCredits: 0 };
      bucket.count += 1;
      bucket.totalCredits = round(bucket.totalCredits + agent.currentCredits);
      factions[agent.faction] = bucket;
    }
    return {
      schemaVersion: "openworld.summary.v1",
      generatedAt: Date.now(),
      totals: {
        humans: this.humans.size,
        agents: this.agents.size
      },
      factions,
      humans: [...this.humans.values()],
      agents: [...this.agents.values()]
    };
  }

  #getAgent(agentId) {
    const safeAgentId = token("agentId", agentId);
    const agent = this.agents.get(safeAgentId);
    if (!agent) throw new Error(`unknown agentId: ${safeAgentId}`);
    return agent;
  }

  #createWorldProfile(agentId) {
    const seed = crypto.createHash("sha256").update(agentId).digest("hex");
    const normalized = Number.parseInt(seed.slice(0, 12), 16) / 16 ** 12;
    let cursor = 0;
    let selected = this.factions[this.factions.length - 1];
    for (const faction of this.factions) {
      cursor += faction.weight;
      if (normalized <= cursor) {
        selected = faction;
        break;
      }
    }
    return {
      initId: `init:${agentId}`,
      faction: selected.key,
      initialCredits: selected.initialCredits,
      seed
    };
  }
}
