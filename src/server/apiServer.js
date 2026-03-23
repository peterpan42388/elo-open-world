import crypto from "node:crypto";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenWorldFramework } from "../core/openWorld.js";
import { EmailService } from "../services/emailService.js";
import { buildArtifactZip } from "../services/artifactZipService.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = join(__dirname, "../../web");
const INSTALLER_ROOT = join(__dirname, "../../installer");
const INSTALLER_DIST_ROOT = join(INSTALLER_ROOT, "dist");
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

function html(res, status, content, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
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

async function readIfExists(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
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

function renderAuthResultPage({ ok, message, humanId = "", installerAuthSessionId = "" }) {
  const safeMessage = String(message || "Authentication failed.").replace(/</g, "&lt;");
  const safeHumanId = String(humanId || "").replace(/'/g, "\\'");
  const safeInstallerAuthSessionId = String(installerAuthSessionId || "").replace(/'/g, "\\'");
  if (ok) {
    const extra = safeInstallerAuthSessionId ? `&installerAuthSessionId=${encodeURIComponent(installerAuthSessionId || "")}` : "";
    return `<!doctype html><html><body><script>
      localStorage.setItem('elo-open-world.session', '${safeHumanId}');
      window.location.replace('/?sessionHumanId=${encodeURIComponent(humanId || "")}${extra}#settings');
    </script><p>${safeMessage}</p></body></html>`;
  }
  return `<!doctype html><html><body><script>
    window.location.replace('/human-auth');
  </script><p>${safeMessage}</p></body></html>`;
}

function renderEmailVerifyResultPage({ ok, message }) {
  const safeMessage = String(message || "Email verification failed.").replace(/</g, "&lt;");
  const route = ok ? "/#settings" : "/human-auth";
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
          <div class="topbar-actions"><a class="topbar-button secondary" href="/human-auth">Back To Sign In</a></div>
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
          status.textContent = 'Password reset complete. Redirecting to sign in...';
          setTimeout(() => window.location.replace('/human-auth'), 1200);
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

async function readBodyParams(req) {
  const raw = await readRaw(req);
  if (!raw) return {};
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseCookies(req) {
  const source = String(req.headers?.cookie || "");
  const parts = source.split(";").map((part) => part.trim()).filter(Boolean);
  const cookies = {};
  for (const pair of parts) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const key = decodeURIComponent(pair.slice(0, index).trim());
    const value = decodeURIComponent(pair.slice(index + 1).trim());
    cookies[key] = value;
  }
  return cookies;
}

function sessionCookie(res, humanId) {
  const safeValue = encodeURIComponent(String(humanId || "").trim());
  res.setHeader("Set-Cookie", `eow_human=${safeValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
}

function sessionHumanId(req) {
  const value = req.headers["x-elo-session-human-id"];
  return typeof value === "string" ? value.trim() : "";
}

function resolveSessionHumanId(req) {
  const fromHeader = sessionHumanId(req);
  if (fromHeader) return fromHeader;
  const fromCookie = parseCookies(req).eow_human || "";
  return typeof fromCookie === "string" ? fromCookie.trim() : "";
}

function requireSessionHumanId(req) {
  const humanId = resolveSessionHumanId(req);
  if (!humanId) throw new Error("Sign in to ELO Open World first.");
  return humanId;
}

function requireActiveHumanId(req, requiredScopes = []) {
  const bearer = framework.oauth.parseBearerTokenFromRequest(req);
  if (bearer) {
    try {
      const claims = framework.oauth.verifyAccessToken({ accessToken: bearer, requiredScopes });
      return claims.humanId;
    } catch (error) {
      throw new Error(error.message || "Invalid OAuth access token.");
    }
  }
  return requireSessionHumanId(req);
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
      path === "/human-auth" ||
      path === "/oauth/consent" ||
      path === "/index.html" ||
      path === "/app.css" ||
      path === "/app.js" ||
      path.startsWith("/guides/") ||
      path.startsWith("/lib/")
    )) {
      const staticPath = path === "/human-auth"
        ? "/human-auth.html"
        : path === "/oauth/consent"
          ? "/oauth-consent.html"
          : path;
      return await serveStatic(staticPath, res);
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

    if (req.method === "GET" && path === "/oauth/authorize") {
      const params = Object.fromEntries(url.searchParams.entries());
      const humanId = resolveSessionHumanId(req);
      if (!humanId) {
        const returnTo = encodeURIComponent(`${path}${url.search}`);
        return redirect(res, `/human-auth?returnTo=${returnTo}`);
      }
      const granted = framework.oauth.authorize({ humanId, query: params });
      const redirectUri = String(params.redirect_uri || "");
      const location = new URL(redirectUri);
      location.searchParams.set("code", granted.code);
      if (typeof granted.state === "string" && granted.state) {
        location.searchParams.set("state", granted.state);
      }
      return redirect(res, location.toString());
    }

    if (req.method === "POST" && path === "/oauth/token") {
      const body = await readBodyParams(req);
      try {
        const payload = await framework.oauth.token({
          grantType: body.grant_type,
          code: body.code,
          redirectUri: body.redirect_uri,
          clientId: body.client_id,
          codeVerifier: body.code_verifier,
          refreshToken: body.refresh_token
        });
        return json(res, 200, payload);
      } catch (error) {
        if (error?.oauth) return json(res, 400, error.oauth);
        throw error;
      }
    }

    if (req.method === "POST" && path === "/oauth/revoke") {
      const body = await readBodyParams(req);
      try {
        const payload = await framework.oauth.revoke({
          token: body.token,
          clientId: body.client_id
        });
        return json(res, 200, payload);
      } catch (error) {
        if (error?.oauth) return json(res, 400, error.oauth);
        throw error;
      }
    }

    if (req.method === "POST" && path === "/api/billing/stripe/webhook") {
      const raw = await readRaw(req);
      const signature = req.headers["stripe-signature"];
      const event = await framework.onboarderCommerce.billingProvider.verifyWebhook(raw, signature);
      return json(res, 200, await framework.onboarderCommerce.handleStripeEvent(event));
    }

    if (req.method === "POST" && path === "/api/auth/login") {
      const body = await readJson(req);
      const auth = framework.identity.authenticateLocal(body);
      sessionCookie(res, auth.human.humanId);
      return json(res, 200, auth);
    }

    if (req.method === "GET" && path === "/api/auth/me") {
      const humanId = requireActiveHumanId(req);
      return json(res, 200, {
        human: framework.identity.getHuman(humanId)
      });
    }

    if (req.method === "GET" && path === "/auth/github/start") {
      const cfg = oauthConfig();
      if (!cfg.githubEnabled) {
        return html(res, 503, renderAuthResultPage({ ok: false, message: "GitHub OAuth is not configured on this deployment." }));
      }
      const mode = (url.searchParams.get("mode") || "signin").trim().toLowerCase();
      const humanId = (url.searchParams.get("humanId") || "").trim();
      const installerAuthSessionId = (url.searchParams.get("installerAuthSessionId") || "").trim();
      const returnTo = (url.searchParams.get("returnTo") || "").trim();
      const state = crypto.randomUUID();
      githubAuthStates.set(state, { createdAt: Date.now(), mode, humanId, installerAuthSessionId, returnTo });
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
      if (authState.installerAuthSessionId) {
        try {
          framework.onboarderInstaller.bindAuthSession({
            humanId: human.humanId,
            installerAuthSessionId: authState.installerAuthSessionId
          });
        } catch {
          // Ignore bind failure at callback stage. Web app can retry bind after landing.
        }
      }
      sessionCookie(res, human.humanId);
      if (authState.returnTo) {
        const target = new URL(authState.returnTo, cfg.publicBaseUrl);
        if (target.origin === cfg.publicBaseUrl) return redirect(res, target.pathname + target.search + target.hash);
      }
      return html(res, 200, renderAuthResultPage({
        ok: true,
        humanId: human.humanId,
        installerAuthSessionId: authState.installerAuthSessionId || "",
        message: `Signed in as ${human.humanId}`
      }));
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
      const human = await framework.identity.registerHuman(body);
      sessionCookie(res, human.humanId);
      return json(res, 200, human);
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
      requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, framework.onboarder.catalog());
    }

    if (req.method === "POST" && path === "/api/onboarder/checkout-session") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
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
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, await framework.onboarderCommerce.confirmCheckout({
        humanId,
        purchaseId: body.purchaseId,
        checkoutSessionId: body.checkoutSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/session/start") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, framework.onboarderInstaller.startSession({
        humanId,
        packageId: body.packageId,
        profile: body.profile,
        registrationMode: body.registrationMode,
        workflowPreset: body.workflowPreset
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/auth/start") {
      const body = await readJson(req);
      return json(res, 200, framework.onboarderInstaller.startAuthSession({
        installerSessionId: body.installerSessionId || ""
      }));
    }

    if (req.method === "GET" && path === "/api/onboarder/installer/auth/status") {
      return json(res, 200, framework.onboarderInstaller.authStatus({
        installerAuthSessionId: url.searchParams.get("installerAuthSessionId") || ""
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/auth/cancel") {
      const body = await readJson(req);
      return json(res, 200, framework.onboarderInstaller.cancelAuthSession({
        installerAuthSessionId: body.installerAuthSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/auth/bind") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, framework.onboarderInstaller.bindAuthSession({
        humanId,
        installerAuthSessionId: body.installerAuthSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/session/update") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
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
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, await framework.onboarderInstaller.createCheckoutSession({
        humanId,
        installerSessionId: body.installerSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/payment/confirm") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, await framework.onboarderInstaller.confirmPayment({
        humanId,
        installerSessionId: body.installerSessionId,
        checkoutSessionId: body.checkoutSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/payment/status") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, framework.onboarderInstaller.paymentStatus({
        humanId,
        installerSessionId: body.installerSessionId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/plan") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, await framework.onboarderInstaller.plan({
        humanId,
        installerSessionId: body.installerSessionId,
        worldUrl: body.worldUrl || framework.universeConfig.publicBaseUrl
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/script") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, await framework.onboarderInstaller.script({
        humanId,
        installerSessionId: body.installerSessionId,
        worldUrl: body.worldUrl || framework.universeConfig.publicBaseUrl
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/complete") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, framework.onboarderInstaller.complete({
        humanId,
        installerSessionId: body.installerSessionId,
        installReport: body.installReport || {}
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/installer/register") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, await framework.onboarderInstaller.registerToWorld({
        humanId,
        installerSessionId: body.installerSessionId
      }));
    }

    if (req.method === "GET" && path === "/api/onboarder/installer/download") {
      const sessionFromHeader = resolveSessionHumanId(req);
      const sessionFromQuery = String(url.searchParams.get("sessionHumanId") || "").trim();
      const effectiveSession = sessionFromHeader || sessionFromQuery;
      if (!effectiveSession) {
        throw new Error("Sign in to ELO Open World first.");
      }
      const os = String(url.searchParams.get("os") || "macos").toLowerCase();
      const executableTargets = os === "windows"
        ? [
            {
              path: join(INSTALLER_DIST_ROOT, "windows", "ELO-Agent-Onboarder-Installer.exe"),
              filename: "ELO-Agent-Onboarder-Installer.exe",
              contentType: "application/vnd.microsoft.portable-executable"
            },
            {
              path: join(INSTALLER_DIST_ROOT, "windows", "ELO-Agent-Onboarder-Installer.zip"),
              filename: "ELO-Agent-Onboarder-Installer-windows.zip",
              contentType: "application/zip"
            }
          ]
        : [
            {
              path: join(INSTALLER_DIST_ROOT, "macos", "ELO-Agent-Onboarder-Installer.app.zip"),
              filename: "ELO-Agent-Onboarder-Installer.app.zip",
              contentType: "application/zip"
            }
          ];
      for (const target of executableTargets) {
        const file = await readIfExists(target.path);
        if (file) {
          return binary(res, 200, file, target.contentType, target.filename);
        }
      }
      const launcherName = os === "windows" ? "start-installer.bat" : "start-installer.sh";
      const launcher = os === "windows"
        ? "@echo off\r\npython eow_onboarder_installer.py\r\npause\r\n"
        : "#!/usr/bin/env sh\nset -eu\npython3 eow_onboarder_installer.py\n";
      const readme = await readFile(join(INSTALLER_ROOT, "README.md"), "utf8");
      const requirements = await readFile(join(INSTALLER_ROOT, "requirements.txt"), "utf8");
      const installerMain = await readFile(join(INSTALLER_ROOT, "eow_onboarder_installer.py"), "utf8");
      const bundle = {
        contract: "elo-agent-onboarder.installer-artifact-bundle.v1",
        files: {
          "README.md": readme,
          "requirements.txt": requirements,
          "eow_onboarder_installer.py": installerMain,
          [launcherName]: launcher
        }
      };
      const zip = await buildArtifactZip({
        bundle,
        basename: `elo-agent-onboarder-installer-${os}`
      });
      return binary(res, 200, zip.data, zip.contentType, zip.filename);
    }

    if (req.method === "GET" && path === "/api/onboarder/purchases") {
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, framework.onboarderCommerce.listPurchases({ humanId }));
    }

    if (req.method === "POST" && path === "/api/onboarder/delivery-contract") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, framework.onboarderCommerce.generateDeliveryContract({
        humanId,
        entitlementId: body.entitlementId,
        agentId: body.agentId
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/artifact-bundle") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
      return json(res, 200, framework.onboarderCommerce.generateArtifactBundle({
        humanId,
        entitlementId: body.entitlementId,
        agentId: body.agentId,
        worldUrl: body.worldUrl || framework.universeConfig.publicBaseUrl
      }));
    }

    if (req.method === "POST" && path === "/api/onboarder/artifact-zip") {
      const body = await readJson(req);
      const humanId = requireActiveHumanId(req, ["onboarder.install"]);
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
