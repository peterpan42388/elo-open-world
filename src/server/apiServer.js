import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenWorldFramework } from "../core/openWorld.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = join(__dirname, "../../web");

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

async function serveStatic(pathname, res) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const fullPath = join(WEB_ROOT, target);
  const data = await readFile(fullPath);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8"
  };
  res.writeHead(200, { "Content-Type": types[extname(fullPath)] || "text/plain; charset=utf-8" });
  res.end(data);
}

const framework = await new OpenWorldFramework().init();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname;

    if ((req.method === "GET" || req.method === "HEAD") && (path === "/" || path === "/index.html" || path === "/app.css" || path === "/app.js")) {
      return await serveStatic(path, res);
    }

    if (req.method === "GET" && path === "/api/world/summary") {
      return json(res, 200, framework.summary());
    }

    if (req.method === "GET" && path === "/api/universe/manifest") {
      return json(res, 200, framework.manifest());
    }

    if (req.method === "POST" && path === "/api/humans/register") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.registerHuman(body));
    }

    if (req.method === "POST" && path === "/api/agents/register") {
      const body = await readJson(req);
      return json(res, 200, await framework.identity.registerAgent(body));
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

    return json(res, 404, { error: "not found" });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
});

const port = Number(process.env.PORT || 8788);
server.listen(port, () => {
  console.log(`ELO Open World listening on :${port}`);
});
