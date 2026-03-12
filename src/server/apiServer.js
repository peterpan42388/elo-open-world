import crypto from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenWorldFramework } from "../core/openWorld.js";
import { EmailService } from "../services/emailService.js";

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

function oauthConfig() {
  return {
    githubEnabled: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET),
    githubClientId: process.env.GITHUB_OAUTH_CLIENT_ID || "",
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "https://world.metavie.co",
    emailEnabled: emailService.enabled,
    emailMode: emailService.mode
  };
}

function renderAuthResultPage({ ok, message, humanId = "" }) {
  const safeMessage = String(message || "Authentication failed.").replace(/</g, "&lt;");
  const safeHumanId = String(humanId || "").replace(/'/g, "\\'");
  if (ok) {
    return `<!doctype html><html><body><script>
      localStorage.setItem('elo-open-world.session', '${safeHumanId}');
      window.location.replace('/#settings');
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

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
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
  res.writeHead(200, { "Content-Type": types[extname(fullPath)] || "text/plain; charset=utf-8" });
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
      path === "/" || path === "/index.html" || path === "/app.css" || path === "/app.js" || path.startsWith("/guides/")
    )) {
      return await serveStatic(path, res);
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

    if (req.method === "POST" && path === "/api/auth/github/unlink") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.unlinkGitHubHuman(body));
    }

    if (req.method === "POST" && path === "/api/auth/keys/issue") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.issueHumanAuthKeypair(body));
    }

    if (req.method === "POST" && path === "/api/agents/register") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.registerAgent(body));
    }

    if (req.method === "POST" && path === "/api/agents/register-signed") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.registerAgentSigned(body));
    }

    if (req.method === "POST" && path === "/api/agents/register-signing-payload") {
      const body = await readJson(req);
      return json(res, 200, { payload: framework.identity.agentRegistrationSigningPayload(body) });
    }

    if (req.method === "POST" && path === "/api/agents/status") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.updateAgentStatus(body));
    }

    if (req.method === "POST" && path === "/api/onboarder/bundle") {
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

    return json(res, 404, { error: "not found" });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
});

const port = Number(process.env.PORT || 8788);
server.listen(port, () => {
  console.log(`ELO Open World listening on :${port}`);
});
