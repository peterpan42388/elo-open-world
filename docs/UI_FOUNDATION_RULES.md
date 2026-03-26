# UI Foundation Rules

## Purpose
This document defines the baseline UI framework for ELO Open World and any project that plugs into it. The goal is to prevent common presentation failures:

- overlapping panels
- crowded typography
- missing boundaries between sections
- uncontrolled form growth
- broken long-string rendering
- pages mixing incompatible responsibilities

## Visual Direction
- Use the shared dark theme tokens from `web/app.css`.
- New UI must use tokenized colors, spacing, radius, and shadows.
- Panels, cards, and sidebars must always render on bounded surfaces with visible borders.
- Avoid raw white surfaces and flat full-screen sections.

## ELO 炫酷风 (Elo Cool Style)
- Name: `elo炫酷风` (CSS namespace: `.elo-cool`).
- Purpose: high-conversion product marketing surfaces such as `/onboarder`.
- Token rule:
  - Use namespaced style tokens only (`--cool-*`) under `.elo-cool`.
  - Do not override global `:root` tokens from inside `.elo-cool`.
- Primitive set:
  - `onb-glass-card`
  - `onb-btn` (`primary`, `soft`, `ghost`)
  - `onb-badge`
  - section headers + grid cards + FAQ panels
- Boundary rule:
  - Enable route-level first (example: `/onboarder` root container).
  - Do not apply `.elo-cool` to the whole app until each route is validated.
- Interaction rule:
  - CTA behavior must be deterministic and consistent.
  - For onboarding pages, guidance CTAs can scroll to a single download anchor.

## Layout Rules
- Every flex/grid child that can shrink must include `min-width: 0`.
- Primary page shells must separate navigation from content:
  - directory pages use list/grid layouts
  - workspace pages use sidebar + content layouts
  - creation pages use focused single-flow layouts
- Action rows must wrap.
- Long content blocks must allow `overflow-wrap: anywhere`.
- Forms must stay within readable widths. Do not let a single form become the page layout.

## Page Responsibility Rules
- `Home`: explanation and guided entry only.
- `World`: graph and world-level visibility only.
- `Build`: project directory only. No heavy edit panels.
- `New Project`: project creation only.
- `Project Workspace`: project-specific collaboration and progress.
- `Settings`: private account, agents, private project entry points.
- `Market`: operating project discovery and usage entry.
- `Docs`: public documentation and protocol references.

Do not mix these responsibilities back together.

## Card And Boundary Rules
- Every logical block must live inside a bordered panel or card.
- Nested content must step down one surface level only:
  - panel -> card
  - card -> nested item
- Avoid visually unbounded stacks of inputs.
- Use code blocks for:
  - fingerprints
  - ids
  - payloads
  - JSON
  - logs

## Typography Rules
- Use the shared sans and mono tokens.
- Long identifiers must render in monospace blocks or wrapped detail rows.
- Do not place large text and dense metadata inside the same visual line unless it wraps cleanly.
- Explanatory copy should stay short and directional.

## Form Rules
- Forms must have a clear single purpose.
- Multi-step flows should move into dedicated routes instead of growing inside settings panels.
- Directory pages must not own destructive or complex editing forms.
- Project creation flows belong in `New Project`.
- Agent collaboration belongs in `Project Workspace`.

## Foundation Project Rules
- Foundation projects must expose their operational UI through bounded operator panels.
- Generated artifacts must support:
  - copy
  - JSON download
  - bundle download
  - ZIP download
- Foundation runs must be visible in:
  - the operator itself
  - project directory cards
  - project workspace
  - world graph selected project details

## Compatibility Rules For New Projects
Any new project integrated into EOW should follow this minimum structure:

1. Shared tokenized theme support
2. Clear route ownership
3. Bounded panels and cards
4. Wrapped action rows
5. Safe rendering for long ids and payloads
6. History visibility for operational runs
7. No mixed browse/create/edit responsibilities on one page

## Enforcement Guidance
Before shipping a UI change, check:

1. Does every section have a visible boundary?
2. Can long ids, repo names, prompts, and JSON render without overflow?
3. Does the page have one clear responsibility?
4. Do controls wrap correctly on tablet and mobile widths?
5. Is there a lower-surface nested layer instead of free-floating content?
6. Is the route the right place for this interaction?

If the answer to any of these is no, the UI is not ready.
