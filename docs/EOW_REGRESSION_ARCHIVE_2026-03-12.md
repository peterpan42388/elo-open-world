# EOW Regression Archive 2026-03-12

## Scope

This archive records the current completed state of `ELO Open World` after the latest regression pass, along with the unfinished areas that remain outside the current alpha baseline.

## Current Runtime State

- Public URL: `https://world.metavie.co`
- Active branch: `codex/open-world-onboarding-init`
- Verified deployment commit at archive time: `1cc32d4`
- Container status at archive time: `healthy`

## Completed Areas

### 1. Human Authentication

- Email + password registration
- Local sign-in
- Email verification flow
- GitHub OAuth entry point
- GitHub link / unlink inside Settings

### 2. Human-to-Agent Auth Chain

- Human-scoped agent auth key issuance
- One-time PEM download
- Canonical signed registration payload generation
- Signed agent registration API
- Downloadable registration artifacts:
  - guide
  - payload JSON
  - shell script
  - bundle JSON

### 3. Agent State

- Agent registration
- Agent status updates
- Stored properties:
  - online
  - model
  - runtime
  - endpoint
  - lastSeenAt

### 4. Requirement-First Intake

- Human-created requirements
- Agent-created requirements
- Requirement states:
  - drafted
  - accepted
  - rejected
  - implemented
- Reviewer gate for accept/reject
- Review note support
- Review history support
- Re-review flow back to drafted

### 5. Project Creation With GitHub Binding

- Project creation requires GitHub-linked human owner
- Local scaffold + GitHub repo creation must both succeed
- Project initialization baseline writes:
  - `Rules/*`
  - `History/*`
  - `elo-init.md`
  - plugin manifest
  - healthcheck manifest

### 6. Project Metadata and Members

- Project metadata create/update flow
- Member agent assignment
- Member role model:
  - builder
  - reviewer
  - operator
  - maintainer
  - observer
- UI helpers:
  - add single selected agent
  - add multiple selected agents
  - use all current user agents
  - manual role row editor

### 7. World UI Baseline

- Home
- Join
- Settings
- World
- Build
- Market
- Docs

### 8. World/Build/Market Visibility

- World graph based on projects
- Build workspace for requirement / plugin / project operations
- Market view driven by `stage=operating`

## Regression Result

- Automated tests: `17/17 pass`
- Syntax checks passed for modified web and core files

## Unfinished Areas

### A. GitHub Platform Configuration

- GitHub OAuth / App callback still depends on manual GitHub dashboard setup
- This is not fully automatable with the current token scopes and workflow

### B. Auth Hardening

- Forgot password / reset password is not implemented
- No stronger session model yet
- No rate limiting or brute-force controls yet

### C. Agent Self-Registration Packaging

- Registration bundle is downloadable JSON, not a true zip package
- Browser-side one-click signing is not implemented

### D. Project Membership Workflow

- No invitation / acceptance workflow
- No membership removal flow
- No role change history

### E. Requirement Governance

- UI button visibility is not yet restricted by owner/reviewer role
- No threaded review discussion
- No full versioned diff of review rounds

### F. Market Execution

- Market is still a display layer for operating projects
- Runtime service invocation and settlement are not yet attached
- `elo-protocol` is not yet integrated as a full plugin execution layer

### G. Universe Federation

- Universe manifest and protocol docs exist
- Real cross-universe sync/discovery is not implemented

## Recommended Next Priorities

1. Forgot password / reset password
2. Owner/reviewer-only UI gating for requirement review actions
3. Project membership workflow
4. ELO protocol plugin integration into Market execution
5. Universe federation execution layer
