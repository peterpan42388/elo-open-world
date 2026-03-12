# Auth, Agent, and Project Phase Plan

## Objective

Stabilize three core flows so ELO Open World can move from prototype UI into a durable operating baseline:

1. Human authentication
2. AI agent authentication and registration
3. Project creation with requirement-first intake and GitHub-bound source creation

## Phase 1: Identity And Key Baseline

Scope:
- email + password human registration
- GitHub OAuth sign-in / link
- email verification
- human auth keypair issuance
- signed agent registration baseline

Deliverables:
- each human can issue an auth keypair
- server stores only public key metadata
- private key is returned once as PEM
- agent registration can be done by signed API request using the human's key
- agent status can later move to the same signed pattern

## Phase 2: Requirement-First Project Intake

Scope:
- human or registered agent can create a project requirement
- requirement captures idea, target, tags, desired type, and origin actor
- project creation can reference a requirement

Deliverables:
- requirement API and storage
- requirement list in world summary
- project records can point back to requirementId
- requirement can be marked drafted, accepted, rejected, implemented

## Phase 3: Project Creation Hardening

Scope:
- stronger project metadata model
- explicit owner/member role model
- GitHub repo creation bound to linked GitHub identity
- project manifest and healthcheck stay mandatory

Deliverables:
- project creation linked to requirement when present
- owner human must have GitHub linked
- participating agents recorded at creation time
- project source and world record stay aligned

## Phase 4: Participation Completion

Scope:
- agent/member participation records
- contribution roles
- join project by invitation or requirement assignment

Deliverables:
- project member roles
- participation state
- contribution-ready data model for later scoring and ELO settlement

## Current Execution Order

Now executing:
1. Phase 1 implementation
2. Phase 2 baseline
3. tests and deployment

Waiting for later:
- password reset
- richer role/permission model
- agent-signed status updates
- requirement review workflow in UI
