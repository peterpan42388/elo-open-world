import crypto from "node:crypto";
import { bool, email, now, round, text, token } from "../lib/validation.js";

const DEFAULT_FACTIONS = [
  { key: "civilian", weight: 0.8, initialCredits: 5000 },
  { key: "middle", weight: 0.18, initialCredits: 500000 },
  { key: "elite", weight: 0.02, initialCredits: 50000000 }
];

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const computed = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === computed.length && crypto.timingSafeEqual(computed, expected);
}

export class IdentityRegistry {
  constructor({ factions = DEFAULT_FACTIONS, humans = [], agents = [], onChange = async () => {} } = {}) {
    this.factions = factions;
    this.humans = new Map(humans.map((human) => [human.humanId, { ...human }]));
    this.agents = new Map(agents.map((agent) => [agent.agentId, { ...agent }]));
    this.worldProfiles = new Map();
    this.onChange = onChange;
  }

  async registerHuman({ humanId, email: humanEmail, displayName = "", githubLogin = "", password = "" }) {
    const safeHumanId = token("humanId", humanId);
    const safeEmail = email("email", humanEmail);
    const safeGithubLogin = githubLogin ? token("githubLogin", githubLogin) : "";
    const safePassword = text("password", password, 256);
    if (!safePassword) throw new Error("password is required for email registration");
    if (this.humans.has(safeHumanId)) throw new Error(`duplicate humanId: ${safeHumanId}`);
    for (const existing of this.humans.values()) {
      if (existing.email === safeEmail) throw new Error(`duplicate email: ${safeEmail}`);
    }

    const secret = safePassword ? hashPassword(safePassword) : { salt: "", hash: "" };
    const authMethods = [];
    if (safePassword) authMethods.push("password");
    if (safeGithubLogin) authMethods.push("github");

    const record = {
      humanId: safeHumanId,
      email: safeEmail,
      githubLogin: safeGithubLogin,
      displayName: text("displayName", displayName, 128) || safeHumanId,
      admissionMethod: "email",
      emailVerified: false,
      authMethods,
      passwordSalt: secret.salt,
      passwordHash: secret.hash,
      createdAt: now(),
      updatedAt: now()
    };
    this.humans.set(safeHumanId, record);
    await this.onChange();
    return this.#publicHuman(record);
  }

  async upsertGitHubHuman({ githubLogin, email: githubEmail = "", displayName = "" }) {
    const safeGithubLogin = token("githubLogin", githubLogin);
    const safeEmail = githubEmail ? email("email", githubEmail) : `${safeGithubLogin}@users.noreply.github.com`;
    const existing = [...this.humans.values()].find((human) => human.githubLogin === safeGithubLogin || human.email === safeEmail);
    if (existing) {
      existing.githubLogin = safeGithubLogin;
      existing.displayName = text("displayName", displayName, 128) || existing.displayName || existing.humanId;
      existing.email = safeEmail || existing.email;
      existing.emailVerified = true;
      if (!existing.authMethods.includes("github")) existing.authMethods.push("github");
      existing.updatedAt = now();
      await this.onChange();
      return this.#publicHuman(existing);
    }

    let baseHumanId = `human.github.${safeGithubLogin.toLowerCase().replace(/[^a-z0-9._-]+/g, "-")}`;
    let candidate = baseHumanId;
    let counter = 1;
    while (this.humans.has(candidate)) {
      candidate = `${baseHumanId}-${counter++}`;
    }

    const record = {
      humanId: candidate,
      email: safeEmail,
      githubLogin: safeGithubLogin,
      displayName: text("displayName", displayName, 128) || safeGithubLogin,
      admissionMethod: "github",
      emailVerified: true,
      authMethods: ["github"],
      passwordSalt: "",
      passwordHash: "",
      createdAt: now(),
      updatedAt: now()
    };
    this.humans.set(candidate, record);
    await this.onChange();
    return this.#publicHuman(record);
  }

  authenticateLocal({ humanIdOrEmail, password }) {
    const identifier = text("humanIdOrEmail", humanIdOrEmail, 320).toLowerCase();
    const safePassword = text("password", password, 256);
    if (!safePassword) throw new Error("password is required");
    const human = [...this.humans.values()].find((item) => item.humanId.toLowerCase() === identifier || item.email.toLowerCase() === identifier);
    if (!human || !human.passwordHash || !human.passwordSalt) throw new Error("invalid credentials");
    if (!verifyPassword(safePassword, human.passwordSalt, human.passwordHash)) throw new Error("invalid credentials");
    return this.#publicHuman(human);
  }

  async issueEmailVerification({ humanId, ttlMs = 1000 * 60 * 30 }) {
    const human = this.getHuman(humanId);
    const tokenValue = crypto.randomBytes(24).toString("hex");
    human.emailVerification = {
      token: tokenValue,
      expiresAt: now() + ttlMs,
      sentAt: now()
    };
    human.updatedAt = now();
    await this.onChange();
    return {
      human: this.#publicHuman(human),
      token: tokenValue,
      expiresAt: human.emailVerification.expiresAt
    };
  }

  async verifyEmailToken(tokenValue) {
    const safeToken = text("token", tokenValue, 256);
    const human = [...this.humans.values()].find((item) => item.emailVerification?.token === safeToken);
    if (!human) throw new Error("verification token is invalid");
    if (!human.emailVerification?.expiresAt || human.emailVerification.expiresAt < now()) {
      throw new Error("verification token has expired");
    }
    human.emailVerified = true;
    delete human.emailVerification;
    human.updatedAt = now();
    await this.onChange();
    return this.#publicHuman(human);
  }

  async linkGitHubHuman({ humanId, githubLogin, email: githubEmail = "", displayName = "" }) {
    const human = this.getHuman(humanId);
    const safeGithubLogin = token("githubLogin", githubLogin);
    const safeEmail = githubEmail ? email("email", githubEmail) : human.email;
    for (const existing of this.humans.values()) {
      if (existing.humanId !== human.humanId && existing.githubLogin === safeGithubLogin) {
        throw new Error(`github login already linked: ${safeGithubLogin}`);
      }
    }
    human.githubLogin = safeGithubLogin;
    human.email = safeEmail || human.email;
    human.displayName = text("displayName", displayName, 128) || human.displayName;
    if (!human.authMethods.includes("github")) human.authMethods.push("github");
    human.updatedAt = now();
    await this.onChange();
    return this.#publicHuman(human);
  }

  async unlinkGitHubHuman({ humanId }) {
    const human = this.getHuman(humanId);
    human.githubLogin = "";
    human.authMethods = (human.authMethods || []).filter((item) => item !== "github");
    human.updatedAt = now();
    await this.onChange();
    return this.#publicHuman(human);
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
      humans: [...this.humans.values()].map((human) => this.#publicHuman(human)),
      agents: [...this.agents.values()]
    };
  }

  #publicHuman(human) {
    return {
      humanId: human.humanId,
      email: human.email,
      githubLogin: human.githubLogin || "",
      displayName: human.displayName,
      admissionMethod: human.admissionMethod,
      emailVerified: Boolean(human.emailVerified),
      authMethods: [...(human.authMethods || [])],
      createdAt: human.createdAt,
      updatedAt: human.updatedAt || human.createdAt
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
