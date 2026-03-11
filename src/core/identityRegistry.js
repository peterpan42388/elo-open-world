import crypto from "node:crypto";
import { bool, email, now, round, text, token } from "../lib/validation.js";

const DEFAULT_FACTIONS = [
  { key: "civilian", weight: 0.8, initialCredits: 5000 },
  { key: "middle", weight: 0.18, initialCredits: 500000 },
  { key: "elite", weight: 0.02, initialCredits: 50000000 }
];

export class IdentityRegistry {
  constructor({ factions = DEFAULT_FACTIONS, humans = [], agents = [], onChange = async () => {} } = {}) {
    this.factions = factions;
    this.humans = new Map(humans.map((human) => [human.humanId, { ...human }]));
    this.agents = new Map(agents.map((agent) => [agent.agentId, { ...agent }]));
    this.worldProfiles = new Map();
    this.onChange = onChange;
  }

  async registerHuman({ humanId, email: humanEmail, displayName = "", githubLogin = "" }) {
    const safeHumanId = token("humanId", humanId);
    const safeEmail = email("email", humanEmail);
    const safeGithubLogin = githubLogin ? token("githubLogin", githubLogin) : "";
    if (this.humans.has(safeHumanId)) throw new Error(`duplicate humanId: ${safeHumanId}`);
    for (const existing of this.humans.values()) {
      if (existing.email === safeEmail) throw new Error(`duplicate email: ${safeEmail}`);
    }
    const record = {
      humanId: safeHumanId,
      email: safeEmail,
      githubLogin: safeGithubLogin,
      displayName: text("displayName", displayName, 128) || safeHumanId,
      admissionMethod: "email",
      emailVerified: false,
      createdAt: now()
    };
    this.humans.set(safeHumanId, record);
    await this.onChange();
    return record;
  }

  async registerAgent({
    agentId,
    humanId,
    label = "",
    runtime = "openclaw",
    endpoint = "",
    online = false,
    model = ""
  }) {
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
      online: bool(online, false),
      model: text("model", model, 128),
      lastSeenAt: now(),
      initId: profile.initId,
      faction: profile.faction,
      initialCredits: profile.initialCredits,
      currentCredits: profile.initialCredits,
      createdAt: now()
    };
    this.agents.set(safeAgentId, record);
    this.worldProfiles.set(profile.initId, { ...profile, agentId: safeAgentId, humanId: safeHumanId });
    await this.onChange();
    return record;
  }

  async updateAgentStatus({ agentId, online, model = "", runtime = undefined, endpoint = undefined }) {
    const agent = this.#getAgent(agentId);
    agent.online = bool(online, agent.online);
    agent.model = text("model", model, 128) || agent.model;
    if (runtime !== undefined) agent.runtime = text("runtime", runtime, 64) || agent.runtime;
    if (endpoint !== undefined) agent.endpoint = text("endpoint", endpoint, 256);
    agent.lastSeenAt = now();
    await this.onChange();
    return { ...agent };
  }

  addCredits(agentId, amount) {
    const agent = this.#getAgent(agentId);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) throw new Error("amount must be > 0");
    agent.currentCredits = round(agent.currentCredits + n);
    return { agentId: agent.agentId, currentCredits: agent.currentCredits };
  }

  getHuman(humanId) {
    const safeHumanId = token("humanId", humanId);
    const human = this.humans.get(safeHumanId);
    if (!human) throw new Error(`unknown humanId: ${safeHumanId}`);
    return human;
  }

  getAgent(agentId) {
    return { ...this.#getAgent(agentId) };
  }

  snapshot() {
    return {
      humans: [...this.humans.values()],
      agents: [...this.agents.values()]
    };
  }

  summary() {
    const factions = {};
    for (const faction of this.factions) {
      factions[faction.key] = { count: 0, totalCredits: 0 };
    }
    let onlineAgents = 0;
    const models = {};
    for (const agent of this.agents.values()) {
      const bucket = factions[agent.faction] ?? { count: 0, totalCredits: 0 };
      bucket.count += 1;
      bucket.totalCredits = round(bucket.totalCredits + agent.currentCredits);
      factions[agent.faction] = bucket;
      if (agent.online) onlineAgents += 1;
      if (agent.model) models[agent.model] = (models[agent.model] || 0) + 1;
    }
    return {
      schemaVersion: "openworld.summary.v2",
      generatedAt: now(),
      totals: {
        humans: this.humans.size,
        agents: this.agents.size,
        onlineAgents
      },
      factions,
      models,
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
