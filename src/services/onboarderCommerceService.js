import { now, token, uid } from "../lib/validation.js";
import { buildOnboarderCatalogContract, normalizeOnboarderPackageSelection } from "./openClawPackageCatalog.js";

export class OnboarderCommerceService {
  constructor({ identityRegistry, onboarderService, billingProvider, onboarder = {}, onChange = async () => {} } = {}) {
    this.identityRegistry = identityRegistry;
    this.onboarderService = onboarderService;
    this.billingProvider = billingProvider;
    this.catalogVersion = onboarder.catalogVersion || "v1";
    this.purchases = new Map((onboarder.purchases || []).map((purchase) => [purchase.purchaseId, { ...purchase }]));
    this.entitlements = new Map((onboarder.entitlements || []).map((entitlement) => [entitlement.entitlementId, { ...entitlement }]));
    this.onChange = onChange;
  }

  snapshot() {
    return {
      onboarder: {
        catalogVersion: this.catalogVersion,
        purchases: [...this.purchases.values()].map((purchase) => ({ ...purchase })),
        entitlements: [...this.entitlements.values()].map((entitlement) => ({ ...entitlement }))
      }
    };
  }

  catalog() {
    return buildOnboarderCatalogContract();
  }

  listPurchases({ humanId }) {
    const safeHumanId = token("humanId", humanId);
    this.identityRegistry.getHuman(safeHumanId);
    const purchases = [...this.purchases.values()].filter((purchase) => purchase.humanId === safeHumanId);
    const entitlements = [...this.entitlements.values()].filter((entitlement) => entitlement.humanId === safeHumanId);
    return {
      contract: "elo-agent-onboarder.purchase-history.v1",
      catalogVersion: this.catalogVersion,
      purchases,
      entitlements
    };
  }

  async createCheckoutSession({ humanId, packageId, profile, registrationMode = "register-to-eow", workflowPreset = "" }) {
    const safeHumanId = token("humanId", humanId);
    this.identityRegistry.getHuman(safeHumanId);
    const selection = normalizeOnboarderPackageSelection({ packageId, profile, registrationMode, workflowPreset });
    const purchase = {
      purchaseId: uid("purchase"),
      humanId: safeHumanId,
      status: "pending",
      packageId: selection.packageId,
      profile: selection.profile,
      registrationMode: selection.registrationMode,
      workflowPreset: selection.workflowPreset || null,
      stripeCheckoutSessionId: "",
      amountUsd: selection.package.displayPriceUsd,
      currency: "usd",
      createdAt: now(),
      paidAt: 0,
      checkoutUrl: ""
    };
    const session = await this.billingProvider.createCheckoutSession({
      purchaseId: purchase.purchaseId,
      packageId: purchase.packageId,
      amountUsd: purchase.amountUsd,
      humanId: purchase.humanId,
      profile: purchase.profile,
      registrationMode: purchase.registrationMode,
      workflowPreset: purchase.workflowPreset || ""
    });
    purchase.stripeCheckoutSessionId = session.sessionId;
    purchase.checkoutUrl = session.url;
    this.purchases.set(purchase.purchaseId, purchase);
    await this.onChange();
    return {
      contract: "elo-agent-onboarder.checkout-session.v1",
      purchaseId: purchase.purchaseId,
      checkoutSessionId: session.sessionId,
      checkoutUrl: session.url
    };
  }

  async confirmCheckout({ humanId, purchaseId, checkoutSessionId = "" }) {
    const purchase = this.#assertOwnedPurchase({ humanId, purchaseId });
    const sessionId = token("checkoutSessionId", checkoutSessionId || purchase.stripeCheckoutSessionId, 256);
    if (purchase.stripeCheckoutSessionId !== sessionId) {
      throw new Error("checkoutSessionId does not match the purchase record");
    }
    const session = await this.billingProvider.retrieveCheckoutSession(sessionId);
    return this.#finalizePurchaseFromSession(purchase, session);
  }

  async handleStripeEvent(event) {
    if (!event || event.type !== "checkout.session.completed") {
      return { ignored: true };
    }
    const session = event.data?.object || {};
    const purchaseId = token("purchaseId", session.metadata?.purchaseId || "", 256);
    const purchase = this.purchases.get(purchaseId);
    if (!purchase) throw new Error(`unknown purchaseId in webhook: ${purchaseId}`);
    return this.#finalizePurchaseFromSession(purchase, session);
  }

  generateDeliveryContract({ humanId, entitlementId, agentId }) {
    const entitlement = this.#assertOwnedEntitlement({ humanId, entitlementId });
    const safeAgentId = token("agentId", agentId);
    const agent = this.identityRegistry.getAgent(safeAgentId);
    if (agent.humanId !== entitlement.humanId) throw new Error("agent does not belong to the entitlement owner");
    return {
      contract: "elo-agent-onboarder.delivery-contract.v1",
      purchaseId: entitlement.purchaseId,
      entitlementId: entitlement.entitlementId,
      humanId: entitlement.humanId,
      agentId: safeAgentId,
      packageId: entitlement.packageId,
      profile: entitlement.profile,
      registrationMode: entitlement.registrationMode,
      workflowPreset: entitlement.workflowPreset || null,
      runtime: "openclaw",
      artifactBundleContract: "elo-agent-onboarder.artifact-bundle.v1",
      installPlanContract: "elo-agent-onboarder.install-plan.v1",
      setupPackContract: "elo-agent-onboarder.setup-pack.v1"
    };
  }

  generateArtifactBundle({ humanId, entitlementId, agentId, worldUrl }) {
    const entitlement = this.#assertOwnedEntitlement({ humanId, entitlementId });
    const delivery = this.generateDeliveryContract({ humanId, entitlementId, agentId });
    const plan = this.onboarderService.generateInstallPlan({
      humanId: entitlement.humanId,
      agentId,
      worldUrl,
      packageId: entitlement.packageId,
      profile: entitlement.profile,
      registrationMode: entitlement.registrationMode,
      workflowPreset: entitlement.workflowPreset || ""
    });
    const bundle = this.onboarderService.generateBundle({
      humanId: entitlement.humanId,
      agentId,
      worldUrl,
      packageId: entitlement.packageId,
      profile: entitlement.profile,
      registrationMode: entitlement.registrationMode,
      workflowPreset: entitlement.workflowPreset || ""
    });
    entitlement.downloadCount = Number(entitlement.downloadCount || 0) + 1;
    entitlement.updatedAt = now();
    Promise.resolve(this.onChange()).catch(() => {});
    const files = {
      "delivery-contract.json": `${JSON.stringify(delivery, null, 2)}\n`,
      "setup-pack.json": `${JSON.stringify(bundle.setupPack, null, 2)}\n`,
      ...plan.artifactBundle.files
    };
    return {
      contract: "elo-agent-onboarder.artifact-bundle.v1",
      generatedAt: now(),
      basename: `elo-agent-onboarder-${entitlement.packageId}-${entitlement.profile}`,
      files,
      delivery,
      installPlan: plan,
      setupPack: bundle.setupPack
    };
  }

  #assertOwnedPurchase({ humanId, purchaseId }) {
    const safeHumanId = token("humanId", humanId);
    const safePurchaseId = token("purchaseId", purchaseId, 256);
    const purchase = this.purchases.get(safePurchaseId);
    if (!purchase) throw new Error(`unknown purchaseId: ${safePurchaseId}`);
    if (purchase.humanId !== safeHumanId) throw new Error("purchase does not belong to the active human");
    return purchase;
  }

  #assertOwnedEntitlement({ humanId, entitlementId }) {
    const safeHumanId = token("humanId", humanId);
    const safeEntitlementId = token("entitlementId", entitlementId, 256);
    const entitlement = this.entitlements.get(safeEntitlementId);
    if (!entitlement) throw new Error(`unknown entitlementId: ${safeEntitlementId}`);
    if (entitlement.humanId !== safeHumanId) throw new Error("entitlement does not belong to the active human");
    return entitlement;
  }

  async #finalizePurchaseFromSession(purchase, session) {
    if ((session.payment_status || "") !== "paid" && (session.status || "") !== "complete") {
      throw new Error("checkout session is not paid yet");
    }
    purchase.status = "paid";
    purchase.currency = String(session.currency || purchase.currency || "usd").toLowerCase();
    purchase.paidAt = purchase.paidAt || now();
    purchase.amountUsd = Number.isFinite(Number(session.amount_total)) ? Math.round(Number(session.amount_total) / 100) : purchase.amountUsd;
    let entitlement = [...this.entitlements.values()].find((item) => item.purchaseId === purchase.purchaseId);
    if (!entitlement) {
      entitlement = {
        entitlementId: uid("ent"),
        purchaseId: purchase.purchaseId,
        humanId: purchase.humanId,
        packageId: purchase.packageId,
        profile: purchase.profile,
        registrationMode: purchase.registrationMode,
        workflowPreset: purchase.workflowPreset || null,
        status: "active",
        downloadCount: 0,
        createdAt: now(),
        updatedAt: now()
      };
      this.entitlements.set(entitlement.entitlementId, entitlement);
    }
    await this.onChange();
    return {
      ok: true,
      purchaseId: purchase.purchaseId,
      entitlementId: entitlement.entitlementId
    };
  }
}
