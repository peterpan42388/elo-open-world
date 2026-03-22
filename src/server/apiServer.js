import crypto from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenWorldFramework } from "../core/openWorld.js";
import { EmailService } from "../services/emailService.js";
import { buildArtifactZip } from "../services/artifactZipService.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = join(__dirname, "../../web");
const githubAuthStates = new Map();
const emailService = new EmailService();

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

function html(res, status, content) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(content);
}

function binary(res, status, data, contentType, filename) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename=\"${filename}\"`,
    "Cache-Control": "no-store",
    "Content-Length": data.length
  });
  res.end(data);
}

function oauthConfig() {
  return {
    githubEnabled: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET),
    githubClientId: process.env.GITHUB_OAUTH_CLIENT_ID || "",
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "https://world.metavie.co",
    emailEnabled: emailService.enabled,
    emailMode: emailService.mode
  };
}

function onboarderPublicServiceEnabled() {
  return String(process.env.ONBOARDER_PUBLIC_SERVICE_ENABLED || "").toLowerCase() === "true";
}

function renderAuthResultPage({ ok, message, humanId = "" }) {
  const safeMessage = String(message || "Authentication failed.").replace(/</g, "&lt;");
  const safeHumanId = String(humanId || "").replace(/'/g, "\\'");
  if (ok) {
    return `<!doctype html><html><body><script>
      localStorage.setItem('elo-open-world.session', '${safeHumanId}');
      window.location.replace('/?sessionHumanId=${encodeURIComponent(humanId || "")}#settings');
    </script><p>${safeMessage}</p></body></html>`;
  }
  return `<!doctype html><html><body><script>
    window.location.replace('/#join');
  </script><p>${safeMessage}</p></body></html>`;
}

function renderEmailVerifyResultPage({ ok, message }) {
  const safeMessage = String(message || "Email verification failed.").replace(/</g, "&lt;");
  const route = ok ? "/#settings" : "/#join";
  return `<!doctype html><html><body><script>
    window.location.replace('${route}');
  </script><p>${safeMessage}</p></body></html>`;
}

function renderPasswordResetPage({ token = "", message = "", ok = false }) {
  const safeToken = String(token || "").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const safeMessage = String(message || "").replace(/</g, "&lt;");
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Reset Password</title>
      <link rel="stylesheet" href="/app.css" />
    </head>
    <body>
      <div class="page">
        <header class="topbar">
          <a class="brand" href="/#home">ELO Open World</a>
          <div class="topbar-actions"><a class="topbar-button secondary" href="/#join">Back To Join</a></div>
        </header>
        <main>
          <section class="panel guide-page">
            <div class="panel-header">
              <h2>Reset Password</h2>
              <p>Set a new local password for your ELO Open World account.</p>
            </div>
            ${safeMessage ? `<p class="note">${safeMessage}</p>` : ""}
            ${ok ? `<p class="note">Password reset completed. You can now return to Join and sign in.</p>` : `
            <form id="password-reset-form">
              <input type="hidden" name="token" value="${safeToken}" />
              <input name="password" type="password" placeholder="new password" required />
              <input name="passwordConfirm" type="password" placeholder="confirm new password" required />
              <button type="submit">Set New Password</button>
            </form>
            <p class="note" id="password-reset-status"></p>`}
          </section>
        </main>
      </div>
      ${ok ? "" : `<script>
        document.getElementById('password-reset-form')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const password = form.password.value;
          const passwordConfirm = form.passwordConfirm.value;
          const status = document.getElementById('password-reset-status');
          if (password !== passwordConfirm) {
            status.textContent = 'Passwords do not match.';
            return;
          }
          const res = await fetch('/api/auth/password/reset/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: form.token.value, password })
          });
          const payload = await res.json();
          if (!res.ok || payload.error) {
            status.textContent = payload.error || 'Password reset failed.';
            return;
          }
          status.textContent = 'Password reset complete. Redirecting to Join...';
          setTimeout(() => window.location.replace('/#join'), 1200);
        });
      </script>`}
    </body>
  </html>`;
}

function renderOnboarderServicePage() {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>ELO Agent Onboarder</title>
      <link rel="stylesheet" href="/app.css" />
    </head>
    <body>
      <div class="page">
        <header class="topbar">
          <a class="brand" href="/#home">ELO Open World</a>
          <div class="topbar-actions"><a class="topbar-button secondary" href="/#market">Back To Market</a></div>
        </header>
        <main>
          <section class="panel guide-page">
            <div class="panel-header">
              <h2>ELO OpenClaw Onboarding Assistant</h2>
              <p>Public operating service for generating agent onboarding bundles inside ELO Open World.</p>
            </div>
            <div class="guide-markdown">
              <p>This service generates a minimal onboarding bundle for an already registered human and agent pair.</p>
              <p>Available endpoints:</p>
              <ul class="content-list">
                <li><code>/services/elo-agent-onboarder</code> — service landing page</li>
                <li><code>/services/elo-agent-onboarder/health</code> — health probe</li>
                <li><code>/services/elo-agent-onboarder/manifest</code> — service descriptor</li>
                <li><code>/services/elo-agent-onboarder/setup-pack</code> — setup pack API</li>
                <li><code>/services/elo-agent-onboarder/install-plan</code> — install plan API</li>
                <li><code>/services/elo-agent-onboarder/bootstrap</code> — bootstrap report API</li>
                <li><code>/services/elo-agent-onboarder/artifact-zip</code> — zip export API</li>
                <li><code>/services/elo-agent-onboarder/bundle</code> — legacy compatibility alias</li>
              </ul>
            </div>
            <form id="onboarder-service-form">
              <input name="humanId" placeholder="human.leo" required />
              <input name="agentId" placeholder="agent.leo.openclaw" required />
              <input name="worldUrl" placeholder="https://world.metavie.co" />
              <input name="machineLabel" placeholder="leo-macbook" />
              <textarea name="notes" placeholder="optional notes"></textarea>
              <button type="submit">Generate Bundle</button>
            </form>
            <pre id="onboarder-service-output" class="code-block">Submit a registered human and agent to receive a bundle.</pre>
          </section>
        </main>
      </div>
      <script>
        document.getElementById('onboarder-service-form')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const body = Object.fromEntries(new FormData(form).entries());
          const response = await fetch('/services/elo-agent-onboarder/setup-pack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const payload = await response.json();
          document.getElementById('onboarder-service-output').textContent = JSON.stringify(payload, null, 2);
        });
      </script>
    </body>
  </html>`;
}

function renderWebPluginServicePage() {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>ELO Agent Web Plugin</title>
      <link rel="stylesheet" href="/app.css" />
    </head>
    <body>
      <div class="page">
        <header class="topbar">
          <a class="brand" href="/#home">ELO Open World</a>
          <div class="topbar-actions"><a class="topbar-button secondary" href="/#settings">Back To Settings</a></div>
        </header>
        <main>
          <section class="panel guide-page">
            <div class="panel-header">
              <h2>ELO Agent Web Plugin</h2>
              <p>Browser bridge service for connecting user-owned agents to ELO Open World starter and workspace flows.</p>
            </div>
            <ul class="content-list">
              <li><code>/services/elo-agent-web-plugin</code> — service landing page</li>
              <li><code>/services/elo-agent-web-plugin/health</code> — health probe</li>
              <li><code>/services/elo-agent-web-plugin/manifest</code> — service descriptor</li>
              <li><code>/services/elo-agent-web-plugin/bridge-pack</code> — browser bridge pack API</li>
              <li><code>/services/elo-agent-web-plugin/artifact-zip</code> — zip export API</li>
            </ul>
          </section>
        </main>
      </div>
    </body>
  </html>`;
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readRaw(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

function sessionHumanId(req) {
  const value = req.headers["x-elo-session-human-id"];
  return typeof value === "string" ? value.trim() : "";
}

function requireSessionHumanId(req) {
  const humanId = sessionHumanId(req);
  if (!humanId) throw new Error("Sign in to ELO Open World first.");
  return humanId;
}

async function serveStatic(pathname, res) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const safe = normalize(target).replace(/^\.\.(\/|\\|$)/, "");
  const fullPath = join(WEB_ROOT, safe);
  const data = await readFile(fullPath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8"
  };
  res.writeHead(200, {
    "Content-Type": types[extname(fullPath)] || "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(data);
}

async function exchangeGitHubCode(code) {
  const cfg = oauthConfig();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "elo-open-world"
    },
    body: new URLSearchParams({
      client_id: cfg.githubClientId,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code
    })
  });
  const data = await response.json();
  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || "github token exchange failed");
  }
  return data.access_token;
}

async function fetchGitHubProfile(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "elo-open-world"
  };
  const userRes = await fetch("https://api.github.com/user", { headers });
  const user = await userRes.json();
  if (!userRes.ok || !user.login) throw new Error(user.message || "failed to fetch github user");

  const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
  let email = user.email || "";
  if (emailsRes.ok) {
    const emails = await emailsRes.json();
    const primary = Array.isArray(emails) ? emails.find((item) => item.primary) || emails.find((item) => item.verified) || emails[0] : null;
    email = primary?.email || email;
  }
  return {
    githubLogin: user.login,
    email,
    displayName: user.name || user.login
  };
}

const framework = await new OpenWorldFramework().init();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname;

    if ((req.method === "GET" || req.method === "HEAD") && (
      path === "/" ||
      path === "/index.html" ||
      path === "/app.css" ||
      path === "/app.js" ||
      path.startsWith("/guides/") ||
      path.startsWith("/lib/")
    )) {
      return await serveStatic(path, res);
    }

    if (req.method === "GET" && path === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && path === "/api/world/summary") {
      return json(res, 200, framework.summary());
    }

    if (req.method === "GET" && path === "/api/universe/manifest") {
      return json(res, 200, framework.manifest());
    }

    if (req.method === "GET" && path === "/api/auth/config") {
      return json(res, 200, oauthConfig());
    }

    if (req.method === "POST" && path === "/api/billing/stripe/webhook") {
      const raw = await readRaw(req);
      const signature = req.headers["stripe-signature"];
      const event = await framework.onboarderCommerce.billingProvider.verifyWebhook(raw, signature);
      return json(res, 200, await framework.onboarderCommerce.handleStripeEvent(event));
    }

    if (req.method === "POST" && path === "/api/auth/login") {
      const body = await readJson(req);
      return json(res, 200, framework.identity.authenticateLocal(body));
    }

    if (req.method === "GET" && path === "/auth/github/start") {
      const cfg = oauthConfig();
      if (!cfg.githubEnabled) {
        return html(res, 503, renderAuthResultPage({ ok: false, message: "GitHub OAuth is not configured on this deployment." }));
      }
      const mode = (url.searchParams.get("mode") || "signin").trim().toLowerCase();
      const humanId = (url.searchParams.get("humanId") || "").trim();
      const state = crypto.randomUUID();
      githubAuthStates.set(state, { createdAt: Date.now(), mode, humanId });
      const redirectUri = `${cfg.publicBaseUrl}/auth/github/callback`;
      const authUrl = new URL("https://github.com/login/oauth/authorize");
      authUrl.searchParams.set("client_id", cfg.githubClientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", "read:user user:email");
      authUrl.searchParams.set("state", state);
      return redirect(res, authUrl.toString());
    }

    if (req.method === "GET" && path === "/auth/github/callback") {
      const cfg = oauthConfig();
      if (!cfg.githubEnabled) {
        return html(res, 503, renderAuthResultPage({ ok: false, message: "GitHub OAuth is not configured on this deployment." }));
      }
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || "";
      const authState = githubAuthStates.get(state);
      if (!authState) {
        return html(res, 400, renderAuthResultPage({ ok: false, message: "GitHub auth state is invalid or expired." }));
      }
      githubAuthStates.delete(state);
      const accessToken = await exchangeGitHubCode(code);
      const profile = await fetchGitHubProfile(accessToken);
      const human = authState.mode === "link" && authState.humanId
        ? await framework.identity.linkGitHubHuman({ humanId: authState.humanId, ...profile })
        : await framework.identity.upsertGitHubHuman(profile);
      return html(res, 200, renderAuthResultPage({ ok: true, humanId: human.humanId, message: `Signed in as ${human.humanId}` }));
    }

    if (req.method === "GET" && path === "/auth/verify-email") {
      const token = url.searchParams.get("token") || "";
      const human = await framework.identity.verifyEmailToken(token);
      return html(res, 200, renderEmailVerifyResultPage({ ok: true, message: `Email verified for ${human.humanId}` }));
    }

    if (req.method === "GET" && path === "/auth/reset-password") {
      const token = url.searchParams.get("token") || "";
      return html(res, 200, renderPasswordResetPage({ token }));
    }

    if (req.method === "GET" && path === "/services/elo-agent-onboarder") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      return html(res, 200, renderOnboarderServicePage());
    }

    if (req.method === "GET" && path === "/services/elo-agent-onboarder/health") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      return json(res, 200, {
        ok: true,
        service: "elo-agent-onboarder",
        version: "v1",
        generatedAt: Date.now()
      });
    }

    if (req.method === "GET" && path === "/services/elo-agent-onboarder/manifest") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      return json(res, 200, {
        serviceId: "service.elo-agent-onboarder",
        project: "elo-agent-onboarder",
        title: "ELO OpenClaw Onboarding Assistant",
        kind: "app",
        contract: "elo-agent-onboarder.setup-pack.v1",
        endpoints: {
          landing: "/services/elo-agent-onboarder",
          health: "/services/elo-agent-onboarder/health",
          manifest: "/services/elo-agent-onboarder/manifest",
          setupPack: "/services/elo-agent-onboarder/setup-pack",
          installPlan: "/services/elo-agent-onboarder/install-plan",
          bootstrap: "/services/elo-agent-onboarder/bootstrap",
          artifactZip: "/services/elo-agent-onboarder/artifact-zip",
          bundle: "/services/elo-agent-onboarder/bundle"
        },
        outputs: {
          readme: "markdown",
          registerScript: "shell",
          agentConfig: "json",
          installPlan: "json",
          bootstrapReport: "json",
          templates: "text",
          artifactZip: "zip"
        },
        profiles: [
          "macos-homebrew",
          "linux-systemd",
          "server-docker-compose"
        ],
        profileDescriptions: {
          "macos-homebrew": "Local macOS install using Homebrew-managed dependencies.",
          "linux-systemd": "Local Linux install with a systemd user service.",
          "server-docker-compose": "Server install using Docker Compose."
        }
      });
    }

    if (req.method === "POST" && path === "/services/elo-agent-onboarder/setup-pack") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      const body = await readJson(req);
      return json(res, 200, framework.onboarder.generateBundle(body));
    }

    if (req.method === "POST" && path === "/services/elo-agent-onboarder/install-plan") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      const body = await readJson(req);
      return json(res, 200, framework.onboarder.generateInstallPlan(body));
    }

    if (req.method === "POST" && path === "/services/elo-agent-onboarder/bootstrap") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      const body = await readJson(req);
      return json(res, 200, framework.onboarder.generateBootstrapReport(body));
    }

    if (req.method === "POST" && path === "/services/elo-agent-onboarder/artifact-zip") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      const body = await readJson(req);
      const action = String(body.action || "artifact").trim().toLowerCase();
      const basename = `elo-agent-onboarder-${action}`;
      const result = await buildArtifactZip({
        bundle: body.artifactBundle,
        basename
      });
      return binary(res, 200, result.data, result.contentType, result.filename);
    }

    if (req.method === "POST" && path === "/services/elo-agent-onboarder/bundle") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      const body = await readJson(req);
      return json(res, 200, framework.onboarder.generateBundle(body));
    }

    if (req.method === "GET" && path === "/services/elo-agent-web-plugin") {
      return html(res, 200, renderWebPluginServicePage());
    }

    if (req.method === "GET" && path === "/services/elo-agent-web-plugin/health") {
      return json(res, 200, {
        ok: true,
        service: "elo-agent-web-plugin",
        version: "v1",
        generatedAt: Date.now()
      });
    }

    if (req.method === "GET" && path === "/services/elo-agent-web-plugin/manifest") {
      return json(res, 200, {
        serviceId: "service.elo-agent-web-plugin",
        project: "elo-agent-web-plugin",
        title: "ELO Agent Web Plugin",
        kind: "plugin",
        contract: "elo-agent-web-plugin.bridge-pack.v1",
        endpoints: {
          landing: "/services/elo-agent-web-plugin",
          health: "/services/elo-agent-web-plugin/health",
          manifest: "/services/elo-agent-web-plugin/manifest",
          bridgePack: "/services/elo-agent-web-plugin/bridge-pack",
          artifactZip: "/services/elo-agent-web-plugin/artifact-zip"
        },
        outputs: {
          readme: "markdown",
          bridgeConfig: "json",
          extensionSettings: "json",
          localAdapterExample: "json",
          artifactZip: "zip"
        },
        browsers: ["chromium", "arc", "edge"],
        modes: ["unpacked", "developer"]
      });
    }

    if (req.method === "POST" && path === "/services/elo-agent-web-plugin/bridge-pack") {
      const body = await readJson(req);
      return json(res, 200, framework.webPluginFoundation.generateBridgePack(body));
    }

    if (req.method === "POST" && path === "/services/elo-agent-web-plugin/artifact-zip") {
      const body = await readJson(req);
      const result = await buildArtifactZip({
        bundle: body.artifactBundle,
        basename: "elo-agent-web-plugin-bridge-pack"
      });
      return binary(res, 200, result.data, result.contentType, result.filename);
    }

    if (req.method === "POST" && path === "/api/humans/register") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.registerHuman(body));
    }

    if (req.method === "POST" && path === "/api/auth/email/send-verification") {
      const body = await readJson(req);
      const issued = await framework.identity.issueEmailVerification(body);
      const cfg = oauthConfig();
      const verifyUrl = `${cfg.publicBaseUrl}/auth/verify-email?token=${encodeURIComponent(issued.token)}`;
      await emailService.sendVerificationEmail({
        to: issued.human.email,
        displayName: issued.human.displayName,
        verifyUrl,
        humanId: issued.human.humanId
      });
      return json(res, 200, {
        delivered: true,
        humanId: issued.human.humanId,
        email: issued.human.email,
        expiresAt: issued.expiresAt
      });
    }

    if (req.method === "POST" && path === "/api/auth/password/reset/request") {
      const body = await readJson(req);
      const issued = await framework.identity.issuePasswordReset(body);
      const cfg = oauthConfig();
      const resetUrl = `${cfg.publicBaseUrl}/auth/reset-password?token=${encodeURIComponent(issued.token)}`;
      await emailService.sendPasswordResetEmail({
        to: issued.human.email,
        displayName: issued.human.displayName,
        resetUrl,
        humanId: issued.human.humanId
      });
      return json(res, 200, {
        delivered: true,
        humanId: issued.human.humanId,
        email: issued.human.email,
        expiresAt: issued.expiresAt
      });
    }

    if (req.method === "POST" && path === "/api/auth/password/reset/confirm") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.resetPasswordWithToken(body));
    }

    if (req.method === "POST" && path === "/api/auth/github/unlink") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.unlinkGitHubHuman(body));
    }

    if (req.method === "POST" && path === "/api/auth/keys/issue") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.issueHumanAuthKeypair(body));
    }

    if (req.method === "POST" && path === "/api/auth/join-token/issue") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.issueAgentJoinToken(body));
    }

    if (req.method === "POST" && path === "/api/agents/register") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.registerAgent(body));
    }

    if (req.method === "POST" && path === "/api/agents/register-signed") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.registerAgentSigned(body));
    }

    if (req.method === "POST" && path === "/api/agents/register-token") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.registerAgentWithJoinToken(body));
    }

    if (req.method === "POST" && path === "/api/agents/register-signing-payload") {
      const body = await readJson(req);
      return json(res, 200, { payload: framework.identity.agentRegistrationSigningPayload(body) });
    }

    if (req.method === "POST" && path === "/api/agents/status") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.updateAgentStatus(body));
    }

    if (req.method === "GET" && path === "/api/onboarder/catalog") {
      requireSessionHumanId(req);
      return json(res, 200, framework.onboarder.catalog());
    }

    if (req.method === "POST" && path === "/api/onboarder/checkout-session") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, await framework.onboarderCommerce.createCheckoutSession({
        humanId,
        packageId: body.packageId,
        profile: body.profile,
        registrationMode: body.registrationMode,
        workflowPreset: body.workflowPreset
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/checkout-confirm") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, await framework.onboarderCommerce.confirmCheckout({
        humanId,
        purchaseId: body.purchaseId,
        checkoutSessionId: body.checkoutSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/session/start") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, framework.onboarderInstaller.startSession({
        humanId,
        packageId: body.packageId,
        profile: body.profile,
        registrationMode: body.registrationMode,
        workflowPreset: body.workflowPreset
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/session/update") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, framework.onboarderInstaller.updateSession({
        humanId,
        installerSessionId: body.installerSessionId,
        agentName: body.agentName,
        agentPersonality: body.agentPersonality,
        modelProvider: body.modelProvider,
        modelName: body.modelName,
        modelApiKey: body.modelApiKey,
        chatBinding: body.chatBinding,
        workflowPreset: body.workflowPreset
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/payment/checkout-session") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, await framework.onboarderInstaller.createCheckoutSession({
        humanId,
        installerSessionId: body.installerSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/payment/confirm") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, await framework.onboarderInstaller.confirmPayment({
        humanId,
        installerSessionId: body.installerSessionId,
        checkoutSessionId: body.checkoutSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/payment/status") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, framework.onboarderInstaller.paymentStatus({
        humanId,
        installerSessionId: body.installerSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/plan") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, await framework.onboarderInstaller.plan({
        humanId,
        installerSessionId: body.installerSessionId,
        worldUrl: body.worldUrl || framework.universeConfig.publicBaseUrl
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/script") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, await framework.onboarderInstaller.script({
        humanId,
        installerSessionId: body.installerSessionId,
        worldUrl: body.worldUrl || framework.universeConfig.publicBaseUrl
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/complete") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, framework.onboarderInstaller.complete({
        humanId,
        installerSessionId: body.installerSessionId,
        installReport: body.installReport || {}
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/register") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, await framework.onboarderInstaller.registerToWorld({
        humanId,
        installerSessionId: body.installerSessionId
      }));
    }

    if (req.method === "GET" && path === "/api/onboarder/purchases") {
      const humanId = requireSessionHumanId(req);
      return json(res, 200, framework.onboarderCommerce.listPurchases({ humanId }));
    }

    if (req.method === "POST" && path === "/api/onboarder/delivery-contract") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, framework.onboarderCommerce.generateDeliveryContract({
        humanId,
        entitlementId: body.entitlementId,
        agentId: body.agentId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/artifact-bundle") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      return json(res, 200, framework.onboarderCommerce.generateArtifactBundle({
        humanId,
        entitlementId: body.entitlementId,
        agentId: body.agentId,
        worldUrl: body.worldUrl || framework.universeConfig.publicBaseUrl
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/artifact-zip") {
      const body = await readJson(req);
      const humanId = requireSessionHumanId(req);
      const bundle = framework.onboarderCommerce.generateArtifactBundle({
        humanId,
        entitlementId: body.entitlementId,
        agentId: body.agentId,
        worldUrl: body.worldUrl || framework.universeConfig.publicBaseUrl
      });
      const result = await buildArtifactZip({
        bundle,
        basename: bundle.basename || "elo-agent-onboarder-delivery"
      });
      return binary(res, 200, result.data, result.contentType, result.filename);
    }

    if (req.method === "POST" && path === "/api/onboarder/setup-pack") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      const body = await readJson(req);
      return json(res, 200, framework.onboarder.generateBundle(body));
    }

    if (req.method === "POST" && path === "/api/onboarder/install-plan") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      const body = await readJson(req);
      return json(res, 200, framework.onboarder.generateInstallPlan(body));
    }

    if (req.method === "POST" && path === "/api/onboarder/bootstrap") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      const body = await readJson(req);
      return json(res, 200, framework.onboarder.generateBootstrapReport(body));
    }

    if (req.method === "POST" && path === "/api/onboarder/bundle") {
      if (!onboarderPublicServiceEnabled()) return json(res, 404, { error: "not found" });
      const body = await readJson(req);
      return json(res, 200, framework.onboarder.generateBundle(body));
    }

    if (req.method === "GET" && path === "/api/agents") {
      return json(res, 200, { items: framework.identity.summary().agents });
    }

    if (req.method === "POST" && path === "/api/plugins/register") {
      const body = await readJson(req);
      return json(res, 200, await framework.plugins.register(body));
    }

    if (req.method === "GET" && path === "/api/plugins") {
      return json(res, 200, { items: framework.plugins.list() });
    }

    if (req.method === "POST" && path === "/api/projects/create") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.create(body));
    }

    if (req.method === "POST" && path === "/api/projects/update") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.updateMetadata(body));
    }

    if (req.method === "POST" && path === "/api/projects/members/invite") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.inviteMember(body));
    }

    if (req.method === "POST" && path === "/api/projects/members/accept") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.acceptInvite(body));
    }

    if (req.method === "POST" && path === "/api/projects/members/role") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.changeMemberRole(body));
    }

    if (req.method === "POST" && path === "/api/projects/members/remove") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.removeMember(body));
    }

    if (req.method === "POST" && path === "/api/projects/participation/request") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.requestParticipation(body));
    }

    if (req.method === "POST" && path === "/api/projects/participation/resolve") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.resolveParticipationRequest(body));
    }

    if (req.method === "POST" && path === "/api/projects/foundation-runs/record") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.recordFoundationRun(body));
    }

    if (req.method === "POST" && path === "/api/projects/workspace/conversation") {
      const body = await readJson(req);
      return json(res, 200, await framework.projects.appendWorkspaceConversation(body));
    }

    if (req.method === "GET" && path === "/api/projects") {
      return json(res, 200, { items: framework.projects.list() });
    }

    if (req.method === "GET" && path === "/api/projects/operating") {
      return json(res, 200, { items: framework.projects.listOperating() });
    }

    if (req.method === "POST" && path === "/api/requirements/create") {
      const body = await readJson(req);
      return json(res, 200, await framework.requirements.create(body));
    }

    if (req.method === "GET" && path === "/api/requirements") {
      return json(res, 200, { items: framework.requirements.list() });
    }

    if (req.method === "POST" && path === "/api/requirements/update") {
      const body = await readJson(req);
      return json(res, 200, await framework.requirements.updateStatus(body));
    }

    if (req.method === "POST" && path === "/api/requirements/refine") {
      const body = await readJson(req);
      return json(res, 200, await framework.requirements.addRefinement(body));
    }

    return json(res, 404, { error: "not found" });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
});

const port = Number(process.env.PORT || 8788);
server.listen(port, () => {
  console.log(`ELO Open World listening on :${port}`);
});
