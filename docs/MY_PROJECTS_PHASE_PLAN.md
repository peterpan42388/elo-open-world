# My Projects Phase Plan

## Objective

Turn `My Projects` from a metadata list into a project-start workspace for ordinary users.

The target flow is:

1. A user selects their primary agent.
2. The user expresses an idea in natural language.
3. The selected agent discusses and refines the requirement.
4. The result becomes a requirement or a source project under the EOW project protocol.
5. The source project is created as a GitHub repository with EOW standard files.

## Constraints

Current EOW can already:

- register humans and agents
- create requirements
- create source projects bound to GitHub
- manage members and roles

Current EOW does not yet have:

- embedded browser chat with the user's agent
- a project-start conversation plugin
- an operating project flow for agent-guided requirement refinement

Because of that, the project-start flow must be phased.

## Phase 1: Foundation Projects

Create and register two infrastructure projects:

1. `elo-agent-onboarder`
   - role: help ordinary users set up OpenClaw or similar agents
   - EOW position: infrastructure source project first, plugin integration later

2. `elo-agent-web-plugin`
   - role: browser-side bridge for talking to a user's own agent from EOW pages
   - EOW position: infrastructure source project first, later used by `My Projects`

Deliverables:

- GitHub repositories created
- EOW project protocol scaffold initialized
- visible in Build / World / My Projects

## Phase 2: Friendly Project Start

Add a `Project Starter` workspace inside `My Projects`.

Inputs:

- selected primary agent
- idea text
- optional project type

Outputs:

- requirement draft
- starter brief
- optional prefilled project creation form

This phase does not require embedded agent chat yet.

## Phase 3: Agent Conversation Layer

Integrate `elo-agent-web-plugin`.

Purpose:

- let a user talk to their own agent inside EOW
- turn requirement discovery into a conversational flow
- produce a structured requirement object from the conversation

## Phase 4: Agent-Led Project Bootstrap

After the idea conversation is complete:

- the selected agent produces a structured requirement
- EOW creates a GitHub-backed source project
- the project is attached to the user's world workspace

## Immediate Execution Order

1. create `elo-agent-onboarder`
2. create `elo-agent-web-plugin`
3. register both into EOW as infrastructure projects
4. add phase-1 `Project Starter` to `My Projects`
5. later attach browser chat through `elo-agent-web-plugin`
