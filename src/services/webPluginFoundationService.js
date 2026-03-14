function nowIso() {
  return new Date().toISOString();
}

function buildBridgeReadme({ humanId, agentId, worldUrl, browser, extensionMode, siteOrigin, agentEndpoint }) {
  return `# ELO Agent Web Plugin Bridge Pack

Generated: ${nowIso()}

## Purpose
This pack helps a user-owned browser extension connect a local agent to ELO Open World starter and workspace flows.

## Context
- humanId: ${humanId}
- agentId: ${agentId}
- worldUrl: ${worldUrl}
- browser: ${browser}
- extensionMode: ${extensionMode}
- siteOrigin: ${siteOrigin}
- agentEndpoint: ${agentEndpoint}

## Steps
1. Load the unpacked extension into your Chromium-compatible browser.
2. Open the extension popup and apply the generated bridge settings.
3. Verify the local agent is reachable at the configured endpoint.
4. Open ELO Open World and use Project Starter or workspace actions through the browser bridge.

## Documentation
- Bridge Protocol: https://github.com/peterpan42388/elo-agent-web-plugin/blob/codex/browser-bridge-skeleton/docs/BRIDGE_PROTOCOL.md
- Installation: https://github.com/peterpan42388/elo-agent-web-plugin/blob/codex/browser-bridge-skeleton/docs/INSTALLATION.md
- Universe Manifest: ${worldUrl}/api/universe/manifest
`;
}

export class WebPluginFoundationService {
  generateBridgePack({
    humanId,
    agentId,
    worldUrl,
    browser = "chromium",
    extensionMode = "unpacked",
    siteOrigin = "",
    agentEndpoint = "",
    notes = ""
  }) {
    const effectiveSiteOrigin = siteOrigin || worldUrl;
    const bridgeConfig = {
      contract: "elo-agent-web-plugin.bridge-config.v1",
      worldUrl,
      siteOrigin: effectiveSiteOrigin,
      humanId,
      agentId,
      browser,
      extensionMode,
      agentEndpoint,
      notes
    };

    const extensionSettings = {
      worldUrl,
      agentId,
      agentEndpoint,
      browser,
      extensionMode
    };

    const adapterExample = {
      contract: "elo-agent-web-plugin.local-adapter.example.v1",
      healthEndpoint: `${agentEndpoint || "http://127.0.0.1:18789"}/health`,
      chatEndpoint: `${agentEndpoint || "http://127.0.0.1:18789"}/eow/bridge/chat`,
      expectedMethods: ["GET", "POST"],
      expectedPayloadShape: {
        prompt: "string",
        context: "object"
      }
    };

    const readme = buildBridgeReadme({
      humanId,
      agentId,
      worldUrl,
      browser,
      extensionMode,
      siteOrigin: effectiveSiteOrigin,
      agentEndpoint
    });

    const artifactBundle = {
      contract: "elo-agent-web-plugin.artifact-bundle.v1",
      files: {
        "README.md": readme,
        "bridge.config.json": JSON.stringify(bridgeConfig, null, 2),
        "extension-settings.json": JSON.stringify(extensionSettings, null, 2),
        "local-agent-adapter.example.json": JSON.stringify(adapterExample, null, 2)
      }
    };

    return {
      contract: "elo-agent-web-plugin.bridge-pack.v1",
      plugin: {
        pluginId: "plugin.elo-agent-web-plugin",
        title: "ELO Agent Web Plugin"
      },
      target: {
        browser,
        extensionMode,
        siteOrigin: effectiveSiteOrigin,
        agentEndpoint
      },
      bridgePack: {
        readme,
        bridgeConfig: JSON.stringify(bridgeConfig, null, 2),
        extensionSettings: JSON.stringify(extensionSettings, null, 2),
        localAdapterExample: JSON.stringify(adapterExample, null, 2)
      },
      artifactBundle
    };
  }
}
