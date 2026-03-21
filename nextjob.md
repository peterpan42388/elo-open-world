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
Move to `P0 World Completion`, specifically:
1. keep `Project First` as the default world preset while tightening cluster declutter for larger graphs
2. continue polishing drawer and focus-mode transitions without reintroducing heavy overlay work
3. keep `World Insights` and loader fallback aligned with the real graph state so production never fails silently

## Update Protocol
After every execution cycle, update this file with:
- `Last Completed`
- `Current Focus`
- `Next Recommended Action`
- any new blockers

## Last Completed
- Added `Focused / Balanced` declutter modes to `World`, tightened project-first visibility so low-signal background projects and nonessential human/agent relations back off by default, strengthened selected-node halo affordance, and increased camera drift amplitude without returning to per-node animation
- Completed the `World` graph-only surface by removing the bottom `World Chat Interface` placeholder, replacing it with a `World Insights` panel, adding `Project First / Expanded Hierarchy` presets, introducing cluster lens shortcuts, and adding a user-visible graph-engine retry fallback instead of allowing silent blank-canvas failures
- Strengthened `World` selection readability on top of the camera-drift baseline by adding explicit `Selection / Relation / Cluster` focus modes, a tighter selected-node halo pulse, cluster-fit camera behavior, and slightly stronger scene drift so the graph feels more alive without going back to per-node animation
- Reworked `World` around a performance-first rendering model by removing full-scene custom node and edge overlay from the idle path, replacing per-node floating motion with bounded camera drift, restoring Sigma as the default node and curved-edge renderer, and demoting `Human / Agent` to interaction-time hierarchy so the graph keeps a continuous spatial feel without dragging frame rate down
- Rebalanced `World` toward a higher-performance rendering path by disabling the continuous floating motion loop, returning baseline node and edge visibility to Sigma, and reducing the custom overlay to interaction-focused hierarchy highlights instead of redrawing every node and edge every frame
- Reworked `World` node and edge rendering around the actual `World -> Project -> Human -> Agent` hierarchy by introducing explicit human/agent nodes, overlay-rendered typed shapes, much lighter default edge visibility, stronger endpoint-weighted tapered curves, tighter synthetic membership/plugin density, and a closer default camera so `Visual Lab` reads more like an ecosystem map than a code-call graph
- Re-tuned `World` Phase 2A around the actual `World -> Project -> Human -> Agent` hierarchy by reducing synthetic cross-links, moving clustered mock projects into a more natural center-out scatter, adding subtle per-project floating motion for stronger depth, and clamping camera movement so the graph cannot be dragged completely out of view
- Upgraded `World` to a stronger Phase 2A graph explorer by aligning the frontend to official `Sigma.js + Graphology` curved-edge rendering, adding a 2.5D depth model for nodes and camera focus, rebuilding `Visual Lab` into a more natural ecosystem-cluster dataset, and tightening scene styling plus drawer motion for a less flat explorer surface
- Added a dedicated `World Visual Lab` data surface with `Live / Hybrid / Visual Lab` modes, synthetic project clusters, and visual-only mock nodes so the graph can be stress-tested against 20+ nodes without waiting on real project volume
- Borrowed higher-value GitNexus Web UI patterns into `World` without importing its React/Vite shell: the graph now has a lighter legend, top-center hover/selection status pill, floating explorer dock, stronger graph-field backdrop, and easier focus-on-selection behavior while staying on the current `Sigma.js + Graphology` stack
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
- P0 World Completion: tune larger-graph readability, scene motion, and focus affordances so `World` feels finished under both live and visual-lab data

## Next Recommended Action
- validate the new declutter and drift settings against production visual-lab density, then do a final pass on cluster grouping and drawer polish so larger graphs stay readable without losing motion

## Blockers
- local runtime still has no seeded project data, so representative graph validation continues to depend on the deployed environment
