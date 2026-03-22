import { text, token } from "../lib/validation.js";

export const FOUNDATION_INSTALL_PROFILES = {
  "macos-homebrew": {
    target: "local",
    platform: "macos",
    packageMode: "node",
    runtimeMode: "homebrew",
    installRoot: "~/elo-open-world",
    machineLabel: "macbook-homebrew"
  },
  "linux-systemd": {
    target: "local",
    platform: "linux",
    packageMode: "node",
    runtimeMode: "systemd",
    installRoot: "~/elo-open-world",
    machineLabel: "linux-systemd"
  },
  "server-docker-compose": {
    target: "server",
    platform: "linux",
    packageMode: "docker",
    runtimeMode: "docker-compose",
    installRoot: "/opt/elo-open-world",
    machineLabel: "server-docker-compose"
  }
};

export const ONBOARDER_WORKFLOW_PRESETS = {
  "office-productivity": {
    presetId: "office-productivity",
    displayName: "Office Productivity",
    description: "PPT, Excel, document, and image-processing skill set.",
    tags: ["ppt", "excel", "documents", "image"]
  },
  "visual-publisher": {
    presetId: "visual-publisher",
    displayName: "Visual Publisher",
    description: "Video workflow with multi-platform publishing automation.",
    tags: ["video", "publishing", "automation"]
  },
  "protocol-copilot": {
    presetId: "protocol-copilot",
    displayName: "Protocol Copilot",
    description: "Project protocol framework and coding collaboration baseline.",
    tags: ["protocol", "coding", "workflow"]
  }
};

export const ONBOARDER_PACKAGES = {
  "starter-openclaw": {
    packageId: "starter-openclaw",
    displayName: "Starter OpenClaw",
    description: "Basic official OpenClaw install with model configuration guidance.",
    displayPriceUsd: 8,
    availableProfiles: Object.keys(FOUNDATION_INSTALL_PROFILES),
    supportsRegistrationModes: ["register-to-eow", "local-only"],
    workflowPresetRequired: false,
    includedCapabilities: ["runtime-contract", "bootstrap-runner", "diagnostics", "stub-runtime", "model-guides"]
  },
  "work-openclaw": {
    packageId: "work-openclaw",
    displayName: "Work OpenClaw",
    description: "Starter package plus office productivity skills and image-model setup guidance.",
    displayPriceUsd: 16,
    availableProfiles: Object.keys(FOUNDATION_INSTALL_PROFILES),
    supportsRegistrationModes: ["register-to-eow", "local-only"],
    workflowPresetRequired: false,
    includedCapabilities: ["runtime-contract", "bootstrap-runner", "diagnostics", "stub-runtime", "model-guides", "office-skills", "image-model-guides", "capability-manifest", "package-manifest"]
  },
  "vision-openclaw": {
    packageId: "vision-openclaw",
    displayName: "Vision OpenClaw",
    description: "Work package plus video creation workflow and cross-platform publishing automation guides.",
    displayPriceUsd: 29,
    availableProfiles: Object.keys(FOUNDATION_INSTALL_PROFILES),
    supportsRegistrationModes: ["register-to-eow", "local-only"],
    workflowPresetRequired: false,
    includedCapabilities: ["runtime-contract", "bootstrap-runner", "diagnostics", "stub-runtime", "model-guides", "office-skills", "image-model-guides", "video-workflows", "publish-workflows", "video-model-guides", "capability-manifest", "package-manifest", "workflow-manifest"]
  },
  "builder-openclaw": {
    packageId: "builder-openclaw",
    displayName: "Builder OpenClaw",
    description: "Vision package plus EOW project protocol framework for coding and delivery operations.",
    displayPriceUsd: 79,
    availableProfiles: Object.keys(FOUNDATION_INSTALL_PROFILES),
    supportsRegistrationModes: ["register-to-eow", "local-only"],
    workflowPresetRequired: false,
    includedCapabilities: ["runtime-contract", "bootstrap-runner", "diagnostics", "stub-runtime", "model-guides", "office-skills", "image-model-guides", "video-workflows", "publish-workflows", "video-model-guides", "project-protocol-framework", "capability-manifest", "package-manifest", "workflow-manifest"]
  }
};

export function listOnboarderPackages() {
  return Object.values(ONBOARDER_PACKAGES).map((item) => ({ ...item }));
}

export function listOnboarderWorkflowPresets() {
  return Object.values(ONBOARDER_WORKFLOW_PRESETS).map((item) => ({ ...item, tags: [...item.tags] }));
}

export function buildOnboarderCatalogContract() {
  return {
    contract: "elo-agent-onboarder.package-catalog.v1",
    catalogVersion: "v1",
    packages: listOnboarderPackages(),
    workflowPresets: listOnboarderWorkflowPresets(),
    profiles: Object.entries(FOUNDATION_INSTALL_PROFILES).map(([profileId, profile]) => ({
      profileId,
      ...profile
    }))
  };
}

export function normalizeOnboarderPackageSelection(input = {}) {
  const packageId = token("packageId", String(input.packageId || "starter-openclaw"), 64).toLowerCase();
  const profile = token("profile", String(input.profile || "macos-homebrew"), 64).toLowerCase();
  const registrationMode = token("registrationMode", String(input.registrationMode || "register-to-eow"), 64).toLowerCase();
  const workflowPreset = text("workflowPreset", input.workflowPreset, 64).toLowerCase();

  const pkg = ONBOARDER_PACKAGES[packageId];
  if (!pkg) throw new Error(`unknown packageId: ${packageId}`);
  const profileConfig = FOUNDATION_INSTALL_PROFILES[profile];
  if (!profileConfig) throw new Error(`unknown profile: ${profile}`);
  if (!pkg.availableProfiles.includes(profile)) throw new Error(`package ${packageId} does not support profile ${profile}`);
  if (!pkg.supportsRegistrationModes.includes(registrationMode)) {
    throw new Error(`package ${packageId} does not support registrationMode ${registrationMode}`);
  }
  if (pkg.workflowPresetRequired) {
    if (!workflowPreset) throw new Error(`workflowPreset is required for package ${packageId}`);
    if (!ONBOARDER_WORKFLOW_PRESETS[workflowPreset]) throw new Error(`unknown workflowPreset: ${workflowPreset}`);
  } else if (workflowPreset) {
    if (!ONBOARDER_WORKFLOW_PRESETS[workflowPreset]) throw new Error(`unknown workflowPreset: ${workflowPreset}`);
  }

  return {
    packageId,
    package: { ...pkg },
    profile,
    profileConfig: { ...profileConfig },
    registrationMode,
    workflowPreset,
    workflowPresetConfig: workflowPreset ? { ...ONBOARDER_WORKFLOW_PRESETS[workflowPreset] } : null
  };
}

export function buildPackageManifest(selection, cfg = {}) {
  return {
    contract: "elo-agent-onboarder.package-manifest.v1",
    packageId: selection.packageId,
    displayName: selection.package.displayName,
    description: selection.package.description,
    profile: selection.profile,
    registrationMode: selection.registrationMode,
    workflowPreset: selection.workflowPreset || null,
    workflowPresetTags: selection.workflowPresetConfig?.tags || [],
    includedCapabilities: [...selection.package.includedCapabilities],
    runtime: cfg.runtime || "openclaw"
  };
}

export function buildCapabilityManifest(selection, cfg = {}) {
  const tags = [selection.packageId, selection.profile, selection.registrationMode];
  if (selection.workflowPresetConfig) tags.push(...selection.workflowPresetConfig.tags);
  return {
    contract: "elo-agent-onboarder.capability-manifest.v1",
    runtime: cfg.runtime || "openclaw",
    packageId: selection.packageId,
    profile: selection.profile,
    registrationMode: selection.registrationMode,
    workflowPreset: selection.workflowPreset || null,
    supportsStatusReporting: selection.registrationMode === "register-to-eow",
    supportsDeferredRegistration: true,
    tags
  };
}

export function buildWorkflowManifest(selection) {
  if (!selection.workflowPresetConfig) return null;
  return {
    contract: "elo-agent-onboarder.workflow-manifest.v1",
    packageId: selection.packageId,
    presetId: selection.workflowPresetConfig.presetId,
    displayName: selection.workflowPresetConfig.displayName,
    description: selection.workflowPresetConfig.description,
    tags: [...selection.workflowPresetConfig.tags]
  };
}
