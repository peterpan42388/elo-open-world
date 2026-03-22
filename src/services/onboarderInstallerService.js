import crypto from "node:crypto";
import { now, text, token, uid } from "../lib/validation.js";
import { normalizeOnboarderPackageSelection } from "./openClawPackageCatalog.js";

function safeSlug(value, fallback = "agent") {
  const raw = String(value || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return raw || fallback;
}

function maskSecret(secret) {
  const safe = String(secret || "");
  if (!safe) return "";
  const tail = safe.slice(-4);
  const digest = crypto.createHash("sha256").update(safe).digest("hex");
  return `ref:${tail}:${digest.slice(0, 12)}`;
}

function toScriptContent({ session, worldUrl, plan }) {
  const personality = (session.agentPersonality || "Curious, helpful, and reliable.").replace(/\r\n/g, "\n");
  const openclawConfig = {
    contract: "openclaw.runtime.config.v1",
    packageId: session.packageId,
    profile: session.profile,
    registrationMode: session.registrationMode,
    model: {
      provider: session.modelProvider || "",
      name: session.modelName || "",
      apiKeyRef: session.modelApiKeyRef || ""
    },
    chatBinding: session.chatBinding || {},
    world: {
      publicBaseUrl: worldUrl,
      registrationPath: "/api/agents/status"
    },
    installPlanContract: plan.contract
  };
  return `#!/usr/bin/env sh
set -eu

INSTALL_ROOT="\${1:-$HOME/elo-open-world}"
mkdir -p "$INSTALL_ROOT"/{config,logs,data,bin,skills,workflows}

cat > "$INSTALL_ROOT/SOUL.md" <<'SOUL'
# Agent Soul

${personality}
SOUL

cat > "$INSTALL_ROOT/config/openclaw.json" <<'JSON'
${JSON.stringify(openclawConfig, null, 2)}
JSON

echo "OpenClaw onboarding scaffold prepared at: $INSTALL_ROOT"
echo "SOUL.md and config/openclaw.json are ready."
echo "Run profile-specific runtime bootstrap next."
`;
}

export class OnboarderInstallerService {
  constructor({ identityRegistry, onboarderService, onboarderCommerce, onboarder = {}, onChange = async () => {} } = {}) {
    this.identityRegistry = identityRegistry;
    this.onboarderService = onboarderService;
    this.onboarderCommerce = onboarderCommerce;
    this.sessions = new Map((onboarder.installerSessions || []).map((session) => [session.installerSessionId, { ...session }]));
    this.onChange = onChange;
  }

  snapshot() {
    return {
      onboarder: {
        installerSessions: [...this.sessions.values()].map((session) => ({ ...session }))
      }
    };
  }

  startSession({ humanId, packageId, profile, registrationMode = "register-to-eow", workflowPreset = "" }) {
    const safeHumanId = token("humanId", humanId);
    this.identityRegistry.getHuman(safeHumanId);
    const selection = normalizeOnboarderPackageSelection({ packageId, profile, registrationMode, workflowPreset });
    const session = {
      contract: "elo-agent-onboarder.installer-session.v1",
      installerSessionId: uid("installer"),
      humanId: safeHumanId,
      packageId: selection.packageId,
      profile: selection.profile,
      registrationMode: selection.registrationMode,
      workflowPreset: selection.workflowPreset || null,
      status: "collecting",
      paymentStatus: "pending",
      purchaseId: "",
      checkoutSessionId: "",
      entitlementId: "",
      agentName: "",
      agentPersonality: "",
      modelProvider: "",
      modelName: "",
      modelApiKeyRef: "",
      chatBinding: {},
      installReport: null,
      agentId: "",
      createdAt: now(),
      updatedAt: now()
    };
    this.sessions.set(session.installerSessionId, session);
    Promise.resolve(this.onChange()).catch(() => {});
    return { ...session };
  }

  updateSession({
    humanId,
    installerSessionId,
    agentName = "",
    agentPersonality = "",
    modelProvider = "",
    modelName = "",
    modelApiKey = "",
    chatBinding = {},
    workflowPreset = ""
  }) {
    const session = this.#assertOwnedSession({ humanId, installerSessionId });
    if (agentName) session.agentName = text("agentName", agentName, 128);
    if (agentPersonality) session.agentPersonality = text("agentPersonality", agentPersonality, 4000);
    if (modelProvider) session.modelProvider = text("modelProvider", modelProvider, 64);
    if (modelName) session.modelName = text("modelName", modelName, 128);
    if (workflowPreset) session.workflowPreset = text("workflowPreset", workflowPreset, 64);
    if (modelApiKey) session.modelApiKeyRef = maskSecret(text("modelApiKey", modelApiKey, 512));
    if (chatBinding && typeof chatBinding === "object") {
      session.chatBinding = {
        platform: text("chatBinding.platform", chatBinding.platform || "", 32),
        telegramBotTokenRef: maskSecret(text("chatBinding.telegramBotToken", chatBinding.telegramBotToken || "", 512)),
        telegramChatId: text("chatBinding.telegramChatId", chatBinding.telegramChatId || "", 128),
        larkAppId: text("chatBinding.larkAppId", chatBinding.larkAppId || "", 128),
        larkAppSecretRef: maskSecret(text("chatBinding.larkAppSecret", chatBinding.larkAppSecret || "", 512)),
        larkTenantKey: text("chatBinding.larkTenantKey", chatBinding.larkTenantKey || "", 128)
      };
    }
    session.updatedAt = now();
    Promise.resolve(this.onChange()).catch(() => {});
    return { ...session };
  }

  async createCheckoutSession({ humanId, installerSessionId }) {
    const session = this.#assertOwnedSession({ humanId, installerSessionId });
    const checkout = await this.onboarderCommerce.createCheckoutSession({
      humanId: session.humanId,
      packageId: session.packageId,
      profile: session.profile,
      registrationMode: session.registrationMode,
      workflowPreset: session.workflowPreset || ""
    });
    session.purchaseId = checkout.purchaseId;
    session.checkoutSessionId = checkout.checkoutSessionId;
    session.paymentStatus = "pending";
    session.status = "payment-pending";
    session.updatedAt = now();
    await this.onChange();
    return {
      contract: "elo-agent-onboarder.installer-checkout.v1",
      installerSessionId: session.installerSessionId,
      ...checkout
    };
  }

  async confirmPayment({ humanId, installerSessionId, checkoutSessionId = "" }) {
    const session = this.#assertOwnedSession({ humanId, installerSessionId });
    if (!session.purchaseId) throw new Error("installer session has no checkout purchase");
    const result = await this.onboarderCommerce.confirmCheckout({
      humanId: session.humanId,
      purchaseId: session.purchaseId,
      checkoutSessionId: checkoutSessionId || session.checkoutSessionId
    });
    session.paymentStatus = "paid";
    session.entitlementId = result.entitlementId;
    session.status = "paid";
    session.updatedAt = now();
    await this.onChange();
    return {
      contract: "elo-agent-onboarder.installer-payment.v1",
      installerSessionId: session.installerSessionId,
      paymentStatus: session.paymentStatus,
      purchaseId: session.purchaseId,
      entitlementId: session.entitlementId
    };
  }

  paymentStatus({ humanId, installerSessionId }) {
    const session = this.#assertOwnedSession({ humanId, installerSessionId });
    if (session.purchaseId) {
      const history = this.onboarderCommerce.listPurchases({ humanId: session.humanId });
      const purchase = history.purchases.find((item) => item.purchaseId === session.purchaseId);
      if (purchase?.status === "paid") {
        const entitlement = history.entitlements.find((item) => item.purchaseId === session.purchaseId);
        session.paymentStatus = "paid";
        session.entitlementId = entitlement?.entitlementId || session.entitlementId;
        session.status = "paid";
      }
    }
    return {
      contract: "elo-agent-onboarder.installer-payment-status.v1",
      installerSessionId: session.installerSessionId,
      paymentStatus: session.paymentStatus,
      purchaseId: session.purchaseId,
      checkoutSessionId: session.checkoutSessionId,
      entitlementId: session.entitlementId || ""
    };
  }

  async plan({ humanId, installerSessionId, worldUrl }) {
    const session = this.#assertOwnedSession({ humanId, installerSessionId });
    if (session.paymentStatus !== "paid") throw new Error("payment is required before generating an install plan");
    const agentId = await this.#ensureSessionAgent(session);
    const plan = this.onboarderService.generateInstallPlan({
      humanId: session.humanId,
      agentId,
      worldUrl,
      packageId: session.packageId,
      profile: session.profile,
      registrationMode: session.registrationMode,
      workflowPreset: session.workflowPreset || ""
    });
    session.status = "plan-ready";
    session.updatedAt = now();
    Promise.resolve(this.onChange()).catch(() => {});
    return {
      contract: "elo-agent-onboarder.install-execution-plan.v1",
      installerSessionId: session.installerSessionId,
      paymentStatus: session.paymentStatus,
      agentId,
      plan
    };
  }

  async script({ humanId, installerSessionId, worldUrl }) {
    const session = this.#assertOwnedSession({ humanId, installerSessionId });
    if (session.paymentStatus !== "paid") throw new Error("payment is required before requesting install script");
    const agentId = await this.#ensureSessionAgent(session);
    const plan = this.onboarderService.generateInstallPlan({
      humanId: session.humanId,
      agentId,
      worldUrl,
      packageId: session.packageId,
      profile: session.profile,
      registrationMode: session.registrationMode,
      workflowPreset: session.workflowPreset || ""
    });
    const scriptToken = uid("script");
    const script = toScriptContent({ session, worldUrl, plan });
    session.lastScriptTicket = {
      token: scriptToken,
      issuedAt: now(),
      expiresAt: now() + 1000 * 60 * 10
    };
    session.status = "script-issued";
    session.updatedAt = now();
    Promise.resolve(this.onChange()).catch(() => {});
    return {
      contract: "elo-agent-onboarder.install-script-ticket.v1",
      installerSessionId: session.installerSessionId,
      scriptToken,
      scriptType: "shell",
      expiresAt: session.lastScriptTicket.expiresAt,
      script
    };
  }

  complete({ humanId, installerSessionId, installReport = {} }) {
    const session = this.#assertOwnedSession({ humanId, installerSessionId });
    session.installReport = installReport;
    session.status = "installed";
    session.updatedAt = now();
    Promise.resolve(this.onChange()).catch(() => {});
    return {
      contract: "elo-agent-onboarder.install-complete-report.v1",
      installerSessionId: session.installerSessionId,
      status: session.status,
      agentId: session.agentId || ""
    };
  }

  async registerToWorld({ humanId, installerSessionId }) {
    const session = this.#assertOwnedSession({ humanId, installerSessionId });
    const agentId = await this.#ensureSessionAgent(session);
    await this.identityRegistry.updateAgentStatus({
      agentId,
      online: true,
      model: session.modelName || "",
      runtime: "openclaw"
    });
    session.status = "registered";
    session.updatedAt = now();
    await this.onChange();
    return {
      ok: true,
      installerSessionId: session.installerSessionId,
      status: session.status,
      agentId
    };
  }

  #assertOwnedSession({ humanId, installerSessionId }) {
    const safeHumanId = token("humanId", humanId);
    const safeSessionId = token("installerSessionId", installerSessionId, 256);
    const session = this.sessions.get(safeSessionId);
    if (!session) throw new Error(`unknown installerSessionId: ${safeSessionId}`);
    if (session.humanId !== safeHumanId) throw new Error("installer session does not belong to the active human");
    return session;
  }

  async #ensureSessionAgent(session) {
    if (session.agentId) return session.agentId;
    const humanSuffix = safeSlug(session.humanId.split(".").pop(), "user");
    const labelSlug = safeSlug(session.agentName || "openclaw");
    let candidate = `agent.${humanSuffix}.${labelSlug}`;
    let counter = 1;
    while (true) {
      try {
        this.identityRegistry.getAgent(candidate);
        candidate = `agent.${humanSuffix}.${labelSlug}-${counter++}`;
      } catch {
        break;
      }
    }
    await this.identityRegistry.registerAgent({
      agentId: candidate,
      humanId: session.humanId,
      label: session.agentName || "OpenClaw Agent",
      runtime: "openclaw",
      model: session.modelName || "",
      online: false
    });
    session.agentId = candidate;
    session.updatedAt = now();
    return candidate;
  }
}
