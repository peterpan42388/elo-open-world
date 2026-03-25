import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DashboardDeployService } from "../src/services/dashboardDeployService.js";

test("dashboard deploy service should issue one-time ticket and return signed artifact headers", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "elo-dash-test-"));
  const artifactPath = join(tempRoot, "elo-agent-dashboard-bundle.zip");
  const manifestPath = `${artifactPath}.manifest.json`;
  const prevArtifact = process.env.ONBOARDER_DASHBOARD_ARTIFACT_STABLE_PATH;
  const prevManifest = process.env.ONBOARDER_DASHBOARD_MANIFEST_STABLE_PATH;
  process.env.ONBOARDER_DASHBOARD_ARTIFACT_STABLE_PATH = artifactPath;
  process.env.ONBOARDER_DASHBOARD_MANIFEST_STABLE_PATH = manifestPath;
  try {
    const service = new DashboardDeployService({ publicBaseUrl: "https://world.metavie.co" });
    const artifactBuffer = Buffer.from("elo-agent-dashboard-test-artifact", "utf8");
    const manifest = await service.writeLocalArtifact({
      channel: "stable",
      buffer: artifactBuffer,
      manifest: {
        version: "test-v1",
        signature: "sig-test-v1"
      }
    });

    const ticket = service.createDeployTicket({
      humanId: "human.test",
      agentId: "agent.test",
      channel: "stable"
    });

    const artifact = await service.artifactByTicket({
      humanId: "human.test",
      ticket: ticket.deployTicket
    });

    assert.equal(artifact.contentType, "application/zip");
    assert.equal(artifact.fileName, "elo-agent-dashboard-bundle.zip");
    assert.equal(artifact.buffer.toString("utf8"), artifactBuffer.toString("utf8"));
    assert.equal(artifact.headers["X-ELO-Dashboard-Version"], "test-v1");
    assert.equal(artifact.headers["X-ELO-Dashboard-Signature"], "sig-test-v1");
    assert.equal(artifact.headers["X-ELO-Dashboard-SHA256"], manifest.sha256);

    await assert.rejects(
      service.artifactByTicket({
        humanId: "human.test",
        ticket: ticket.deployTicket
      }),
      /already used/
    );
  } finally {
    if (prevArtifact === undefined) delete process.env.ONBOARDER_DASHBOARD_ARTIFACT_STABLE_PATH;
    else process.env.ONBOARDER_DASHBOARD_ARTIFACT_STABLE_PATH = prevArtifact;
    if (prevManifest === undefined) delete process.env.ONBOARDER_DASHBOARD_MANIFEST_STABLE_PATH;
    else process.env.ONBOARDER_DASHBOARD_MANIFEST_STABLE_PATH = prevManifest;
  }
});
