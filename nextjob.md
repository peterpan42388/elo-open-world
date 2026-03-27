# EOW Next Job

## Scope
This file is the active execution queue for `ELO Open World`.
Working repo:
- `/Users/leo/Menu/py_workspace/elo-open-world`

Current active branch:
- `codex/open-world-onboarding-init`

Production:
- `https://world.metavie.co`

## Current Product Direction
The corrected product structure is now:
1. `Home`: guided entry only
2. `World`: project graph only
3. `Build`: project directory only
4. `New Project`: focused creation flow only
5. `Project Workspace`: project-specific collaboration with agent bridge
6. `Settings`: private account, agents, private project entry
7. `Market`: operating project discovery
8. `Docs`: public protocols and guides

Do not collapse these responsibilities back together.

## Execution Rules
1. Always work on the highest-priority unblocked item.
2. Keep visual and interaction changes compatible with `docs/UI_FOUNDATION_RULES.md`.
3. After each implementation step:
   - run local checks
   - update this file
   - if changes are ready, commit them on `codex/open-world-onboarding-init`
4. If web behavior changes, prefer deploying after tests pass.
5. Do not reintroduce mixed browse/create/edit responsibilities.

## Current Priorities

### P0: Visual Consolidation
Goal: finish the corrected dark UI so all main pages share one consistent design system.

Tasks:
- Tighten `New Project` into a focused creation layout with stronger visual grouping.
- Tighten `Project Workspace` into a clear two-column collaboration layout.
- Tighten `Build` directory cards so density, spacing, and boundaries are uniform.
- Audit `World`, `Settings`, `Market`, and `Docs` for any remaining light-surface or overflow regressions.

Completion standard:
- all main routes visibly follow the dark theme
- no long ids or JSON blocks overflow
- no dense mixed panels without boundaries
- page responsibilities remain clear

### P1: Project Workspace Maturation
Goal: make the project page the real collaboration center.

Tasks:
- Move remaining membership workflow actions into `Project Workspace`.
- Add persistent project conversation history instead of transient local thread state.
- Clarify progress/stage sidebar blocks.
- Make agent conversation visually first-class for `elo-agent-web-plugin`.

Completion standard:
- a user can open one project page and understand stage, progress, members, and agent collaboration without going back to settings

### P2: Build Directory Hardening
Goal: keep `Build` as a world-facing discovery directory.

Tasks:
- Make directory cards cleaner and more readable.
- Add a clearer recruiting signal.
- Keep participation request flow separate from edit flow.
- Ensure no heavy edit controls remain in the directory surface.

Completion standard:
- `Build` looks like a searchable project index, not a project admin panel

### P3: Foundation Project UI Alignment
Goal: keep `elo-agent-onboarder` and `elo-agent-web-plugin` aligned as operating foundation projects.

Tasks:
- Keep foundation run history visible in `World`, `Build`, and project cards.
- Ensure operator panels follow the same dark layout rules.
- Continue improving artifact readability and delivery UX where needed.

## Recommended Next Action
Move to `EOW Production Refactor - Phase 2`:
1. complete path-route migration copy and interaction parity for `/build`, `/market`, `/docs`, `/world`
2. finish full-route i18n text binding in `en/zh/es/ja` for the main route headers, navigation, and high-frequency actions
3. continue de-card visual cleanup in Settings/Build/Market so each route keeps one-screen focus instead of stacked dense sections
4. keep legacy hash redirects active until external links are migrated

## Update Protocol
After every execution cycle, update this file with:
- `Last Completed`
- `Current Focus`
- `Next Recommended Action`
- any new blockers

## Last Completed
- Completed `EOW elo炫酷风 v2` polish pass (spacing + softer boundaries + nav/world copy cleanup):
  - restored horizontal gutter and centered alignment rhythm across route sections in `web/app.css`
  - reduced visual boundary intensity by lowering default line contrast and nested border emphasis
  - removed duplicate left-nav `Get OpenClaw` entry from `web/index.html` (right-side install CTA remains)
  - replaced `worldLede` messaging in `en/zh/es/ja` to remove the sentence about registration-form mixing while keeping project-graph focus
  - aligned `/onboarder` spacing and boundary weight with the same softened style language in `web/onboarder.css`
  - validation passed: `node --check web/app.js`, `node --check web/onboarder.js`, `npm test`
- Completed `EOW elo炫酷风 v2` global shell baseline rollout (de-card visual migration):
  - enabled global theme entry on main surfaces:
    - `web/index.html` body now uses `elo-cool-v2`
    - `web/onboarder.html` body now uses `elo-cool-v2 onboarder-v2`
    - `web/human-auth.html` and `web/oauth-consent.html` now inherit `elo-cool-v2`
  - added global v2 de-card style layer in `web/app.css`:
    - de-emphasized legacy panel/card shell into section bands
    - refreshed topbar/button/input palette to unified neon-dark gradient language
    - moved Build/Market/Docs/Settings list surfaces toward row-band composition
  - rebuilt standalone `/onboarder` visual shell in `web/onboarder.css`:
    - full-screen hero + section-band rhythm
    - reduced glass-card wall styling in favor of line-based section hierarchy
    - kept existing CTA behaviors and package rendering contracts unchanged
  - local validation passed:
    - `node --check web/app.js`
    - `node --check web/onboarder.js`
    - `npm test` (43/43 passing)
- Completed `EOW Phase 2.1` dynamic detail-layer i18n pass:
  - added dynamic i18n namespace layer in `web/app.js` for Build/Market/Settings/Workspace/World drawer copy
  - upgraded `appT()` to support parameter interpolation and missing-key aggregation logs
  - replaced hardcoded dynamic detail strings in primary render paths:
    - `renderProjects`
    - `renderMarketProjects`
    - `workspaceCollaborationState`
    - `renderWorkspaceBridgeGuide`
    - `renderWorkspaceCommandDeck`
    - `renderWorkspaceConversationThread`
    - `renderProjectProgressPanel`
    - `renderProjectWorkspaceMembership`
    - `renderProjectWorkspace`
    - world drawer renderers (`project/universe/human/agent`)
  - normalized several dynamic `setStatus(...)` messages to keyed form with interpolation
  - added dynamic-copy leakage guard script:
    - `scripts/check-dynamic-i18n.js`
    - npm script: `npm run check:i18n-dynamic`
- Completed `EOW Production Refactor - Phase 2` and deployed to production:
  - rebuilt `Build / Market / Docs / Settings` route shells toward `elo炫酷风 v2` focus layout (de-card page skeleton with utility rail + content band)
  - upgraded settings sidebar to path-based section links (`/settings/:section`) while preserving route-driven section visibility
  - added app-level `data-i18n` binding support in `web/app.js` (text + placeholder + title attributes)
  - expanded app dictionary for Build/Market/Docs/Settings filtering and docs reference copy across `en/zh/es/ja`
  - localized standalone auth surfaces:
    - `web/human-auth.html`
    - `web/oauth-consent.html`
    with locale switch, persisted language memory, and query-param aware redirects
  - local checks passed (`node --check`, `npm test`) and production container returned healthy after rebuild
- Completed `EOW Production Refactor - Phase 1` and deployed to production:
  - implemented path-first route core in `web/app.js` with legacy hash migration (`/#settings` -> `/settings/profile`, `/#world` -> `/world`, etc.)
  - updated server route handling in `src/server/apiServer.js` so deep-link refresh works for `/settings/:section`, `/world`, `/build`, `/market`, `/docs`
  - fixed settings stacked rendering by route-driven section visibility (single section visible at a time)
  - added global locale foundation (`en/zh/es/ja`) with topbar language switch and persisted locale resolution (`?lang` > localStorage > browser > en)
  - added initial `elo炫酷风 v2` shell primitives in `web/app.css` and applied `app-shell`/`page-hero` baseline
  - pushed commit `d709ead` to `codex/open-world-onboarding-init`, deployed on `world.metavie.co`, and verified container health + route/API smoke checks
- Implemented onboarder launch-entry restructuring baseline:
  - added dedicated `/onboarder` public entry (non-hash route mapped to SPA shell)
  - added Home + topbar public CTA to Onboarder, and switched Quick Start step 2 from Settings to installer flow
  - added public offer APIs:
    - `GET /api/onboarder/public-offer`
    - `GET /api/onboarder/billing-readiness`
  - switched installer download to public access (no sign-in required) so non-logged users can start with GUI installer
  - upgraded Stripe package price resolution to new-key-first with legacy-key fallback and added runtime billing readiness introspection
  - changed default checkout return URLs from `#settings` to `/onboarder?...`
  - marked Settings onboarder commerce panel as operator/internal path with billing-readiness gating message
- Fixed private GitHub release artifact retrieval reliability for `elo-agent-dashboard` distribution:
  - updated dashboard deploy service to prefer GitHub API asset URL (`asset.url`) and fallback to `browser_download_url`
  - improved binary fetch header handling across API and redirect URLs
  - deployed commit `08dbbab` to production container and verified health
  - smoke-verified signed-pull chain on production:
    - `GET /api/onboarder/dashboard/config` => 200
    - `POST /api/onboarder/dashboard/deploy-ticket` => 200
    - `GET /api/onboarder/dashboard/artifact?ticket=...` => 200 (zip bytes returned with version/sha headers)
- Completed `elo-agent-dashboard` independent rollout baseline and signed-pull deployment integration:
  - created independent private repo `github.com/peterpan42388/elo-agent-dashboard` with local-only web dashboard baseline (`api-keys.local.v1`, `usage-event.v1`, `pricing-table.v1`) and release builder (`elo-agent-dashboard-bundle.zip` + manifest)
  - published `stable` private release assets for server-side artifact relay
  - added EOW dashboard deploy service + authenticated APIs:
    - `GET /api/onboarder/dashboard/config`
    - `POST /api/onboarder/dashboard/deploy-ticket`
    - `GET /api/onboarder/dashboard/artifact`
    - `GET /api/onboarder/dashboard/guide`
  - wired installer install flow with new `Deploy Dashboard` stage:
    - requests one-time deploy ticket
    - downloads signed artifact through EOW
    - extracts to local `elo-{agent}/dashboard`
    - creates local dashboard shortcut launcher
  - enhanced install-success chat notification with package capability summary and missing advanced key checklist that points users to local dashboard config
  - upgraded package capability descriptors to include dashboard/local-key/usage-meter semantics across starter/work/vision/builder
- Completed final pre-freeze installer closure patch:
  - restructured Step6 Telegram binding layout to fixed 3-line structure (`平台/提示`, `Bot Token/Chat ID`, `自动检测 chat_id`) and isolated `测试聊天配置` in a non-overlapping action row
  - stabilized Step6 split pane sizing so platform switching no longer causes form/button overlap
  - added Step9 gateway auto-authorization stage in install flow:
    - auto-runs local gateway-token resolution
    - writes token into `config/openclaw.json` as `gateway.auth.token` (+ compatibility mirror)
    - opens tokenized dashboard URL without exposing command-line prompts to end users
  - replaced previous CLI-style token hint with plain user-facing retry guidance
  - installer enters freeze state after this closure (bugfix/compatibility only)
- Finalized installer stabilization pass and freeze prep:
  - fixed hero visual quality issues (rounded logo rendering, transparent hero labels, no dark label block bleed)
  - rebuilt Step4 (`Agent`) into left-aligned label + full-width personality editor layout
  - rebuilt Step6 (`Chat`) into stable left-right split with non-overlapping test button and larger guide panel
  - added local gateway-token resolution chain for OpenClaw dashboard open action:
    - `openclaw config get gateway.auth.token` first
    - local config-file fallback second
    - auto-open tokenized dashboard URL when available
    - missing-token one-click copy guidance when unavailable
  - marked installer as feature-frozen after this UI + connectivity closure batch (bugfix-only forward)
- Implemented Phase-A/Phase-B appconfig consolidation and Phase-C bridge groundwork:
  - added authenticated alias endpoint `GET /elo-agent-onboarder/appconfig` as installer primary config source
  - upgraded `onboarderInstallerService` to merge runtime static config (`runtime/onboarder-installer-appconfig.json`) with catalog/models/chat metadata and expose platform status (`ready/testing/planned`)
  - switched installer config loading order to `appconfig -> legacy fallback`, and enforced status-aware chat platform behavior (`planned` blocked, `testing` hinted)
  - added Telegram bridge worker mode (`--telegram-bridge`) with long-poll receive/reply loop, health file updates, and log output
  - wired install completion page with bridge status refresh, restart, and log-open actions
  - rebuilt latest macOS installer artifact: `installer/dist/macos/ELO-Agent-Onboarder-Installer.app.zip`
- Added installer dynamic-config architecture to reduce repackaging churn:
  - introduced `GET /api/onboarder/installer/config` to return a single versioned payload with package catalog, package include descriptions, profile pros/cons notes, chat platform metadata, and model catalog
  - wired installer UI to load and apply server config after OAuth authorization, including package/profile selectors and chat platform labels/hints/guides
  - kept local fallback behavior so installer remains functional if config endpoint is unavailable
  - added installer-side version visibility (`installer_version.json`) and exposed config version in-app for testing traceability
  - added regression test coverage for installer config contract
- Continued installer UI/multilingual execution batch:
  - replaced installer icon chain with the new provided logo (`icon.png` + regenerated `icon.icns` and `icon.ico`)
  - strengthened multilingual support with startup language picker + language menu restart flow and expanded localized labels for core onboarding fields
  - completed Step 3 layout pass with wider package/environment selectors and localized dual detail panels (package includes + profile pros/cons)
  - completed Step 5 layout pass with larger controls, wider left form area, localized field labels, and localized model recommendation/detail text
  - completed Step 6 layout pass with localized chat binding labels, enlarged split layout, right-side setup guide panel, and platform-specific multilingual hints for Telegram/Feishu/Discord/DingTalk
  - rebuilt macOS installer artifact after these updates (`installer/dist/macos/ELO-Agent-Onboarder-Installer.app.zip`)
- Completed consumer-grade installer remediation for `elo-agent-onboarder`:
  - redesigned installer visual system with branded dark card layout, step indicator, and simplified copy for non-technical users
  - hid technical OAuth/base URL fields behind advanced settings and kept login page action-focused (`登录到 EOW / 去注册 / 检查授权`)
  - expanded model center to multi-brand catalog + recommendation panel with provider site jump and optional custom model mode
  - upgraded chat binding to dynamic platform forms (Telegram / Feishu / Discord / DingTalk), with Telegram chat_id auto-detect and pre-install test-send support
  - added payment auto-return support using loopback callback URLs and automatic payment status polling/confirmation while retaining manual check buttons
  - rebuilt install stage UX with progress bar, stage timeline, install logs, completion summary, and post-install notification attempt
- Added backend installer support contracts:
  - `GET /api/onboarder/installer/models`
  - `POST /api/onboarder/installer/chat/validate`
  - installer checkout now accepts optional `successUrl/cancelUrl` passthrough for app callback return
- Redesigned installer icon assets to a new “lobster + workstation” identity and regenerated `icon_master.svg`, `icon.png`, `icon.ico`, `icon.icns`.
- Implemented installer product UX uplift: added branded icon asset pack (purple + red lobster), removed manual Session Human ID entry from installer, introduced browser-based installer auth session flow with auto-bind and polling, and wired EOW web auth pages to bind installer auth sessions after local/GitHub login.
- Stabilized macOS installer packaging by moving build validation to Python 3.12 and adding ad-hoc codesign verification in the builder flow; replaced server-side macOS installer artifact with the newly signed `.app.zip` output.
- Upgraded installer delivery toward end-user executable format by adding cross-platform build tooling (`installer/build_installer.py`) to produce macOS `.dmg/.app.zip` and Windows `.exe/.zip`, and updated `/api/onboarder/installer/download` to serve executable artifacts first when present instead of always returning source (`.py + .sh`) bundles.
- Implemented installer-first onboarder direction with payment-gated install execution:
  - added installer session APIs (`session/start`, `session/update`, `payment/*`, `plan`, `script`, `complete`, `register`)
  - enforced payment before installer plan/script generation
  - added server-side installer session persistence and provisioning-agent flow for users without pre-existing agents
  - shipped Python GUI installer prototype (`PySide6`) covering the guided flow from login to payment, install execution, and register-to-EOW
- Completed Stripe deployment readiness for `elo-agent-onboarder` commerce:
  - added production env template and protected `deploy/.env.production` from git tracking
  - created/reused Stripe prices for all three package tiers
  - wired production billing env and verified live checkout session creation smoke (`cs_live_*` with valid hosted checkout URL)
- Recovered the interrupted `elo-agent-onboarder` paid onboarding implementation path by wiring package catalog, Stripe billing abstraction, purchase + entitlement persistence, authenticated onboarder commerce APIs, and Settings-side commerce UI integration in the current branch state
- Added regression coverage for package-aware onboarding and commerce flow:
  - enforced workflow preset requirement for `workflow-pack`
  - verified `local-only` output includes deferred registration assets
  - verified paid checkout confirmation creates entitlement and gates artifact delivery by owner
- Added runtime dependency for Stripe SDK in `elo-open-world` so production checkout/webhook paths can execute with configured secrets
- Tightened `World` drawer density by collapsing repeated focus and cluster signals into a compact top summary, switching relationship summaries from long raw lists to count-plus-preview notes, trimming cluster sibling lists, and reducing foundation-run verbosity so the inspector reads as a precise instrument panel instead of a stacked dump
- Calibrated `World` for the real production seed case by biasing hybrid signal scoring toward live projects, surfacing a `Seeded Baseline` insight card, and making real operating foundation repos dominate hybrid ordering, sizing, depth, and label priority instead of being visually overtaken by hotter synthetic mock nodes
- Extended `World` drawer grouping so project and universe inspectors now expose cluster context, cluster sibling navigation, and direct cluster-focus actions, turning cluster grouping into an actual drill-in workflow instead of a legend-only control
- Added `Focused / Balanced` declutter modes to `World`, tightened project-first visibility so low-signal background projects and nonessential human/agent relations back off by default, strengthened selected-node halo affordance, and increased camera drift amplitude without returning to per-node animation
- Completed the `World` graph-only surface by removing the bottom `World Chat Interface` placeholder, replacing it with a `World Insights` panel, adding `Project First / Expanded Hierarchy` presets, introducing cluster lens shortcuts, and adding a user-visible graph-engine retry fallback instead of allowing silent blank-canvas failures
- Strengthened `World` selection readability on top of the camera-drift baseline by adding explicit `Selection / Relation / Cluster` focus modes, a tighter selected-node halo pulse, cluster-fit camera behavior, and slightly stronger scene drift so the graph feels more alive without going back to per-node animation
- Reworked `World` around a performance-first rendering model by removing full-scene custom node and edge overlay from the idle path, replacing per-node floating motion with bounded camera drift, restoring Sigma as the default node and curved-edge renderer, and demoting `Human / Agent` to interaction-time hierarchy so the graph keeps a continuous spatial feel without dragging frame rate down
- Rebalanced `World` toward a higher-performance rendering path by disabling the continuous floating motion loop, returning baseline node and edge visibility to Sigma, and reducing the custom overlay to interaction-focused hierarchy highlights instead of redrawing every node and edge every frame
- Reworked `World` node and edge rendering around the actual `World -> Project -> Human -> Agent` hierarchy by introducing explicit human/agent nodes, overlay-rendered typed shapes, much lighter default edge visibility, stronger endpoint-weighted tapered curves, tighter synthetic membership/plugin density, and a closer default camera so `Visual Lab` reads more like an ecosystem map than a code-call graph
- Re-tuned `World` Phase 2A around the actual `World -> Project -> Human -> Agent` hierarchy by reducing synthetic cross-links, moving clustered mock projects into a more natural center-out scatter, adding subtle per-project floating motion for stronger depth, and clamping camera movement so the graph cannot be dragged completely out of view
- Upgraded `World` to a stronger Phase 2A graph explorer by aligning the frontend to official `Sigma.js + Graphology` curved-edge rendering, adding a 2.5D depth model for nodes and camera focus, rebuilding `Visual Lab` into a more natural ecosystem-cluster dataset, and tightening scene styling plus drawer motion for a less flat explorer surface
- Added a dedicated `World Visual Lab` data surface with `Live / Hybrid / Visual Lab` modes, synthetic project clusters, and visual-only mock nodes so the graph can be stress-tested against 20+ nodes without waiting on real project volume
- Refined `World` into its own graph-explorer surface with a lighter legend, top-center hover/selection status pill, floating explorer dock, stronger graph-field backdrop, and easier focus-on-selection behavior while staying on the current `Sigma.js + Graphology` stack
- Added `World Phase 2` controls with relation-filter pills, quick project selection chips, and stronger always-on labeling for high-signal or foundation projects so the graph stays legible without relying entirely on small-node clicks
- Completed `World` engine migration phase 1 by replacing the old DOM project card tree with a `Sigma.js + Graphology` graph explorer, adding a right-side slide-over drawer, and keeping the existing project semantics while rendering real graph edges for universe, owner, agent, plugin, and foundation relations
- Hardened the `World` migration with static asset delivery fixes by serving `/lib/*` correctly, disabling static asset caching after deploys, and correcting graph construction bugs around ring indexing and multi-relation project pairs
- Recentered the `World` layout so the graph now reads like a dark graph explorer instead of a dashboard card tree, with graph controls, a real canvas, and drawer-driven detail presentation
- Hardened `Build` and `Market` expanded external-surface actions so partially configured repo/service states no longer silently drop one surface: the shared link classifier now keeps sanitized links, shows per-surface fallback notes inside the bounded action area, and adds regression coverage for mixed valid/invalid external-link states
- Tightened `Build` and `Market` directory CTA hierarchy by making the primary action consistently route-explicit as `Open Project Workspace` and moving `Build` participation state into bounded supporting copy, so quick-scan cards stop presenting status text as the main action while keeping all collaboration entry pointed at `Project Workspace`
- Tightened `Build` and `Market` expanded directory context by replacing the remaining free-floating operating, recruiting, pricing, and usage paragraphs with bounded nested note blocks, so expanded cards keep the dark card hierarchy and scan cleanly without mixing long context copy into unbounded text walls
- Tightened `Build` directory recruiting scanability by making the collapsed recruiting signal distinguish paused intake, pending request load, first-member demand, solo-builder growth, and broader open intake, and added regression coverage for the shared recruiting-state helper so quick-scan copy stays stable without reintroducing collaboration controls into the directory surface
- Hardened `Build` and `Market` directory external surfaces by sanitizing repo/service links before rendering, adding bounded fallback notes when links are missing or invalid, and loosening status-pill plus action-row wrapping so long live labels do not force overflow on dark directory cards
- Hardened `Build` and `Market` collapsed repo/service identity rows on narrow cards by removing the CSS end-ellipsis from pre-compacted labels and allowing bounded two-line wrap, so the prefix-plus-tail quick-scan values keep their distinguishing tail visible with live deployed foundation-project data
- Hardened `Build` and `Market` collapsed repo/service identity rows against real deployed project data by changing compact labels from tail-truncation to bounded prefix-plus-tail compaction, so long repo names and service endpoints stay distinguishable without expanding card height
- Tightened `Build` and `Market` collapsed directory identity rows by shortening repo and service labels into bounded quick-scan values with full tooltips while preserving full identifiers in expanded detail blocks, reducing live foundation-card height without reintroducing edit controls to the directory surface
- Tightened `Build` and `Market` collapsed directory cards by removing duplicated entry/recruiting meta tiles, keeping pending participation requests visible only when demand actually exists, and preserving `Project Workspace` as the sole collaboration entry path while reducing quick-scan card height
- Tightened `Build` and `Market` collapsed directory cards for quick scan density by clamping long tag and latest-delivery labels, shortening duplicate recruiting copy, and keeping signal/meta blocks in two columns on mobile until very narrow widths so collapsed cards stay shorter without weakening `Project Workspace` entry
- Tightened `Build` and `Market` collapsed directory cards around real foundation-project data by reducing summary/signal density, shrinking visible tag rows to two items, converting latest activity into a compact delivery line, and keeping recruiting plus `Project Workspace` entry visually primary without adding edit controls to the directory surface
- Tightened `Build` and `Market` collapsed directory cards by capping long summary/signal copy, giving latest-run metadata a clearer compact block, and limiting visible tag rows so quick-scan height stays bounded without weakening `Project Workspace` as the collaboration entry
- Tightened `Build` and `Market` collapsed directory cards around quick scan density by removing duplicate status badges, turning latest run metadata into compact dated delivery blocks, and truncating long market access/usage notes so real production cards stay readable without weakening `Project Workspace` as the collaboration entry
- Tightened `Build` and `Market` directory card scanability by shortening collapsed operating/recruiting/entry headlines and restructuring directory action groups into clearer desktop split + tablet/mobile stacked CTA layouts, so `Project Workspace` stays visually primary while repo/service links stop crowding narrow widths
- Hardened `Build` directory card rendering so project titles, summaries, tags, repo/service identifiers, activity text, and badge labels are escaped before entering the DOM, aligning the source directory renderer with the safer `Market` card behavior and preventing malformed project data from breaking the bounded card layout
- Hardened `Build` and `Market` expanded directory actions with bounded primary/secondary action groups, clearer workspace-first entry copy, and safer wrapping for status pills so collaboration entry stays visually primary while external repo/service links stay separate
- Tightened `Build` and `Market` mobile CTA scanability by turning expanded card actions into one primary `Project Workspace` entry plus wrapped secondary link buttons, shortening the action labels, and making the action stack full-width on narrow screens so tablet/mobile cards stay readable without reintroducing edit controls
- Hardened `Market` operating cards to match the dark directory system by moving long repo/service values into bounded identity rows, adding clearer operating/access/usage signal blocks, widening long source and endpoint details in the expanded view, and separating `Open Service` from `Open Project Workspace`
- Tightened `Build` directory card scanability by shortening collapsed operating/recruiting/workspace copy, promoting recruiting state into its own compact summary block, and collapsing duplicate route buttons into one route-aware `Project Workspace` entry action
- Tightened `Build` directory cards around workspace entry and recruiting demand by renaming participation guidance to explicit `Project Workspace` entry, surfacing open participation requests on the collapsed card, combining rating/heat into a single directory signal, and removing repeated low-priority metadata from the expanded view
- Hardened `Build` directory cards for narrow widths and long repo/service values by separating card identity into bounded repo/service blocks, stacking dense metadata on small screens, and making long GitHub/service fields render as full-width wrapped detail rows
- Tightened `Build` directory cards around operating and recruiting scanability by surfacing operating state, participation entry path, latest activity, and current run signals earlier while keeping collaboration entry pointed at `Project Workspace`
- Elevated `Project Workspace` collaboration into a first-position command deck with stronger bridge readiness, working-agent focus, recent exchange emphasis, and UI gating so only project participants with member agents can task through the workspace form
- Added full dark foundation theme and UI rules
- Replaced `settings-guest` behavior with an access-state panel
- Hid access prompt for GitHub-only logins and showed verification prompt only for local unverified accounts
- Added `nextjob.md` execution queue and documented the 10-minute local automation loop
- Reworked `New Project` into a dedicated creation shell with a focused rail, clearer stage boundaries, route-correct creation copy, and live readiness gating for sign-in, agents, and GitHub link state
- Reworked `Project Workspace` into a clearer collaboration shell with grouped sidebar blocks, workspace summary, and stronger agent conversation hierarchy
- Normalized `Build` directory cards with stronger header hierarchy, recruiting signal, directory snapshot blocks, and lower-noise project actions
- Audited `World`, `Settings`, `Market`, and `Docs` for dark-theme regressions and aligned their card density, detail blocks, and page-level boundaries with the shared dark foundation rules
- Moved membership workflow controls into `Project Workspace`, reduced `My Projects` to visibility plus workspace entry, and added project-scoped participation request handling on the workspace page
- Switched `Project Workspace` conversation from browser-only state to persisted project workspace conversation stored through the project API, and added a progress/delivery panel so collaboration state survives refresh and stays attached to the project record
- Routed `Build` participation actions into `Project Workspace`, kept participation requests on the project page, and added project-level regression coverage for request/resolve flow so directory browsing stays separate from collaboration
- Added stronger browser bridge guidance and long-thread presentation inside `Project Workspace`, so agent collaboration now has clearer next steps, bridge context, and a split between earlier context and recent exchanges
- Tightened `Project Workspace` progress presentation with a stage track and cleaner delivery signals, and reduced remaining cross-page collaboration language in `Build` and `Settings` so the project page is more clearly the single collaboration surface
- Continued removing cross-page collaboration ownership by renaming external entry points to `Open Project`, clarifying `Build` and `Settings` language, and strengthening the project-page sidebar with owner, requirement, and primary-agent context
- Strengthened the project page as a single operating surface by aligning sidebar and summary language around project mode, active agent, owner, requirement, and delivery state
- Reworked the `Project Workspace` snapshot around ownership, participation, recruiting, latest activity, and operating inputs so the page reads less like a directory card and more like the active project control surface

## Current Focus
- `World` remains frozen.
- `Installer` remains frozen (bugfix/compatibility only).
- Active web focus: finish remaining dynamic detail copy keyization in `renderSettingsData` long-tail sections (agents/projects/foundations) and complete true locale text for newly added dynamic keys.

## Next Recommended Action
1. Complete Phase 2.1 follow-through:
   - migrate remaining hardcoded dynamic copy in Settings long-tail detail blocks to `appT(key)`
   - replace temporary EN-clone locale fallback for `APP_DYNAMIC_I18N` with real `zh/es/ja` copy
2. Run:
   - `node --check web/app.js`
   - `npm run check:i18n-dynamic`
   - `npm test`
3. Deploy and smoke test:
   - `/build`, `/market`, `/settings/projects`, `/project`, `/world`
   - locale switch `en/zh/es/ja`

## Blockers
- None for local implementation.
