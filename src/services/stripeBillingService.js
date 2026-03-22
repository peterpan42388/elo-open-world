import { uid } from "../lib/validation.js";

function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export class StripeBillingService {
  constructor({ stripeClient = null, publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://world.metavie.co" } = {}) {
    this.publicBaseUrl = publicBaseUrl;
    this.stripePromise = stripeClient ? Promise.resolve(stripeClient) : null;
  }

  async #client() {
    if (this.stripePromise) return this.stripePromise;
    if (!stripeConfigured()) throw new Error("Stripe is not configured on this deployment.");
    this.stripePromise = import("stripe").then(({ default: Stripe }) => new Stripe(process.env.STRIPE_SECRET_KEY));
    return this.stripePromise;
  }

  priceIdForPackage(packageId) {
    const mapping = {
      "starter-openclaw": process.env.STRIPE_PRICE_STARTER_OPENCLAW || "",
      "work-openclaw": process.env.STRIPE_PRICE_WORK_OPENCLAW || "",
      "vision-openclaw": process.env.STRIPE_PRICE_VISION_OPENCLAW || "",
      "builder-openclaw": process.env.STRIPE_PRICE_BUILDER_OPENCLAW || ""
    };
    const priceId = mapping[packageId] || "";
    if (!priceId) throw new Error(`Stripe price is not configured for package ${packageId}`);
    return priceId;
  }

  async createCheckoutSession({ purchaseId, packageId, amountUsd, humanId, profile, registrationMode, workflowPreset = "" }) {
    const stripe = await this.#client();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price: this.priceIdForPackage(packageId),
        quantity: 1
      }],
      success_url: `${this.publicBaseUrl}/?onboarderCheckout=success&purchaseId=${encodeURIComponent(purchaseId)}&checkoutSessionId={CHECKOUT_SESSION_ID}#settings`,
      cancel_url: `${this.publicBaseUrl}/#settings`,
      metadata: {
        purchaseId,
        packageId,
        humanId,
        profile,
        registrationMode,
        workflowPreset: workflowPreset || ""
      }
    });
    return {
      sessionId: session.id,
      url: session.url,
      amountUsd,
      currency: session.currency || "usd"
    };
  }

  async retrieveCheckoutSession(sessionId) {
    const stripe = await this.#client();
    return stripe.checkout.sessions.retrieve(sessionId);
  }

  async verifyWebhook(rawBody, signature) {
    if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("Stripe webhook secret is not configured.");
    const stripe = await this.#client();
    return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  }
}

export class FakeBillingService {
  constructor() {
    this.sessions = new Map();
  }

  async createCheckoutSession({ purchaseId, packageId, amountUsd, humanId, profile, registrationMode, workflowPreset = "" }) {
    const sessionId = uid("cs_test");
    const url = `https://billing.example.test/checkout/${sessionId}`;
    this.sessions.set(sessionId, {
      id: sessionId,
      payment_status: "paid",
      status: "complete",
      amount_total: Math.round(Number(amountUsd || 0) * 100),
      currency: "usd",
      metadata: {
        purchaseId,
        packageId,
        humanId,
        profile,
        registrationMode,
        workflowPreset
      }
    });
    return { sessionId, url, amountUsd, currency: "usd" };
  }

  async retrieveCheckoutSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`unknown checkout session: ${sessionId}`);
    return { ...session };
  }

  async verifyWebhook(rawBody) {
    return JSON.parse(rawBody);
  }
}
