import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { IdentityRegistry } from "./identityRegistry.js";
import { PluginRegistry } from "./pluginRegistry.js";
import { ProjectProtocol } from "./projectProtocol.js";
import { ProjectRequirementRegistry } from "./projectRequirements.js";
import { StateStore } from "../services/stateStore.js";
import { GitHubRepoService } from "../services/githubRepoService.js";
import { ProjectInitializer } from "../services/projectInitializer.js";
import { OpenClawOnboardingService } from "../services/openClawOnboardingService.js";
import { WebPluginFoundationService } from "../services/webPluginFoundationService.js";
import { OnboarderCommerceService } from "../services/onboarderCommerceService.js";
import { StripeBillingService } from "../services/stripeBillingService.js";
import { OnboarderInstallerService } from "../services/onboarderInstallerService.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export class OpenWorldFramework {
  constructor({ stateFile, projectsRoot, githubRepoService, universeConfig = {}, billingProvider = null } = {}) {
    this.stateFile = stateFile || join(ROOT, "runtime", "state.json");
    this.projectsRoot = projectsRoot || join(ROOT, "runtime", "projects");
    this.store = new StateStore(this.stateFile);
    this.githubRepoService = githubRepoService || new GitHubRepoService();
    this.projectInitializer = new ProjectInitializer({
      projectsRoot: this.projectsRoot,
      githubRepoService: this.githubRepoService
    });
    this.universeConfig = {
      universeId: universeConfig.universeId || process.env.UNIVERSE_ID || "elo-universe-0",
      sourceRepo: universeConfig.sourceRepo || process.env.SOURCE_REPO || "github.com/peterpan42388/elo-open-world",
      sourceRevision: universeConfig.sourceRevision || process.env.SOURCE_REVISION || process.env.GIT_COMMIT || "development",
      publicBaseUrl: universeConfig.publicBaseUrl || process.env.PUBLIC_BASE_URL || "https://world.metavie.co",
      operatorLabel: universeConfig.operatorLabel || process.env.OPERATOR_LABEL || "MetaVie",
      protocolVersion: universeConfig.protocolVersion || "openworld.universe.v1"
    };
    this.billingProvider = billingProvider || new StripeBillingService({ publicBaseUrl: this.universeConfig.publicBaseUrl });
    this.onboarder = null;
    this.onboarderCommerce = null;
    this.onboarderInstaller = null;
    this.webPluginFoundation = null;
    this.identity = null;
    this.plugins = null;
    this.requirements = null;
    this.projects = null;
  }

  async init() {
    await mkdir(this.projectsRoot, { recursive: true });
    const snapshot = await this.store.load();
    const persist = async () => {
      await this.store.save(this.snapshot());
    };
    this.identity = new IdentityRegistry({ humans: snapshot.humans, agents: snapshot.agents, joinTokens: snapshot.joinTokens, onChange: persist });
    this.plugins = new PluginRegistry({ plugins: snapshot.plugins, onChange: persist });
    this.requirements = new ProjectRequirementRegistry({
      requirements: snapshot.requirements,
      identityRegistry: this.identity,
      onChange: persist
    });
    this.projects = new ProjectProtocol({
      projects: snapshot.projects,
      identityRegistry: this.identity,
      requirementRegistry: this.requirements,
      onChange: persist,
      projectInitializer: this.projectInitializer
    });
    this.onboarder = new OpenClawOnboardingService({ identityRegistry: this.identity });
    this.onboarderCommerce = new OnboarderCommerceService({
      identityRegistry: this.identity,
      onboarderService: this.onboarder,
      billingProvider: this.billingProvider,
      onboarder: snapshot.onboarder,
      onChange: persist
    });
    this.onboarderInstaller = new OnboarderInstallerService({
      identityRegistry: this.identity,
      onboarderService: this.onboarder,
      onboarderCommerce: this.onboarderCommerce,
      onboarder: snapshot.onboarder,
      onChange: persist
    });
    this.webPluginFoundation = new WebPluginFoundationService();
    return this;
  }

  snapshot() {
    const identity = this.identity.snapshot();
    const plugins = this.plugins.snapshot();
    const projects = this.projects.snapshot();
    const commerce = this.onboarderCommerce.snapshot();
    const installer = this.onboarderInstaller.snapshot();
    return {
      ...identity,
      ...plugins,
      ...projects,
      onboarder: {
        ...(commerce.onboarder || {}),
        ...(installer.onboarder || {})
      }
    };
  }

  manifest() {
    return {
      universeId: this.universeConfig.universeId,
      sourceRepo: this.universeConfig.sourceRepo,
      sourceRevision: this.universeConfig.sourceRevision,
      publicBaseUrl: this.universeConfig.publicBaseUrl,
      operatorLabel: this.universeConfig.operatorLabel,
      protocolVersion: this.universeConfig.protocolVersion,
      summaryUrl: `${this.universeConfig.publicBaseUrl}/api/world/summary`,
      manifestUrl: `${this.universeConfig.publicBaseUrl}/api/universe/manifest`,
      supportedStandards: [
        "elo-open-world.plugin.v1",
        "elo-open-world.healthcheck.v1",
        "elo-open-world.project.v1",
        "openworld.universe.v1"
      ]
    };
  }

  summary() {
    return {
      world: {
        name: "ELO Open World",
        generatedAt: Date.now(),
        universe: this.manifest(),
        infrastructure: {
          core: [
            "Identity Layer",
            "Protocol Standards",
            "Plugin Extensions",
            "Project Protocol",
            "Web UI",
            "OpenClaw Onboarding Assistant"
          ],
          requirementCount: this.requirements.list().length,
          projects: this.projects.list().map((project) => ({
            projectId: project.projectId,
            title: project.title,
            repoName: project.repoName,
            state: project.state,
            tags: project.tags || [],
            rating: project.rating || 0,
            heat: project.heat || 0
          }))
        }
      },
      identity: this.identity.summary(),
      plugins: this.plugins.list(),
      requirements: this.requirements.list(),
      projects: this.projects.list()
    };
  }
}
