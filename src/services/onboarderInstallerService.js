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

const INSTALLER_MODEL_CATALOG = {
  contract: "elo-agent-onboarder.model-catalog.v1",
  providers: [
    {
      providerId: "openai",
      displayName: "OpenAI",
      website: "https://platform.openai.com",
      models: [
        { modelId: "gpt-4.1", displayName: "GPT-4.1", traits: ["coding", "reasoning", "tool-use"] },
        { modelId: "gpt-4o", displayName: "GPT-4o", traits: ["multimodal", "realtime", "balanced"] },
        { modelId: "gpt-4o-mini", displayName: "GPT-4o mini", traits: ["low-cost", "fast", "general"] }
      ]
    },
    {
      providerId: "anthropic",
      displayName: "Anthropic",
      website: "https://console.anthropic.com",
      models: [
        { modelId: "claude-3-7-sonnet-latest", displayName: "Claude 3.7 Sonnet", traits: ["long-context", "analysis", "writing"] },
        { modelId: "claude-3-5-haiku-latest", displayName: "Claude 3.5 Haiku", traits: ["fast", "cost-efficient", "assistant"] }
      ]
    },
    {
      providerId: "google",
      displayName: "Google",
      website: "https://aistudio.google.com",
      models: [
        { modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", traits: ["reasoning", "multimodal", "research"] },
        { modelId: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", traits: ["speed", "low-latency", "assistant"] }
      ]
    },
    {
      providerId: "deepseek",
      displayName: "DeepSeek",
      website: "https://platform.deepseek.com",
      models: [
        { modelId: "deepseek-chat", displayName: "DeepSeek Chat", traits: ["general", "low-cost", "chat"] },
        { modelId: "deepseek-reasoner", displayName: "DeepSeek Reasoner", traits: ["reasoning", "math", "problem-solving"] }
      ]
    },
    {
      providerId: "moonshot",
      displayName: "Moonshot (Kimi)",
      website: "https://platform.moonshot.cn",
      models: [
        { modelId: "moonshot-v1-8k", displayName: "Moonshot v1 8k", traits: ["chat", "general", "cost"] },
        { modelId: "moonshot-v1-128k", displayName: "Moonshot v1 128k", traits: ["long-context", "research", "analysis"] }
      ]
    },
    {
      providerId: "qwen",
      displayName: "Qwen",
      website: "https://dashscope.aliyun.com",
      models: [
        { modelId: "qwen-plus", displayName: "Qwen Plus", traits: ["multilingual", "balanced", "assistant"] },
        { modelId: "qwen-max", displayName: "Qwen Max", traits: ["strong-reasoning", "coding", "complex"] }
      ]
    },
    {
      providerId: "meta",
      displayName: "Meta (Llama API Compatible)",
      website: "https://www.llama.com",
      models: [
        { modelId: "llama-3.3-70b-instruct", displayName: "Llama 3.3 70B Instruct", traits: ["open-weights", "coding", "assistant"] }
      ]
    },
    {
      providerId: "mistral",
      displayName: "Mistral",
      website: "https://console.mistral.ai",
      models: [
        { modelId: "mistral-large-latest", displayName: "Mistral Large", traits: ["reasoning", "enterprise", "analysis"] },
        { modelId: "mistral-small-latest", displayName: "Mistral Small", traits: ["fast", "low-cost", "chat"] }
      ]
    },
    {
      providerId: "xai",
      displayName: "xAI",
      website: "https://console.x.ai",
      models: [
        { modelId: "grok-3-mini", displayName: "Grok 3 Mini", traits: ["chat", "fast", "reasoning"] },
        { modelId: "grok-3", displayName: "Grok 3", traits: ["deep-reasoning", "knowledge", "assistant"] }
      ]
    },
    {
      providerId: "azure-openai",
      displayName: "Azure OpenAI",
      website: "https://portal.azure.com",
      models: [
        { modelId: "gpt-4.1 (deployment)", displayName: "GPT-4.1 Deployment", traits: ["enterprise", "governance", "secure"] }
      ]
    },
    {
      providerId: "openrouter",
      displayName: "OpenRouter",
      website: "https://openrouter.ai",
      models: [
        { modelId: "openrouter/auto", displayName: "OpenRouter Auto", traits: ["multi-provider", "fallback", "routing"] },
        { modelId: "anthropic/claude-3.7-sonnet", displayName: "Claude 3.7 via OpenRouter", traits: ["quality", "proxy", "flexibility"] }
      ]
    }
  ],
  recommendations: [
    {
      scene: "效率优先",
      provider: "OpenAI",
      modelId: "gpt-4o-mini",
      reason: "响应快、成本低，适合日常自动化和持续运行。"
    },
    {
      scene: "代码与工程",
      provider: "Anthropic",
      modelId: "claude-3-7-sonnet-latest",
      reason: "长上下文与工程推理能力强，适合复杂项目执行。"
    },
    {
      scene: "多模态任务",
      provider: "Google",
      modelId: "gemini-2.5-pro",
      reason: "图文视频混合任务表现均衡。"
    },
    {
      scene: "成本优先",
      provider: "DeepSeek",
      modelId: "deepseek-chat",
      reason: "成本友好，适合大规模日常调用。"
    }
  ]
};

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
  constructor({ identityRegistry, onboarderService, onboarderCommerce, onboarder = {}, publicBaseUrl = "", onChange = async () => {} } = {}) {
    this.identityRegistry = identityRegistry;
    this.onboarderService = onboarderService;
    this.onboarderCommerce = onboarderCommerce;
    this.publicBaseUrl = text("publicBaseUrl", publicBaseUrl || "https://world.metavie.co", 256);
    this.sessions = new Map((onboarder.installerSessions || []).map((session) => [session.installerSessionId, { ...session }]));
    this.authSessions = new Map((onboarder.installerAuthSessions || []).map((session) => [session.installerAuthSessionId, { ...session }]));
    this.onChange = onChange;
  }

  snapshot() {
    return {
      onboarder: {
        installerSessions: [...this.sessions.values()].map((session) => ({ ...session })),
        installerAuthSessions: [...this.authSessions.values()].map((session) => ({ ...session }))
      }
    };
  }

  modelCatalog() {
    return {
      ...INSTALLER_MODEL_CATALOG,
      generatedAt: now()
    };
  }

  startAuthSession({ installerSessionId = "" } = {}) {
    const safeInstallerSessionId = installerSessionId ? token("installerSessionId", installerSessionId, 256) : "";
    if (safeInstallerSessionId && !this.sessions.has(safeInstallerSessionId)) {
      throw new Error(`unknown installerSessionId: ${safeInstallerSessionId}`);
    }
    const expiresAt = now() + 1000 * 60 * 10;
    const installerAuthSession = {
      contract: "elo-agent-onboarder.installer-auth-session.v1",
      installerAuthSessionId: uid("iauth"),
      installerSessionId: safeInstallerSessionId || "",
      status: "pending",
      humanId: "",
      createdAt: now(),
      updatedAt: now(),
      expiresAt,
      authorizedAt: 0
    };
    this.authSessions.set(installerAuthSession.installerAuthSessionId, installerAuthSession);
    Promise.resolve(this.onChange()).catch(() => {});
    return {
      contract: "elo-agent-onboarder.installer-auth-start.v1",
      installerAuthSessionId: installerAuthSession.installerAuthSessionId,
      installerSessionId: installerAuthSession.installerSessionId || "",
      status: installerAuthSession.status,
      expiresAt,
      authUrl: `${this.publicBaseUrl}/#join?installerAuthSessionId=${encodeURIComponent(installerAuthSession.installerAuthSessionId)}`,
      registerUrl: `${this.publicBaseUrl}/#join?installerAuthSessionId=${encodeURIComponent(installerAuthSession.installerAuthSessionId)}`
    };
  }

  bindAuthSession({ humanId, installerAuthSessionId }) {
    const safeHumanId = token("humanId", humanId);
    this.identityRegistry.getHuman(safeHumanId);
    const safeAuthSessionId = token("installerAuthSessionId", installerAuthSessionId, 256);
    const authSession = this.authSessions.get(safeAuthSessionId);
    if (!authSession) throw new Error(`unknown installerAuthSessionId: ${safeAuthSessionId}`);
    if (authSession.expiresAt <= now()) {
      authSession.status = "expired";
      authSession.updatedAt = now();
      throw new Error("installer auth session expired");
    }
    if (authSession.status === "authorized") {
      if (authSession.humanId !== safeHumanId) throw new Error("installer auth session already bound to another human");
      return {
        ok: true,
        installerAuthSessionId: authSession.installerAuthSessionId,
        status: authSession.status
      };
    }
    if (authSession.status !== "pending") throw new Error("installer auth session is not bindable");
    authSession.humanId = safeHumanId;
    authSession.status = "authorized";
    authSession.authorizedAt = now();
    authSession.updatedAt = now();
    Promise.resolve(this.onChange()).catch(() => {});
    return {
      ok: true,
      installerAuthSessionId: authSession.installerAuthSessionId,
      status: authSession.status
    };
  }

  authStatus({ installerAuthSessionId }) {
    const safeAuthSessionId = token("installerAuthSessionId", installerAuthSessionId, 256);
    const authSession = this.authSessions.get(safeAuthSessionId);
    if (!authSession) throw new Error(`unknown installerAuthSessionId: ${safeAuthSessionId}`);
    if (authSession.status === "pending" && authSession.expiresAt <= now()) {
      authSession.status = "expired";
      authSession.updatedAt = now();
      Promise.resolve(this.onChange()).catch(() => {});
    }
    return {
      contract: "elo-agent-onboarder.installer-auth-status.v1",
      installerAuthSessionId: authSession.installerAuthSessionId,
      installerSessionId: authSession.installerSessionId || "",
      status: authSession.status,
      expiresAt: authSession.expiresAt,
      humanId: authSession.status === "authorized" ? authSession.humanId : ""
    };
  }

  cancelAuthSession({ installerAuthSessionId }) {
    const safeAuthSessionId = token("installerAuthSessionId", installerAuthSessionId, 256);
    const authSession = this.authSessions.get(safeAuthSessionId);
    if (!authSession) throw new Error(`unknown installerAuthSessionId: ${safeAuthSessionId}`);
    authSession.status = "cancelled";
    authSession.updatedAt = now();
    Promise.resolve(this.onChange()).catch(() => {});
    return {
      ok: true,
      installerAuthSessionId: authSession.installerAuthSessionId,
      status: authSession.status
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
        feishuWebhookUrl: text("chatBinding.feishuWebhookUrl", chatBinding.feishuWebhookUrl || "", 512),
        feishuSecretRef: maskSecret(text("chatBinding.feishuSecret", chatBinding.feishuSecret || "", 512)),
        discordWebhookUrl: text("chatBinding.discordWebhookUrl", chatBinding.discordWebhookUrl || "", 512),
        dingtalkWebhookUrl: text("chatBinding.dingtalkWebhookUrl", chatBinding.dingtalkWebhookUrl || "", 512),
        dingtalkSecretRef: maskSecret(text("chatBinding.dingtalkSecret", chatBinding.dingtalkSecret || "", 512))
      };
    }
    session.updatedAt = now();
    Promise.resolve(this.onChange()).catch(() => {});
    return { ...session };
  }

  async createCheckoutSession({ humanId, installerSessionId, successUrl = "", cancelUrl = "" }) {
    const session = this.#assertOwnedSession({ humanId, installerSessionId });
    const checkout = await this.onboarderCommerce.createCheckoutSession({
      humanId: session.humanId,
      packageId: session.packageId,
      profile: session.profile,
      registrationMode: session.registrationMode,
      workflowPreset: session.workflowPreset || "",
      successUrl,
      cancelUrl
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

  async validateChatBinding({
    humanId,
    installerSessionId = "",
    chatBinding = {},
    action = "validate",
    message = ""
  }) {
    const safeHumanId = token("humanId", humanId);
    this.identityRegistry.getHuman(safeHumanId);
    if (installerSessionId) this.#assertOwnedSession({ humanId: safeHumanId, installerSessionId });
    const safeBinding = this.#normalizeChatBinding(chatBinding);
    const platform = safeBinding.platform;
    const safeAction = text("action", action, 32).toLowerCase() || "validate";
    const safeMessage = text("message", message, 2000) || "OpenClaw 安装成功，Agent 已准备就绪。";
    if (!platform) throw new Error("chat platform is required");
    if (!["telegram", "feishu", "discord", "dingtalk"].includes(platform)) {
      throw new Error(`unsupported chat platform: ${platform}`);
    }
    if (platform === "telegram") return this.#validateTelegramBinding({ binding: safeBinding, action: safeAction, message: safeMessage });
    if (platform === "feishu") return this.#validateFeishuBinding({ binding: safeBinding, action: safeAction, message: safeMessage });
    if (platform === "discord") return this.#validateDiscordBinding({ binding: safeBinding, action: safeAction, message: safeMessage });
    return this.#validateDingTalkBinding({ binding: safeBinding, action: safeAction, message: safeMessage });
  }

  #assertOwnedSession({ humanId, installerSessionId }) {
    const safeHumanId = token("humanId", humanId);
    const safeSessionId = token("installerSessionId", installerSessionId, 256);
    const session = this.sessions.get(safeSessionId);
    if (!session) throw new Error(`unknown installerSessionId: ${safeSessionId}`);
    if (session.humanId !== safeHumanId) throw new Error("installer session does not belong to the active human");
    return session;
  }

  #normalizeChatBinding(binding = {}) {
    return {
      platform: text("chatBinding.platform", binding.platform || "", 32).toLowerCase(),
      telegramBotToken: text("chatBinding.telegramBotToken", binding.telegramBotToken || "", 512),
      telegramChatId: text("chatBinding.telegramChatId", binding.telegramChatId || "", 128),
      feishuWebhookUrl: text("chatBinding.feishuWebhookUrl", binding.feishuWebhookUrl || "", 512),
      feishuSecret: text("chatBinding.feishuSecret", binding.feishuSecret || "", 512),
      discordWebhookUrl: text("chatBinding.discordWebhookUrl", binding.discordWebhookUrl || "", 512),
      dingtalkWebhookUrl: text("chatBinding.dingtalkWebhookUrl", binding.dingtalkWebhookUrl || "", 512),
      dingtalkSecret: text("chatBinding.dingtalkSecret", binding.dingtalkSecret || "", 512)
    };
  }

  async #validateTelegramBinding({ binding, action, message }) {
    if (!binding.telegramBotToken) throw new Error("telegram bot token is required");
    const updatesUrl = `https://api.telegram.org/bot${encodeURIComponent(binding.telegramBotToken)}/getUpdates`;
    const updatesResponse = await fetch(updatesUrl);
    const updatesPayload = await updatesResponse.json().catch(() => ({}));
    if (!updatesResponse.ok || updatesPayload.ok === false) {
      throw new Error(`telegram getUpdates failed: ${updatesPayload.description || updatesResponse.status}`);
    }
    const updates = Array.isArray(updatesPayload.result) ? updatesPayload.result : [];
    const latest = updates.slice().reverse().find((item) => item?.message?.chat?.id || item?.channel_post?.chat?.id);
    const detectedChatId = String(latest?.message?.chat?.id || latest?.channel_post?.chat?.id || "");
    const chatId = binding.telegramChatId || detectedChatId;
    if (!chatId) {
      return {
        ok: false,
        platform: "telegram",
        action,
        detectedChatId: "",
        needs: ["让用户先与 Bot 发送一条消息，再点击自动检测。"],
        message: "未检测到 chat_id，请先在 Telegram 中与 Bot 对话后重试。"
      };
    }
    if (action === "notify" || action === "validate") {
      const sendResponse = await fetch(`https://api.telegram.org/bot${encodeURIComponent(binding.telegramBotToken)}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message })
      });
      const sendPayload = await sendResponse.json().catch(() => ({}));
      if (!sendResponse.ok || sendPayload.ok === false) {
        throw new Error(`telegram sendMessage failed: ${sendPayload.description || sendResponse.status}`);
      }
    }
    return {
      ok: true,
      platform: "telegram",
      action,
      detectedChatId,
      resolvedChatId: chatId,
      message: "Telegram 配置有效。"
    };
  }

  async #validateFeishuBinding({ binding, action, message }) {
    if (!binding.feishuWebhookUrl) throw new Error("feishu webhook url is required");
    const body = {
      msg_type: "text",
      content: { text: message }
    };
    if (binding.feishuSecret) {
      const timestamp = `${Math.floor(Date.now() / 1000)}`;
      const stringToSign = `${timestamp}\n${binding.feishuSecret}`;
      const sign = crypto.createHmac("sha256", binding.feishuSecret).update(stringToSign).digest("base64");
      body.timestamp = timestamp;
      body.sign = sign;
    }
    if (action === "notify" || action === "validate") {
      const response = await fetch(binding.feishuWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`feishu webhook request failed: ${response.status}`);
      if (Number(payload.code || 0) !== 0) throw new Error(`feishu webhook rejected: ${payload.msg || payload.code}`);
    }
    return {
      ok: true,
      platform: "feishu",
      action,
      message: "飞书机器人配置有效。"
    };
  }

  async #validateDiscordBinding({ binding, action, message }) {
    if (!binding.discordWebhookUrl) throw new Error("discord webhook url is required");
    if (action === "notify" || action === "validate") {
      const response = await fetch(binding.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message })
      });
      if (!response.ok) {
        const payload = await response.text().catch(() => "");
        throw new Error(`discord webhook failed: ${response.status} ${payload}`);
      }
    }
    return {
      ok: true,
      platform: "discord",
      action,
      message: "Discord Webhook 配置有效。"
    };
  }

  async #validateDingTalkBinding({ binding, action, message }) {
    if (!binding.dingtalkWebhookUrl) throw new Error("dingtalk webhook url is required");
    let webhookUrl = binding.dingtalkWebhookUrl;
    if (binding.dingtalkSecret) {
      const timestamp = `${Date.now()}`;
      const signBase = `${timestamp}\n${binding.dingtalkSecret}`;
      const sign = encodeURIComponent(crypto.createHmac("sha256", binding.dingtalkSecret).update(signBase).digest("base64"));
      const separator = webhookUrl.includes("?") ? "&" : "?";
      webhookUrl = `${webhookUrl}${separator}timestamp=${timestamp}&sign=${sign}`;
    }
    if (action === "notify" || action === "validate") {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "text",
          text: { content: message }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`dingtalk webhook failed: ${response.status}`);
      if (String(payload.errcode || "0") !== "0") {
        throw new Error(`dingtalk webhook rejected: ${payload.errmsg || payload.errcode}`);
      }
    }
    return {
      ok: true,
      platform: "dingtalk",
      action,
      message: "钉钉机器人配置有效。"
    };
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
