import crypto from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { now, text, token, uid } from "../lib/validation.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export class DashboardDeployService {
  constructor({ publicBaseUrl = "https://world.metavie.co" } = {}) {
    this.publicBaseUrl = text("publicBaseUrl", publicBaseUrl || "https://world.metavie.co", 256) || "https://world.metavie.co";
    this.repoOwner = text("DASHBOARD_REPO_OWNER", process.env.DASHBOARD_REPO_OWNER || "peterpan42388", 128) || "peterpan42388";
    this.repoName = text("DASHBOARD_REPO_NAME", process.env.DASHBOARD_REPO_NAME || "elo-agent-dashboard", 128) || "elo-agent-dashboard";
    this.releaseTagStable = text("DASHBOARD_RELEASE_TAG_STABLE", process.env.DASHBOARD_RELEASE_TAG_STABLE || "stable", 128) || "stable";
    this.releaseAssetName = text("DASHBOARD_RELEASE_ASSET_NAME", process.env.DASHBOARD_RELEASE_ASSET_NAME || "elo-agent-dashboard-bundle.zip", 256) || "elo-agent-dashboard-bundle.zip";
    this.minInstallerVersion = text("DASHBOARD_MIN_INSTALLER_VERSION", process.env.DASHBOARD_MIN_INSTALLER_VERSION || "762ddd1", 128) || "762ddd1";
    this.githubToken = text(
      "DASHBOARD_GITHUB_TOKEN",
      process.env.DASHBOARD_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "",
      4096
    );
    this.localArtifactStablePath = text(
      "ONBOARDER_DASHBOARD_ARTIFACT_STABLE_PATH",
      process.env.ONBOARDER_DASHBOARD_ARTIFACT_STABLE_PATH || join(ROOT, "runtime", "dashboard-artifacts", this.releaseAssetName),
      1024
    );
    this.localManifestStablePath = text(
      "ONBOARDER_DASHBOARD_MANIFEST_STABLE_PATH",
      process.env.ONBOARDER_DASHBOARD_MANIFEST_STABLE_PATH || `${this.localArtifactStablePath}.manifest.json`,
      1024
    );
    this.deployTicketTtlMs = Number(process.env.DASHBOARD_DEPLOY_TICKET_TTL_MS || 10 * 60 * 1000);
    this.ticketMap = new Map();
    this.artifactCache = new Map();
    this.cacheTtlMs = Number(process.env.DASHBOARD_ARTIFACT_CACHE_TTL_MS || 5 * 60 * 1000);
  }

  config({ humanId, agentId = "" }) {
    const safeHumanId = token("humanId", humanId, 128);
    const safeAgentId = text("agentId", agentId, 128);
    return {
      contract: "elo-agent-dashboard.deploy-config.v1",
      generatedAt: now(),
      humanId: safeHumanId,
      agentId: safeAgentId,
      channels: ["stable"],
      defaultChannel: "stable",
      version: this.releaseTagStable,
      dashboardUrl: "http://127.0.0.1:19777",
      localhostOnly: true,
      noSourceExposure: true,
      minimumInstallerVersion: this.minInstallerVersion,
      artifact: {
        fileName: this.releaseAssetName,
        signatureMode: "sha256",
      },
      endpoints: {
        deployTicket: "/api/onboarder/dashboard/deploy-ticket",
        artifact: "/api/onboarder/dashboard/artifact",
        guide: "/api/onboarder/dashboard/guide"
      }
    };
  }

  createDeployTicket({ humanId, agentId = "", channel = "stable" }) {
    const safeHumanId = token("humanId", humanId, 128);
    const safeAgentId = text("agentId", agentId, 128);
    const safeChannel = text("channel", channel || "stable", 32).toLowerCase() || "stable";
    if (safeChannel !== "stable") throw new Error(`unsupported channel: ${safeChannel}`);
    const deployTicket = uid("dash");
    const record = {
      contract: "elo-agent-dashboard.deploy-ticket.v1",
      deployTicket,
      humanId: safeHumanId,
      agentId: safeAgentId,
      channel: safeChannel,
      createdAt: now(),
      expiresAt: now() + this.deployTicketTtlMs,
      consumedAt: 0
    };
    this.ticketMap.set(deployTicket, record);
    return {
      contract: "elo-agent-dashboard.deploy-ticket.v1",
      deployTicket,
      channel: safeChannel,
      expiresAt: record.expiresAt,
      artifactPath: `/api/onboarder/dashboard/artifact?ticket=${encodeURIComponent(deployTicket)}`
    };
  }

  async artifactByTicket({ humanId, ticket }) {
    const safeHumanId = token("humanId", humanId, 128);
    const safeTicket = token("ticket", ticket, 256);
    const record = this.ticketMap.get(safeTicket);
    if (!record) throw new Error("dashboard deploy ticket not found");
    if (record.humanId !== safeHumanId) throw new Error("dashboard deploy ticket does not belong to active human");
    if (record.expiresAt <= now()) throw new Error("dashboard deploy ticket expired");
    if (record.consumedAt) throw new Error("dashboard deploy ticket already used");

    const artifact = await this.#resolveArtifact(record.channel);
    record.consumedAt = now();

    return {
      buffer: artifact.buffer,
      contentType: "application/zip",
      fileName: artifact.fileName,
      headers: {
        "X-ELO-Dashboard-Version": artifact.version,
        "X-ELO-Dashboard-SHA256": artifact.sha256,
        ...(artifact.signature ? { "X-ELO-Dashboard-Signature": artifact.signature } : {})
      }
    };
  }

  guide() {
    return {
      contract: "elo-agent-dashboard.deploy-guide.v1",
      generatedAt: now(),
      title: "ELO Agent Dashboard Deployment Guide",
      content: [
        "1. Install OpenClaw via ELO Agent Onboarder.",
        "2. Complete payment and installer flow.",
        "3. Installer requests a one-time deploy ticket from EOW.",
        "4. Installer downloads signed dashboard artifact through EOW and deploys locally.",
        "5. Open dashboard from desktop shortcut and configure local API keys.",
        "6. API keys remain local-only in config/api-keys.local.json."
      ]
    };
  }

  async #resolveArtifact(channel) {
    const cached = this.artifactCache.get(channel);
    if (cached && cached.cachedAt + this.cacheTtlMs > now()) return cached;

    const resolved = (await this.#resolveLocalArtifact(channel)) || (await this.#resolveGitHubArtifact(channel));
    if (!resolved) {
      throw new Error("dashboard artifact is not available; publish release or configure local artifact path");
    }
    this.artifactCache.set(channel, resolved);
    return resolved;
  }

  async #resolveLocalArtifact(channel) {
    if (channel !== "stable") return null;
    if (!existsSync(this.localArtifactStablePath)) return null;
    const buffer = await readFile(this.localArtifactStablePath);
    const sha256 = sha256Hex(buffer);
    let version = "local-stable";
    let signature = "";

    if (existsSync(this.localManifestStablePath)) {
      try {
        const manifest = JSON.parse(await readFile(this.localManifestStablePath, "utf8"));
        version = text("manifest.version", String(manifest.version || version), 128) || version;
        signature = text("manifest.signature", String(manifest.signature || ""), 1024);
      } catch {
        // keep defaults
      }
    }

    return {
      fileName: this.releaseAssetName,
      version,
      sha256,
      signature,
      buffer,
      cachedAt: now()
    };
  }

  async #resolveGitHubArtifact(channel) {
    if (!this.githubToken) return null;
    const tag = channel === "stable" ? this.releaseTagStable : this.releaseTagStable;
    const release = await this.#githubGetJson(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/releases/tags/${encodeURIComponent(tag)}`);
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const artifactAsset = assets.find((asset) => String(asset.name || "") === this.releaseAssetName)
      || assets.find((asset) => String(asset.name || "").endsWith(".zip"));
    if (!artifactAsset) return null;

    const buffer = await this.#downloadGitHubAssetBinary(artifactAsset);
    const sha256 = sha256Hex(buffer);
    const manifestAsset = assets.find((asset) => String(asset.name || "").endsWith(".manifest.json"));
    let signature = "";
    let version = text("release.tag_name", String(release.tag_name || tag), 128) || tag;

    if (manifestAsset) {
      try {
        const manifestRaw = await this.#downloadGitHubAssetText(manifestAsset);
        const manifest = JSON.parse(manifestRaw);
        version = text("manifest.version", String(manifest.version || version), 128) || version;
        signature = text("manifest.signature", String(manifest.signature || ""), 1024);
      } catch {
        // keep defaults
      }
    }

    return {
      fileName: String(artifactAsset.name || this.releaseAssetName),
      version,
      sha256,
      signature,
      buffer,
      cachedAt: now()
    };
  }

  async #githubGetJson(url) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.githubToken}`,
        "User-Agent": "elo-open-world"
      }
    });
    if (!res.ok) {
      const textBody = await res.text().catch(() => "");
      throw new Error(`github release fetch failed: ${res.status} ${textBody}`);
    }
    return res.json();
  }

  async #githubGetBinary(url) {
    const acceptHeader = String(url || "").includes("api.github.com/")
      ? "application/octet-stream"
      : "*/*";
    const res = await fetch(url, {
      headers: {
        Accept: acceptHeader,
        Authorization: `Bearer ${this.githubToken}`,
        "User-Agent": "elo-open-world"
      },
      redirect: "follow"
    });
    if (!res.ok) {
      const textBody = await res.text().catch(() => "");
      throw new Error(`github artifact fetch failed: ${res.status} ${textBody}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }

  async #githubGetText(url) {
    const buffer = await this.#githubGetBinary(url);
    return buffer.toString("utf8");
  }

  async #downloadGitHubAssetBinary(asset) {
    const urls = [
      text("asset.url", String(asset?.url || ""), 2048),
      text("asset.browser_download_url", String(asset?.browser_download_url || ""), 2048)
    ].filter(Boolean);
    let lastError = null;
    for (const url of urls) {
      try {
        return await this.#githubGetBinary(url);
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    throw new Error("github artifact fetch failed: release asset does not include a downloadable URL");
  }

  async #downloadGitHubAssetText(asset) {
    const buffer = await this.#downloadGitHubAssetBinary(asset);
    return buffer.toString("utf8");
  }

  async ensureArtifactDir() {
    const targetDir = join(ROOT, "runtime", "dashboard-artifacts");
    if (!existsSync(targetDir)) await mkdir(targetDir, { recursive: true });
    return targetDir;
  }

  async writeLocalArtifact({ channel = "stable", buffer, manifest = {} }) {
    if (channel !== "stable") throw new Error("only stable channel supports local write currently");
    await this.ensureArtifactDir();
    await writeFile(this.localArtifactStablePath, buffer);
    const safeManifest = {
      contract: "elo-agent-dashboard.release-manifest.v1",
      version: text("manifest.version", String(manifest.version || "local"), 128) || "local",
      sha256: text("manifest.sha256", String(manifest.sha256 || sha256Hex(buffer)), 256) || sha256Hex(buffer),
      signature: text("manifest.signature", String(manifest.signature || ""), 1024),
      fileName: this.releaseAssetName,
      builtAt: text("manifest.builtAt", String(manifest.builtAt || new Date().toISOString()), 128)
    };
    await writeFile(this.localManifestStablePath, `${JSON.stringify(safeManifest, null, 2)}\n`, "utf8");
    this.artifactCache.delete("stable");
    return safeManifest;
  }
}
